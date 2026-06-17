"""Deep Research orchestrator — Phase 1 (build-on-stack).

Spec: docs/specs/deep-research-agents.md

A long-running job that fans out per-source "scouts" across the garden + arXiv +
OpenAlex + Hacker News + RSS, persists every finding to Postgres (so the run is
durable and resumable), then a gap-finder synthesizes the dots into a report
that's emailed to the user and planted back in the garden.

Runs on the existing Redis worker today (`type=deep_research`). Phase 2 lifts
this exact flow into a Temporal workflow — the scout/synthesize functions here
become activities; see temporal_worker.py.
"""
import asyncio
import logging
import uuid as _uuid
from datetime import datetime

logger = logging.getLogger(__name__)

# Sources a scout covers. Garden = the user's own seeds; the rest are external.
SCOUTS = ["garden", "arxiv", "openalex", "hackernews", "rss"]


def _set(db, run, status: str, **fields):
    run.status = status
    run.updated_at = datetime.utcnow()
    for k, v in fields.items():
        setattr(run, k, v)
    db.commit()


async def _gather_external(themes: list[str]) -> dict:
    """Concurrent external scouts: arXiv + the multi-source bundle."""
    from app.briefings import _fetch_arxiv_papers
    from app.sources import discover_all
    arxiv, bundle = await asyncio.gather(
        _fetch_arxiv_papers(themes, limit=8),
        discover_all(themes, paper_limit=10, news_limit=6),
        return_exceptions=True,
    )
    out = {"arxiv": [], "openalex": [], "hackernews": [], "rss": []}
    if isinstance(arxiv, list):
        out["arxiv"] = arxiv
    if isinstance(bundle, dict):
        for c in bundle.get("papers", []) + bundle.get("news", []):
            src = (c.get("source") or "").split(":")[0]
            key = src if src in out else ("rss" if src == "rss" else None)
            if src == "openalex":
                out["openalex"].append(c)
            elif src == "hackernews":
                out["hackernews"].append(c)
            elif src.startswith("rss") or "rss" in (c.get("source") or ""):
                out["rss"].append(c)
    return out


def run_deep_research(run_id: str, db) -> dict:
    """Execute one research run end-to-end. Idempotent per-scout (skips a source
    that already has persisted findings) so a restarted worker resumes cleanly."""
    from app.models import ResearchRun, ResearchFinding, Seed, User
    from app.briefings import fetch_user_themes, fetch_garden_context, _call_llm
    from app.config import settings

    run = db.query(ResearchRun).filter(ResearchRun.id == _uuid.UUID(str(run_id))).first()
    if not run:
        return {"status": "error", "message": "run not found"}
    user = db.query(User).filter(User.id == run.user_id).first()
    if not user:
        _set(db, run, "error", error="user not found")
        return {"status": "error", "message": "user not found"}

    try:
        # 1. SCOPE — themes + the slice of garden we're connecting dots across.
        _set(db, run, "scoping")
        themes = fetch_user_themes(str(run.user_id), db)
        if run.theme:
            themes = [run.theme] + [t for t in themes if t.lower() != run.theme.lower()]
        theme_str = ", ".join(themes[:3])
        garden_ctx = fetch_garden_context(str(run.user_id), themes, db) or []

        # Which scouts already have findings (resume after a crash)?
        done_sources = {
            s for (s,) in db.query(ResearchFinding.source)
            .filter(ResearchFinding.run_id == run.id).distinct().all()
        }

        # 2. SCOUT — fan out, persist every finding.
        _set(db, run, "scouting")
        if "garden" not in done_sources:
            for g in garden_ctx[:12]:
                db.add(ResearchFinding(
                    id=_uuid.uuid4(), run_id=run.id, source="garden",
                    title=(g.get("title") or "")[:400], url=g.get("url", ""),
                    snippet=(g.get("snippet") or "")[:2000],
                ))
            db.commit()

        if not {"arxiv", "openalex", "hackernews", "rss"}.issubset(done_sources):
            external = asyncio.run(_gather_external(themes))
            for src, items in external.items():
                if src in done_sources:
                    continue
                for c in items[:8]:
                    db.add(ResearchFinding(
                        id=_uuid.uuid4(), run_id=run.id, source=src,
                        title=(c.get("title") or "")[:400], url=(c.get("url") or "")[:800],
                        snippet=(c.get("snippet") or "")[:2000],
                    ))
            db.commit()

        findings = db.query(ResearchFinding).filter(ResearchFinding.run_id == run.id).all()
        run.finding_count = len(findings)
        db.commit()

        # 3. SYNTHESIZE — name the gap, connect the dots, cite, propose moves.
        _set(db, run, "synthesizing")
        garden_block = "\n".join(f"- {g.get('title','')}: {g.get('snippet','')}" for g in garden_ctx[:10]) or "No garden seeds yet."
        by_source = {}
        for f in findings:
            by_source.setdefault(f.source, []).append(f)
        sources_block = ""
        for src, fs in by_source.items():
            if src == "garden":
                continue
            sources_block += f"\n### {src.upper()}\n" + "\n".join(
                f"- {f.title} ({f.url}) — {(f.snippet or '')[:240]}" for f in fs[:8]
            )

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

        # Extract the gap line for the run record (best-effort).
        gap = ""
        import re as _re
        m = _re.search(r"##\s*The Gap\s*\n+(.+?)(?:\n##|\Z)", report, _re.DOTALL)
        if m:
            gap = m.group(1).strip()[:1000]

        # 4. REPORT — plant in the garden (MCP-readable) + email.
        _set(db, run, "reporting", gap=gap, report_md=report)
        title = f"Deep Research — {theme_str[:60]} — {datetime.utcnow():%b %d}"
        seed = Seed(
            id=_uuid.uuid4(), tenant_id=run.tenant_id, user_id=run.user_id,
            title=title[:200],
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

        try:
            from app.email_sender import send_research_report_email
            app_url = settings.APP_URL.rstrip("/")
            sent = send_research_report_email(
                to=user.email, theme=theme_str, gap=gap, report_md=report,
                finding_count=run.finding_count,
                seed_url=f"{app_url}/garden?seed={seed.id}",
            )
            run.email_sent = bool(sent)
        except Exception as e:
            logger.warning(f"[deep_research] email failed for {run.id}: {e}")

        _set(db, run, "done")
        logger.info(f"[deep_research] run {run.id} done — {run.finding_count} findings, emailed={run.email_sent}")
        return {"status": "ok", "run_id": str(run.id), "findings": run.finding_count}

    except Exception as e:
        logger.error(f"[deep_research] run {run_id} failed: {e}")
        try:
            _set(db, run, "error", error=str(e)[:500])
        except Exception:
            db.rollback()
        return {"status": "error", "message": str(e)[:300]}
