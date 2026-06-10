"""
Design Vision Doc — one visual identity per PRD batch.

Spec: docs/specs/design-vision-doc.md

Select 2+ PRDs → generate one Design Vision document (positioning, experience
principles, CSS design tokens, screen inventory) stored as an editable Library
article, plus a BFL moodboard. Each batch PRD gains a Design section and the
token sheet in metadata so MCP serves it to implementing agents.
"""

import json
import logging
from datetime import datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, Seed
from app.weaviate_client import weaviate_client

logger = logging.getLogger(__name__)

VISION_DOC_PROMPT = """You are a founding product designer. Write a Design Vision Doc for a product
composed of the PRDs below — ONE coherent visual identity that a coding agent can follow.

Use exactly this markdown structure:

# <Product Name> — Design Vision

## Positioning
<2-3 sentences: what this product feels like and for whom. Name the emotional register.>

## Experience Principles
<4-6 bold-titled bullets, each principle followed by one sentence of what it forbids, e.g.
"**Calm density** — information-rich screens without visual noise; forbids decorative gradients.">

## Visual Language
<Concrete commitments: typography roles (display/body/UI with real font suggestions), color
strategy (one accent discipline), spacing rhythm, corner radius character, motion rules.
When repository context is given, adopt its existing tokens/conventions instead of inventing new ones.>

## Key Screens
<For EVERY PRD in the batch: one line per major screen — name, purpose, signature element.>

## Anti-Patterns
<3-4 bullets: what this product must never look like.>

Rules: specific over tasteful-vague; 400-700 words; commit (no "consider using")."""

TOKENS_PROMPT = """Derive a design-token sheet from this Design Vision Doc. Reply with ONLY valid JSON:
{"color": {"bg": "#hex", "surface": "#hex", "ink": "#hex", "ink-muted": "#hex", "accent": "#hex", "accent-deep": "#hex"},
 "type": {"display": "<font stack>", "body": "<font stack>", "ui": "<font stack>"},
 "spacing": [4, 8, 12, 16, 24, 32],
 "radius": {"sm": "<px>", "md": "<px>", "lg": "<px>"}}
All colors as hex. Honor the doc's commitments exactly."""

MOODBOARD_STYLE = (
    "Professional product design moodboard, flat vector style, clean 2x3 grid on white: "
    "color palette swatches with hex labels, a typography specimen card, one abstract app "
    "screen impression, one UI component cluster (buttons, cards, input), a spacing/radius "
    "study, and one texture/mood tile. Single accent color discipline. "
    "STRICTLY NO photorealism, 3D, gradients, or people. Brief: "
)

REQUIRED_TOKEN_KEYS = {"color", "type", "spacing", "radius"}


def _tokens_to_css(tokens: dict) -> str:
    lines = [":root {"]
    for k, v in (tokens.get("color") or {}).items():
        lines.append(f"  --color-{k}: {v};")
    for k, v in (tokens.get("type") or {}).items():
        lines.append(f"  --font-{k}: {v};")
    for i, v in enumerate(tokens.get("spacing") or []):
        lines.append(f"  --space-{i + 1}: {v}px;")
    for k, v in (tokens.get("radius") or {}).items():
        v = str(v)
        lines.append(f"  --radius-{k}: {v if v.endswith('px') else v + 'px'};")
    lines.append("}")
    return "\n".join(lines)


def _extract_principles(doc: str, n: int = 3) -> list[str]:
    out = []
    for line in doc.split("\n"):
        line = line.strip()
        if line.startswith(("- **", "* **")) and "—" in line:
            out.append(line.lstrip("-* ").split("—")[0].strip().strip("*"))
        if len(out) >= n:
            break
    return out


def generate_design_vision(seed_ids: list[str], user: User, db: Session) -> dict:
    """Generate the vision doc + tokens, store as a Library article, stamp the PRDs."""
    from app.briefings import _call_llm

    seeds = db.query(Seed).filter(
        Seed.id.in_([UUID(s) for s in seed_ids]),
        Seed.tenant_id == user.tenant_id,
    ).all()
    if len(seeds) < 2:
        return {"status": "error", "reason": "need_at_least_2_prds"}

    prd_ctx = "\n\n---\n\n".join(
        f"PRD: {s.title}\n{(s.content or '')[:1200]}" for s in seeds
    )[:7000]

    repo_ctx = ""
    try:
        from app.github_sync import get_repo_map_for_tenant
        rm = get_repo_map_for_tenant(str(user.tenant_id), db)
        if rm:
            repo_ctx = f"\n\nREPOSITORY CONTEXT (adopt its existing UI conventions):\n{rm[:6000]}"
    except Exception:
        pass

    doc = _call_llm(f"PRD BATCH:\n\n{prd_ctx}{repo_ctx}\n\nWrite the Design Vision Doc now.",
                    system=VISION_DOC_PROMPT, max_tokens=5000, model=settings.CHAT_MODEL)
    if not doc or len(doc) < 400:
        return {"status": "error", "reason": "doc_generation_failed"}

    # Token sheet: strict JSON, one retry, ship without on repeated failure
    tokens, tokens_css = None, ""
    for _ in range(2):
        raw = _call_llm(doc[:8000], system=TOKENS_PROMPT, max_tokens=1500, model=settings.CHAT_MODEL)
        try:
            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            cand = json.loads(cleaned)
            if REQUIRED_TOKEN_KEYS.issubset(cand.keys()):
                tokens = cand
                tokens_css = _tokens_to_css(tokens)
                break
        except Exception:
            continue

    title_line = next((l for l in doc.split("\n") if l.startswith("# ")), "")
    title = title_line.lstrip("# ").strip() or "Design Vision"
    full_doc = doc + (f"\n\n## Design Tokens\n```css\n{tokens_css}\n```\n" if tokens_css else "\n\n*Design tokens: generation failed — regenerate.*\n")

    summary = next((l.strip() for l in doc.split("\n") if l.strip() and not l.startswith("#")), "")[:300]
    article_id = weaviate_client.add_wiki_article(
        tenant_id=str(user.tenant_id),
        user_id=str(user.id),
        title=title,
        category="Design Vision",
        summary=summary,
        content=full_doc,
        source_seed_ids=",".join(str(s.id) for s in seeds),
        status="published",
    )

    # Moodboard (best-effort — BFL is allowed to fail without blocking the doc)
    try:
        import asyncio
        from app.main import <BFL_API_KEY>
        brief = (doc.split("## Visual Language")[1][:600] if "## Visual Language" in doc else doc[:600])
        url = asyncio.run(<BFL_API_KEY>(MOODBOARD_STYLE + brief, width=1408, height=1024))
        weaviate_client.update_wiki_article(article_id, imageUrl=url)
    except Exception as e:
        logger.warning(f"[design_vision] moodboard failed: {e}")

    # Stamp every PRD: Design section + tokens in metadata (served over MCP)
    principles = _extract_principles(doc)
    for s in seeds:
        m = dict(s.seed_metadata or {})
        m["design_vision_id"] = article_id
        m["design_vision_title"] = title
        if tokens_css:
            m["design_tokens_css"] = tokens_css
        s.seed_metadata = m
        if "## Design" not in (s.content or ""):
            section = (
                f"\n\n## Design\nFollows the batch Design Vision **{title}** (Library). "
                + ("Key principles: " + "; ".join(principles) + "." if principles else "")
                + (" The design-token sheet ships with this spec via MCP." if tokens_css else "")
            )
            s.content = (s.content or "") + section
    db.commit()

    logger.info(f"[design_vision] '{title}' created for {len(seeds)} PRDs (tokens: {'ok' if tokens_css else 'missing'})")
    return {"status": "ok", "article_id": article_id, "title": title,
            "tokens": "ok" if tokens_css else "missing", "prds": len(seeds)}
