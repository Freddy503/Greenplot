"""Deep Research orchestrator.

Spec: docs/specs/deep-research-agents.md

A long-running job that fans out per-source "scouts" across the garden + arXiv +
OpenAlex + Hacker News + RSS, persists every finding to Postgres (durable +
resumable), then a gap-finder synthesizes the dots into a report that's emailed
+ pushed to the user and planted back in the garden.

Composed of three steps so both harnesses can drive them:
  - scope_run(run_id, db)        → themes
  - scout_one(run_id, source, themes, db)  → persists that source's findings
  - synthesize_and_report(run_id, db)      → LLM brief + seed + email + push

Phase 1 (Redis worker): run_deep_research() calls them sequentially.
Phase 2 (Temporal): the workflow runs scout_one as parallel activities, then
synthesize_and_report — same functions, durable execution. See temporal_worker.py.
"""
import asyncio
import logging
import re as _re
import uuid as _uuid
from datetime import datetime

logger = logging.getLogger(__name__)

# Garden = the user's own seeds; the rest are external.
EXTERNAL_SCOUTS = ["arxiv", "openalex", "hackernews", "rss"]
SCOUTS = ["garden"] + EXTERNAL_SCOUTS


def _set(db, run, status: str, **fields):
    run.status = status
    run.updated_at = datetime.utcnow()
    for k, v in fields.items():
        setattr(run, k, v)
    db.commit()


def _themes_for(run, db) -> list[str]:
    from app.briefings import fetch_user_themes
    themes = fetch_user_themes(str(run.user_id), db)
    if run.theme:
        themes = [run.theme] + [t for t in themes if t.lower() != run.theme.lower()]
    return themes


# ── Step 1: scope ─────────────────────────────────────────────────────────────

def scope_run(run_id: str, db) -> list[str]:
    from app.models import ResearchRun
    run = db.query(ResearchRun).filter(ResearchRun.id == _uuid.UUID(str(run_id))).first()
    if not run:
        return []
    _set(db, run, "scoping")
    themes = _themes_for(run, db)
    _set(db, run, "scouting")
    return themes


# ── Step 2: scouts (one source each, idempotent) ──────────────────────────────

async def _fetch_source(source: str, themes: list[str], user_id: str, db) -> list[dict]:
    """Return raw candidates for ONE source as {title,url,snippet}."""
    if source == "garden":
        from app.briefings import fetch_garden_context
        g = fetch_garden_context(user_id, themes, db) or []
        return [{"title": s.get("title", ""), "url": s.get("url", ""), "snippet": s.get("snippet", "")} for s in g[:12]]
    if source == "arxiv":
        from app.briefings import _fetch_arxiv_papers
        return await _fetch_arxiv_papers(themes, limit=8)
    # openalex | hackernews | rss → the dedicated generators
    from app.sources import openalex, hackernews, rss
    gen = {"openalex": openalex, "hackernews": hackernews, "rss": rss}.get(source)
    return await gen.discover(themes) if gen else []


def scout_one(run_id: str, source: str, themes: list[str], db) -> int:
    """Persist one source's findings. Idempotent: skips if already scouted."""
    from app.models import ResearchRun, ResearchFinding
    run = db.query(ResearchRun).filter(ResearchRun.id == _uuid.UUID(str(run_id))).first()
    if not run:
        return 0
    already = db.query(ResearchFinding).filter(
        ResearchFinding.run_id == run.id, ResearchFinding.source == source).count()
    if already:
        return already
    try:
        items = asyncio.run(_fetch_source(source, themes, str(run.user_id), db))
    except Exception as e:
        logger.warning(f"[deep_research] scout {source} failed for {run_id}: {e}")
        return 0
    n = 0
    for c in items[:10]:
        db.add(ResearchFinding(
            id=_uuid.uuid4(), run_id=run.id, source=source,
            title=(c.get("title") or "")[:400], url=(c.get("url") or "")[:800],
            snippet=(c.get("snippet") or "")[:2000],
        ))
        n += 1
    db.commit()
    logger.info(f"[deep_research] scout {source}: {n} findings for run {run.id}")
    return n


# ── Step 3: synthesize + deliver ──────────────────────────────────────────────

def synthesize_and_report(run_id: str, db) -> dict:
    from app.models import ResearchRun, ResearchFinding, Seed, User
    from app.briefings import fetch_garden_context, _call_llm
    from app.config import settings

    run = db.query(ResearchRun).filter(ResearchRun.id == _uuid.UUID(str(run_id))).first()
    if not run:
        return {"status": "error", "message": "run not found"}
    user = db.query(User).filter(User.id == run.user_id).first()
    themes = _themes_for(run, db)
    theme_str = ", ".join(themes[:3])
    _set(db, run, "synthesizing")

    findings = db.query(ResearchFinding).filter(ResearchFinding.run_id == run.id).all()
    run.finding_count = len(findings)
    db.commit()

    garden_ctx = fetch_garden_context(str(run.user_id), themes, db) or []
    garden_block = "\n".join(f"- {g.get('title','')}: {g.get('snippet','')}" for g in garden_ctx[:10]) or "No garden seeds yet."
    by_source: dict = {}
    for f in findings:
        by_source.setdefault(f.source, []).append(f)
    sources_block = ""
    for src, fs in by_source.items():
        if src == "garden":
            continue
        sources_block += f"\n### {src.upper()}\n" + "\n".join(
            f"- {f.title} ({f.url}) — {(f.snippet or '')[:240]}" for f in fs[:8])

    prompt = f"""You are a deep-research analyst connecting the dots across a person's
knowledge garden and the latest literature + industry signal.

THEMES: {theme_str}

THEIR GARDEN (what they already think about):
{garden_block}

NEW EVIDENCE GATHERED ACROSS SOURCES:
{sources_block or "No external findings."}

Write a focused research brief in markdown with EXACTLY these sections:
## The Gap
Name ONE specific, non-obvious gap or unexplored connection — something their
garden circles but hasn't closed, that the new evidence makes addressable. Be
concrete; cite the seeds + sources (by title) that point to it.
## Connecting the Dots
3-5 sentences linking their existing thinking to the new findings — what lines
up, what's in tension, what's newly possible.
## What the Sources Say
3-5 bullets, each grounding a claim in a specific source above (name it).
## Next Moves
3 concrete actions to close the gap (an experiment, a paper to read in full, a
spec to draft). Tie each to their garden.

Be specific and grounded — never invent sources or seeds."""

    report = _call_llm(prompt, system="You produce rigorous, grounded research briefs. Markdown only.",
                       max_tokens=1600, model=settings.BRIEFING_MODEL)
    if not report or len(report.strip()) < 80:
        report = _call_llm(prompt, max_tokens=1600, model=settings.FALLBACK_MODEL)
    report = (report or "").strip() or "_No synthesis produced._"

    gap = ""
    m = _re.search(r"##\s*The Gap\s*\n+(.+?)(?:\n##|\Z)", report, _re.DOTALL)
    if m:
        gap = m.group(1).strip()[:1000]

    _set(db, run, "reporting", gap=gap, report_md=report)

    # Plant in the garden (full-text + MCP-readable).
    title = f"Deep Research — {theme_str[:60]} — {datetime.utcnow():%b %d}"
    seed = Seed(
        id=_uuid.uuid4(), tenant_id=run.tenant_id, user_id=run.user_id, title=title[:200],
        content=f"**Deep Research run** across {run.finding_count} sources on _{theme_str}_.\n\n{report}",
        seed_type="note", created_by="agent_research", created_via="deep_research",
        seed_metadata={"tags": ["research", "deep-research"], "seed_type": "note",
                       "domain": "Research", "run_id": str(run.id), "energy": "HIGH"},
        created_at=datetime.utcnow(),
    )
    db.add(seed)
    db.commit()
    db.refresh(seed)
    run.result_seed_id = seed.id
    db.commit()

    app_url = settings.APP_URL.rstrip("/")
    seed_path = f"/garden?seed={seed.id}"

    # Email
    try:
        from app.email_sender import send_research_report_email
        if user and send_research_report_email(
            to=user.email, theme=theme_str, gap=gap, report_md=report,
            finding_count=run.finding_count, seed_url=f"{app_url}{seed_path}"):
            run.email_sent = True
            db.commit()
    except Exception as e:
        logger.warning(f"[deep_research] email failed for {run.id}: {e}")

    # Push + bell (worker-safe notify)
    try:
        from app.notify import notify_user
        notify_user(
            run.user_id,
            f"🔬 Deep Research ready: {theme_str[:48]}",
            (gap[:120] if gap else f"Connected the dots across {run.finding_count} sources — tap to read."),
            seed_path,
        )
    except Exception as e:
        logger.warning(f"[deep_research] push failed for {run.id}: {e}")

    _set(db, run, "done")
    logger.info(f"[deep_research] run {run.id} done — {run.finding_count} findings, emailed={run.email_sent}")
    return {"status": "ok", "run_id": str(run.id), "findings": run.finding_count}


# ── Phase 1 driver (sequential) ───────────────────────────────────────────────

def run_deep_research(run_id: str, db) -> dict:
    """End-to-end run on the Redis worker. Idempotent per scout, so a restarted
    worker resumes. Phase 2 (Temporal) drives the same steps with durable
    parallel activities."""
    from app.models import ResearchRun
    run = db.query(ResearchRun).filter(ResearchRun.id == _uuid.UUID(str(run_id))).first()
    if not run:
        return {"status": "error", "message": "run not found"}
    try:
        themes = scope_run(run_id, db)
        for source in SCOUTS:
            scout_one(run_id, source, themes, db)
        return synthesize_and_report(run_id, db)
    except Exception as e:
        logger.error(f"[deep_research] run {run_id} failed: {e}")
        try:
            _set(db, run, "error", error=str(e)[:500])
        except Exception:
            db.rollback()
        return {"status": "error", "message": str(e)[:300]}
