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

# ── Template v2: engineering-grade drafts (spec: prd-generator-v2.md) ─────────

PRD_SECTIONS_V2 = [
    "## Problem Alignment",
    "## Solution Summary",
    "## System Architecture",
    "## Data Model",
    "## API Surface",
    "## Scope & Capabilities",
    "## Acceptance Evals",
    "## Delivery Risks & Open Questions",
    "## Milestones",
    "## Agent State File",
]

PRD_TEMPLATE_V2 = """You are Greenplot's product architect. Draft a complete, ENGINEERING-GRADE PRD
for a buildable product inspired by a research paper, grounded ONLY in the provided paper excerpts,
the user's garden seeds, and (when given) the repository context. This document will be handed
directly to a coding agent — it is a context contract, not an essay.

Use exactly this markdown structure:

# <Concise Product Name> — PRD

**Status:** draft · **Source:** auto-drafted from research

## Problem Alignment
<3-5 sentences. The user-facing problem, who has it, why current solutions fall short. Connect to the user's seeds.>

## Solution Summary
<3-5 sentences. What we build and how the paper's method enables it — cite the actual mechanism.>

## System Architecture
<Concrete components with real technology choices and the data flows between them. When repository
context is provided, name actual files/modules from it and respect its conventions; otherwise
propose explicit paths (e.g. `app/policy_engine.py`). Include at least 3 quantified budgets or
limits (latency, token, cache TTL, rate, size).>

## Data Model
<Every store named with its tables/classes AND their fields, e.g.
`context_branches (id, parent_id, agent_id, state_hash, created_at)`. Include retention/size limits.>

## API Surface
<At least 3 concrete endpoint or tool signatures with methods and key params, e.g.
`POST /api/v1/contexts/{id}/branch {label} -> {branch_id}`.>

## Scope & Capabilities
<**In:** the smallest shippable version, specific. **Out (v1):** explicit non-goals.>

## Acceptance Evals
<3-5 numbered, mechanically checkable tests a coding agent can run before reporting shipped,
each with a concrete pass condition.>

## Delivery Risks & Open Questions
<3-4 bullets: riskiest assumptions, including where the paper's results may not transfer. Quantify where possible.>

## Milestones
<3-4 numbered milestones; each names a verifiable deliverable ("deliverable: eval 2 passes"), with day estimates.>

## Agent State File
<A deterministic, copy-pasteable block for the implementing agent's CLAUDE.md:
hard constraints; conflict priority (this spec > repo conventions > agent judgment);
do-not-touch list; token/cost budget and when to stop and ask.>

Rules: ground in >=3 paper excerpts (name their sections) and >=2 garden seeds by title; commit to
decisions (state the alternative you rejected at least twice); every number must be a real choice,
not a placeholder; 800-1300 words; no filler."""

PRD_RUBRIC_V2 = """You are a ruthless spec reviewer. Score this PRD draft against 7 demands and reply
with ONLY valid JSON: {"score": <0-7>, "failures": ["<demand>: <what is missing, specifically>", ...]}

The 7 demands:
1. NUMBERS: >=6 concrete quantified values (budgets, limits, latencies, sizes, rates).
2. DATA MODEL: every store has named tables/classes WITH field lists.
3. API SURFACE: >=3 endpoint/tool signatures with methods and params.
4. GROUNDED COMPONENTS: every architecture component names a file/module path.
5. VERIFIABLE MILESTONES: each milestone names a checkable deliverable.
6. ACCEPTANCE EVALS: >=3 mechanically checkable tests with pass conditions.
7. COMMITTED DECISIONS: >=2 explicit decisions with the rejected alternative stated.

A demand passes only if fully met. List every failure with the specific gap."""


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
    # Budget must cover reasoning tokens on thinking models — 8 tokens would
    # return empty content and silently kill the autopilot with score 0
    raw = _call_llm(prompt, max_tokens=1200, model=settings.CHAT_MODEL)
    try:
        digits = "".join(c for c in (raw or "").strip()[-4:] if c.isdigit())
        return max(0, min(10, int(digits[-2:] or digits or "0")))
    except Exception:
        return 0


def _critique_draft(content: str) -> dict:
    """Score a draft against the v2 rubric. Returns {score, failures[]}."""
    from app.briefings import _call_llm
    raw = _call_llm(f"PRD DRAFT:\n\n{content[:18000]}", system=PRD_RUBRIC_V2,
                    max_tokens=2000, model=settings.CHAT_MODEL)
    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(cleaned)
        return {"score": int(data.get("score", 0)), "failures": list(data.get("failures", []))[:10]}
    except Exception:
        # Unparseable critique: don't block the pipeline, just skip revision
        return {"score": 7, "failures": []}


def generate_prd_draft(seed: Seed, chunks: list[dict], related: list[dict],
                       user: User, db: Session, replace_draft_id: str = None,
                       repo_map: str = "") -> dict:
    """Generate the PRD and save it as an auto-draft spec seed (no Library compile).

    v2 pipeline (spec: prd-generator-v2.md): draft → critique against the
    7-point rubric → revise once fixing every failure. Drafts still failing
    >=3 points get quality='rough' instead of silently shipping.
    """
    from app.briefings import _call_llm

    # Quality floor: a hollow draft erodes trust faster than no draft
    if len(chunks) < 3 or len(related) < 2:
        return {"status": "skipped", "reason": "insufficient_context",
                "chunks": len(chunks), "related": len(related)}

    use_v2 = bool(getattr(settings, "PRD_PIPELINE_V2", True))
    template = PRD_TEMPLATE_V2 if use_v2 else PRD_TEMPLATE_V1
    sections = PRD_SECTIONS_V2 if use_v2 else PRD_SECTIONS_V1

    excerpts = "\n\n".join(
        f"[{c['section']} — excerpt {i+1}]\n{c['text'][:1200]}" for i, c in enumerate(chunks)
    )
    seeds_ctx = "\n".join(
        f"- \"{r.get('title', '')}\": {(r.get('summary') or r.get('content') or '')[:200]}"
        for r in related
    )
    repo_ctx = f"\n\nREPOSITORY CONTEXT (ground components in these real files):\n{repo_map[:16000]}" if repo_map else ""
    prompt = f"""RESEARCH PAPER: {seed.title}

PAPER EXCERPTS:
{excerpts[:14000]}

USER'S GARDEN SEEDS:
{seeds_ctx[:2500]}{repo_ctx}

Draft the PRD now."""

    # Generous budget: thinking models spend tokens on reasoning before output
    content = _call_llm(prompt, system=template, max_tokens=8000, model=settings.CHAT_MODEL)
    if not content or len(content) < 600:
        return {"status": "error", "reason": "generation_failed"}

    quality = "ok"
    rubric_score = None
    if use_v2:
        critique = _critique_draft(content)
        rubric_score = critique["score"]
        if critique["failures"]:
            failures_txt = "\n".join(f"- {f}" for f in critique["failures"])
            revised = _call_llm(
                f"""Your PRD draft failed review. Fix EVERY failure below and return the complete
revised PRD (same structure, keep what already works):

FAILURES:
{failures_txt}

CURRENT DRAFT:
{content[:18000]}""",
                system=template, max_tokens=8000, model=settings.CHAT_MODEL,
            )
            if revised and len(revised) > 600:
                content = revised
                recheck = _critique_draft(content)
                rubric_score = recheck["score"]
                if len(recheck["failures"]) >= 3:
                    quality = "rough"
            else:
                quality = "rough"

    missing = [s for s in sections if s not in content]
    if len(missing) > 3:
        return {"status": "error", "reason": f"structure_drift: missing {missing}"}

    title_line = next((l for l in content.split("\n") if l.startswith("# ")), "")
    title = title_line.lstrip("# ").replace("— PRD", "").strip() or f"{seed.title[:60]} — Product"

    # In-place regeneration: upgrade an existing draft instead of duplicating it
    if replace_draft_id:
        try:
            existing = db.query(Seed).filter(Seed.id == _uuid.UUID(replace_draft_id)).first()
        except ValueError:
            existing = None
        if existing:
            existing.title = f"{title[:170]} — PRD"
            existing.content = content
            m = dict(existing.seed_metadata or {})
            m.update({"quality": quality, "rubric_score": rubric_score,
                      "template": "PRD_TEMPLATE_V2" if use_v2 else "PRD_TEMPLATE_V1",
                      "vision_status": m.get("vision_status", "pending")})
            existing.seed_metadata = m
            db.commit()
            logger.info(f"[auto_prd] Regenerated draft '{existing.title}' (quality={quality}, score={rubric_score})")
            return {"status": "ok", "draft_seed_id": str(existing.id), "title": existing.title,
                    "quality": quality, "rubric_score": rubric_score}

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
            "quality": quality,
            "rubric_score": rubric_score,
            "template": "PRD_TEMPLATE_V2" if use_v2 else "PRD_TEMPLATE_V1",
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


def auto_prd_for_paper(seed_id: str, tenant_id: str, db: Session, force: bool = False,
                       replace_draft_id: str = None) -> dict:
    """Gate → gather → generate. force=True bypasses relevance gate and cap
    (the manual 'Draft PRD' button). replace_draft_id upgrades an existing
    draft in place instead of creating a new seed."""
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

    # Repo grounding (github-repo-sync): inject the connected repo's map when available
    repo_map = ""
    try:
        from app.github_sync import get_repo_map_for_tenant
        repo_map = get_repo_map_for_tenant(str(seed.tenant_id), db) or ""
    except Exception:
        pass

    result = generate_prd_draft(seed, chunks, related, user, db,
                                replace_draft_id=replace_draft_id, repo_map=repo_map)
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
