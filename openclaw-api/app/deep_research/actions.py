"""Brief → action (P0, docs/specs/research-roadmap.md).

Closes the research→build loop: from a Deep Research brief seed, one call turns
the named gap into a Studio PRD, or spawns a follow-up run scoped to the gap.
"""
import logging
import re as _uuidless_re
import uuid as _uuid
from datetime import datetime

logger = logging.getLogger(__name__)


def _load_brief(seed_id: str, user, db):
    from app.models import Seed
    seed = db.query(Seed).filter(Seed.id == _uuid.UUID(str(seed_id)),
                                 Seed.tenant_id == user.tenant_id).first()
    if not seed:
        return None, "", ""
    content = seed.content or ""
    m = _uuidless_re.search(r"##\s*The Gap\s*\n+(.+?)(?:\n##|\Z)", content, _uuidless_re.DOTALL)
    gap = (m.group(1).strip() if m else "")
    return seed, gap, content


async def brief_to_prd(seed_id: str, user, db) -> dict:
    """Generate a Studio PRD grounded in the brief's gap + findings, via write_spec."""
    from app.briefings import _call_llm
    from app.config import settings
    from app.tool_executor import write_spec

    seed, gap, content = _load_brief(seed_id, user, db)
    if not seed:
        return {"status": "error", "message": "brief not found"}
    focus = (seed.seed_metadata or {}).get("focus") or seed.title.replace("Research Brief — ", "")

    prompt = f"""Turn the GAP identified in this research brief into a concrete, buildable PRD.
Ground every requirement in the brief's evidence; do not invent scope.

FOCUS: {focus}
THE GAP TO CLOSE:
{gap or "(see brief)"}

RESEARCH BRIEF (evidence + cited sources):
{content[:12000]}

Write a complete PRD in markdown: a one-line problem statement, Problem Alignment,
Solution Summary, Scope & Requirements, Success Metrics, Milestones, and Open
Questions. Keep it engineering-grade and specific to closing the gap above."""
    prd_md = _call_llm(prompt, system="You write rigorous, buildable PRDs. Markdown only.",
                       max_tokens=2600, model=settings.PREMIUM_MODEL)
    if not prd_md or len(prd_md.strip()) < 120:
        return {"status": "error", "message": "PRD generation produced no content"}

    title = f"{focus[:80]} — PRD"
    res = await write_spec({"title": title, "content": prd_md.strip(),
                            "tags": ["prd", "spec", "from-research"], "force": True}, user, db)
    import json as _json
    try:
        data = _json.loads(res)
    except Exception:
        data = {"status": "error", "message": "write_spec failed"}
    data["from_brief"] = str(seed.id)
    return data


def brief_deeper(seed_id: str, user, db) -> dict:
    """Spawn a follow-up Deep Research run scoped to the brief's gap."""
    from app.models import Seed, ResearchRun
    seed, gap, content = _load_brief(seed_id, user, db)
    if not seed:
        return {"status": "error", "message": "brief not found"}
    parent_run_id = (seed.seed_metadata or {}).get("run_id")
    # Scope the follow-up to the gap (first sentence) so the APIs are queried on it.
    focus = (gap.split(". ")[0].strip() if gap else "")[:200] or seed.title.replace("Research Brief — ", "")[:200]

    run = ResearchRun(
        id=_uuid.uuid4(), tenant_id=user.tenant_id, user_id=user.id,
        theme=focus, status="queued", engine="worker", mode="deep",
        parent_run_id=_uuid.UUID(parent_run_id) if parent_run_id else None,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    try:
        from app.task_broker import enqueue_deep_research
        enqueue_deep_research(str(run.id), str(user.tenant_id))
    except Exception as e:
        logger.warning(f"[deep_research] deeper enqueue failed ({e}) — inline")
        try:
            from app.deep_research.orchestrator import run_deep_research
            run_deep_research(str(run.id), db)
        except Exception as e2:
            logger.error(f"[deep_research] deeper inline run failed: {e2}")
    return {"status": "ok", "run_id": str(run.id), "focus": focus}
