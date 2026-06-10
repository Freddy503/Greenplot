"""
Auto-PRD pipeline — papers to draft PRDs on autopilot.

Spec: docs/specs/auto-prd-pipeline.md

When a digest paper finishes parsing, a relevance gate scores it against the
user's garden; high-scoring papers (capped per day) get a full gstack-structured
PRD draft generated from the paper's actual chunks plus related seeds. Drafts
land in the Studio drafts strip marked AUTO with vision_status='pending' —
the user shapes the vision in spec-mode chat, never the system.
"""

import json
import logging
import uuid as _uuid
from datetime import datetime, date

from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, Seed
from app.weaviate_client import weaviate_client

logger = logging.getLogger(__name__)

RELEVANCE_THRESHOLD = 7
DAILY_CAP = int(getattr(settings, "AUTO_PRD_DAILY_CAP", 3) or 3)

# Versioned template — tests assert these six headers appear in output.
PRD_SECTIONS_V1 = [
    "## Problem Alignment",
    "## Solution Summary",
    "## System Architecture",
    "## Scope & Capabilities",
    "## Delivery Risks & Open Questions",
    "## Milestones",
]

PRD_TEMPLATE_V1 = """You are Greenplot's product architect. Draft a complete PRD for a buildable
product/feature inspired by a research paper, grounded ONLY in the provided paper excerpts and
the user's existing garden seeds. Use exactly this markdown structure:

# <Concise Product Name> — PRD

**Status:** draft · **Source:** auto-drafted from research

## Problem Alignment
<3-5 sentences: the user-facing problem, who has it, why current solutions fall short.
Connect explicitly to the user's garden seeds where relevant.>

## Solution Summary
<3-5 sentences: what we build and how the paper's method enables it. Cite the paper's
actual mechanism, not just its topic.>

## System Architecture
<Concrete components (services, data stores, external APIs, frontend surfaces), the data
flows between them, and the stack. Name real technologies. This section doubles as the
brief for an auto-generated architecture diagram.>

## Scope & Capabilities
<**In:** the smallest shippable version. **Out (v1):** explicit non-goals.>

## Delivery Risks & Open Questions
<3-4 bullets: the riskiest assumptions, including where the paper's results may not
transfer to production.>

## Milestones
<3-4 numbered milestones with rough day estimates.>

Rules: quote or closely paraphrase at least 3 of the paper excerpts (mention section names);
reference at least 2 of the user's seeds by title; be specific and technical; no filler;
total length 500-800 words."""


def _embed(text: str):
    from app.enricher_v2 import embed_text
    return embed_text(text)


def _todays_auto_draft_count(db: Session, tenant_id) -> int:
    rows = db.query(Seed.seed_metadata).filter(
        Seed.tenant_id == tenant_id,
        Seed.created_at >= datetime.combine(date.today(), datetime.min.time()),
    ).all()
    return sum(1 for (m,) in rows if isinstance(m, dict) and m.get("auto_generated"))


def _gather_context(seed: Seed, tenant_id: str) -> tuple[list[dict], list[dict]]:
    """Top paper chunks (method/results weighted) + related garden seeds."""
    title_emb = _embed(f"{seed.title}\nmethod results approach")
    chunks = weaviate_client.search_paper_chunks(
        tenant_id=tenant_id, embedding=title_emb, seed_id=str(seed.id), limit=8
    )
    related = weaviate_client.search_seeds(
        tenant_id=tenant_id, embedding=_embed(seed.title), limit=6
    )
    # Drop the paper itself from related seeds
    related = [r for r in related if (r.get("title") or "").strip().lower() != (seed.title or "").strip().lower()][:5]
    return chunks, related


def sco<RESEND_API_KEY>(seed: Seed, related: list[dict], user: User) -> int:
    """0-10: how strongly does this paper connect to what the user is building?"""
    from app.briefings import _call_llm
    interests = ", ".join(user.interests or []) or "technology, AI, product building"
    related_titles = "\n".join(f"- {r.get('title', '')}" for r in related[:5]) or "- (no related seeds)"
    digest_desc = (seed.content or "")[:900]
    prompt = f"""Rate 0-10 how strongly this research paper connects to this user's active work.

USER INTERESTS: {interests}

USER'S RELATED GARDEN SEEDS:
{related_titles}

PAPER ({seed.title}):
{digest_desc}

10 = directly extends something they are building; 7 = clear product opportunity in their
domains; 4 = interesting but tangential; 0 = unrelated. Reply with ONLY the integer."""
    raw = _call_llm(prompt, max_tokens=8, model=settings.CHAT_MODEL)
    try:
        return max(0, min(10, int("".join(c for c in raw if c.isdigit())[:2] or "0")))
    except Exception:
        return 0


def generate_prd_draft(seed: Seed, chunks: list[dict], related: list[dict],
                       user: User, db: Session) -> dict:
    """Generate the PRD and save it as an auto-draft spec seed (no Library compile)."""
    from app.briefings import _call_llm

    # Quality floor: a hollow draft erodes trust faster than no draft
    if len(chunks) < 3 or len(related) < 2:
        return {"status": "skipped", "reason": "insufficient_context",
                "chunks": len(chunks), "related": len(related)}

    excerpts = "\n\n".join(
        f"[{c['section']} — excerpt {i+1}]\n{c['text'][:1200]}" for i, c in enumerate(chunks)
    )
    seeds_ctx = "\n".join(
        f"- \"{r.get('title', '')}\": {(r.get('summary') or r.get('content') or '')[:200]}"
        for r in related
    )
    prompt = f"""RESEARCH PAPER: {seed.title}

PAPER EXCERPTS:
{excerpts[:14000]}

USER'S GARDEN SEEDS:
{seeds_ctx[:2500]}

Draft the PRD now."""

    content = _call_llm(prompt, system=PRD_TEMPLATE_V1, max_tokens=2200, model=settings.CHAT_MODEL)
    if not content or len(content) < 600:
        return {"status": "error", "reason": "generation_failed"}
    missing = [s for s in PRD_SECTIONS_V1 if s not in content]
    if len(missing) > 2:
        return {"status": "error", "reason": f"structure_drift: missing {missing}"}

    title_line = next((l for l in content.split("\n") if l.startswith("# ")), "")
    title = title_line.lstrip("# ").replace("— PRD", "").strip() or f"{seed.title[:60]} — Product"

    draft = Seed(
        id=_uuid.uuid4(),
        tenant_id=user.tenant_id,
        user_id=user.id,
        title=f"{title[:170]} — PRD",
        content=content,
        seed_type="spec",
        created_by="agent_auto_prd",
        created_via="auto_prd",
        seed_metadata={
            "tags": ["prd", "spec", "auto"],
            "seed_type": "spec",
            "auto_generated": True,
            "source_paper_id": str(seed.id),
            "source_paper_title": seed.title,
            "build_status": "draft",
            "vision_status": "pending",
            "template": "PRD_TEMPLATE_V1",
        },
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)

    # Index in Weaviate (best-effort) so search/graph see it
    try:
        weaviate_client.add_seed(
            tenant_id=str(user.tenant_id),
            user_id=str(user.id),
            thought_id=None,
            title=draft.title,
            content=content,
            embedding=_embed(f"{draft.title}\n{content[:500]}"),
            metadata=draft.seed_metadata,
            image_url=None,
            created_at=draft.created_at.isoformat(),
        )
    except Exception as e:
        logger.warning(f"[auto_prd] Weaviate index failed for draft {draft.id}: {e}")

    logger.info(f"[auto_prd] Drafted '{draft.title}' from paper '{seed.title[:50]}'")
    return {"status": "ok", "draft_seed_id": str(draft.id), "title": draft.title}


def auto_prd_for_paper(seed_id: str, tenant_id: str, db: Session, force: bool = False) -> dict:
    """Gate → gather → generate. force=True bypasses relevance gate and cap
    (the manual 'Draft PRD' button)."""
    from uuid import UUID
    seed = db.query(Seed).filter(Seed.id == UUID(seed_id)).first()
    if not seed:
        return {"status": "error", "reason": "seed_not_found"}
    user = db.query(User).filter(User.id == seed.user_id).first()
    if not user:
        return {"status": "error", "reason": "user_not_found"}

    meta = dict(seed.seed_metadata or {})

    def _mark(value: str):
        m = dict(seed.seed_metadata or {})
        m["auto_prd"] = value
        seed.seed_metadata = m
        db.commit()

    if meta.get("auto_prd") == "drafted" and not force:
        return {"status": "skipped", "reason": "already_drafted"}

    if not force:
        if not bool(getattr(settings, "AUTO_PRD_ENABLED", True)):
            return {"status": "skipped", "reason": "disabled"}
        if _todays_auto_draft_count(db, seed.tenant_id) >= DAILY_CAP:
            _mark("skipped_daily_cap")
            return {"status": "skipped", "reason": "daily_cap"}

    chunks, related = _gather_context(seed, tenant_id)

    if not force:
        score = sco<RESEND_API_KEY>(seed, related, user)
        if score < RELEVANCE_THRESHOLD:
            _mark(f"skipped_low_relevance_{score}")
            return {"status": "skipped", "reason": "low_relevance", "score": score}

    result = generate_prd_draft(seed, chunks, related, user, db)
    if result.get("status") == "ok":
        m = dict(seed.seed_metadata or {})
        m["auto_prd"] = "drafted"
        m["draft_prd_id"] = result["draft_seed_id"]
        m["draft_prd_title"] = result.get("title", "")
        seed.seed_metadata = m
        db.commit()
    elif result.get("status") == "skipped":
        _mark(f"skipped_{result.get('reason', 'unknown')}")
    else:
        # Mark errors too — the UI polls this to distinguish failure from in-progress
        _mark(f"error_{result.get('reason', 'unknown')}")
    return result


def build_draft_roundup(user_id: str, db: Session) -> list[dict]:
    """Untouched auto-drafts older than 7 days — for the weekly review digest.
    Also archives drafts untouched for 30+ days."""
    from datetime import timedelta
    now = datetime.utcnow()
    rows = db.query(Seed).filter(
        Seed.user_id == user_id,
        (Seed.archived == False) | (Seed.archived == None),
    ).all()
    pending = []
    for s in rows:
        m = s.seed_metadata or {}
        if not (isinstance(m, dict) and m.get("auto_generated") and m.get("vision_status") == "pending"):
            continue
        age = now - (s.created_at or now)
        if age > timedelta(days=30):
            s.archived = True
            continue
        if age > timedelta(days=7):
            first_line = next((l.strip() for l in (s.content or "").split("\n")
                               if l.strip() and not l.startswith("#") and not l.startswith("**")), "")
            pending.append({"seed_id": str(s.id), "title": s.title, "problem": first_line[:180]})
    db.commit()
    return pending
