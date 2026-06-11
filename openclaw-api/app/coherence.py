"""
Coherence Report — the weekly convergence synthesis.

Spec: docs/specs/product-atlas.md (milestone 4)

One pass over the portfolio: contradictions between PRDs, per-pillar gaps,
merge suggestions, stale auto-drafts, and the story so far — delivered as a
Library article + one notification. The single home for findings (binding
anti-overwhelm rule 3): the UI stays calm, complexity gets digested here.
"""

import json
import logging
from datetime import date, datetime
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, Seed
from app.weaviate_client import weaviate_client

logger = logging.getLogger(__name__)

COHERENCE_PROMPT = """You are the product portfolio's editor-in-chief. Write a Coherence Report in
markdown with EXACTLY these sections:

## Story So Far
<One tight paragraph: what this product is, what shipped, what's in motion — plain english,
present tense. This becomes the product's living summary.>

## The Shape of the Portfolio
<2-4 sentences: how the PRDs cluster, which pillar carries the weight, where energy is going.>

## Contradictions & Overlaps
<Bullet list. Name PRD pairs that contradict each other or substantially overlap, with the
specific clash and a recommendation (merge / pick one / re-scope). If none: say so in one line.>

## Gaps
<Per pillar with no or weak coverage: what's missing and the highest-leverage PRD to draft.>

## Stale Drafts
<The provided stale auto-drafts: one line each — shape it, merge it, or archive it.>

## One Recommended Next Action
<A single, concrete action for this week. One sentence. Be opinionated.>

Rules: cite PRDs by exact title; be specific and decisive; no filler; 350-600 words total."""


def _gather_portfolio(user: User, db: Session) -> tuple[Seed | None, str]:
    products = db.query(Seed).filter(
        Seed.tenant_id == user.tenant_id, Seed.seed_type == "product").all()
    main = next((p for p in products if (p.seed_metadata or {}).get("rank") == "main"), None)
    if not main:
        return None, ""

    pm = main.seed_metadata or {}
    pillars = pm.get("pillars", [])
    pillar_names = {p["id"]: p["name"] for p in pillars}

    specs, orphans = [], []
    for s in db.query(Seed).filter(
        Seed.tenant_id == user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None),
    ).all():
        m = s.seed_metadata or {}
        if not isinstance(m, dict):
            continue
        is_spec = m.get("seed_type") == "spec" or "prd" in str(m.get("tags", "")).lower()
        if not is_spec or s.seed_type == "product":
            continue
        line = (f"- \"{s.title}\" | status={m.get('build_status', 'draft')} | "
                f"quality={m.get('quality', 'n/a')} | serves={m.get('serves', '—')}"
                + (f" | OVERLAPS: {m['overlaps'][0].get('title')}" if m.get("overlaps") else ""))
        if m.get("product_id") == str(main.id):
            pname = pillar_names.get(m.get("pillar_id"), "(no pillar)")
            specs.append(f"{line} | pillar={pname} | attachment={m.get('attachment', 'confirmed')}")
        else:
            orphans.append(line)

    coverage = []
    for p in pillars:
        n = sum(1 for s in specs if f"pillar={p['name']}" in s)
        coverage.append(f"- {p['name']} ({p.get('problem_facet', '')}): {n} PRD(s)")

    try:
        from app.auto_prd import build_draft_roundup
        stale = build_draft_roundup(str(user.id), db)
        stale_txt = "\n".join(f"- \"{d['title']}\": {d['problem']}" for d in stale) or "- (none)"
    except Exception:
        stale_txt = "- (unavailable)"

    backlog_txt = "\n".join(
        f"- {p.title}" for p in products if p.id != main.id) or "- (none)"

    context = f"""PRODUCT: {main.title}
PROBLEM: {pm.get('problem_statement', '')}
STORY SO FAR (previous): {pm.get('story_so_far', '(none)')}

PILLAR COVERAGE:
{chr(10).join(coverage)}

ATTACHED PRDs:
{chr(10).join(specs) or '- (none)'}

ORPHAN PRDs (serve no product):
{chr(10).join(orphans) or '- (none)'}

STALE AUTO-DRAFTS (untouched 7+ days):
{stale_txt}

BACKLOG PRODUCTS:
{backlog_txt}"""
    return main, context


def build_coherence_report(user: User, db: Session) -> dict:
    """Synthesize → Library article → rewrite the product's story line."""
    from app.briefings import _call_llm

    main, context = _gather_portfolio(user, db)
    if not main:
        return {"status": "skipped", "reason": "no_main_product"}

    report = _call_llm(f"PORTFOLIO:\n\n{context[:12000]}\n\nWrite the Coherence Report now.",
                       system=COHERENCE_PROMPT, max_tokens=4000, model=settings.CHAT_MODEL)
    if not report or len(report) < 300:
        return {"status": "error", "reason": "synthesis_failed"}

    today = date.today().isoformat()
    title = f"Coherence Report — {today}"
    summary = next((l.strip() for l in report.split("\n")
                    if l.strip() and not l.startswith("#")), "")[:300]
    article_id = weaviate_client.add_wiki_article(
        tenant_id=str(user.tenant_id),
        user_id=str(user.id),
        title=title,
        category="Coherence Report",
        summary=summary,
        content=report,
        source_seed_ids=str(main.id),
        status="published",
    )

    # Proper weekly rewrite of the living story (atlas rule 7)
    m = dict(main.seed_metadata or {})
    if "## Story So Far" in report:
        story_block = report.split("## Story So Far", 1)[1].split("##", 1)[0].strip()
        if story_block:
            m["story_so_far"] = story_block[:400]
    m["coherence_report_id"] = article_id
    m["coherence_status"] = "done"
    m["coherence_at"] = datetime.utcnow().isoformat()
    main.seed_metadata = m
    db.commit()

    logger.info(f"[coherence] report '{title}' for product '{main.title}'")
    return {"status": "ok", "article_id": article_id, "title": title}
