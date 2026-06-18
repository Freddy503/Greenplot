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

# Garden = the user's own seeds; the rest are external. Exa = live web search
# (its full page contents are read during synthesis).
EXTERNAL_SCOUTS = ["exa", "arxiv", "openalex", "github", "hackernews", "rss"]
SCOUTS = ["garden"] + EXTERNAL_SCOUTS

# Sources whose full machine-readable text we pull for the 1M-context synthesis,
# in priority order (most signal-dense first). GitHub READMEs read well via Exa.
READ_PRIORITY = {"exa": 0, "openalex": 1, "arxiv": 2, "github": 3, "rss": 4, "hackernews": 5}


def _set(db, run, status: str, **fields):
    run.status = status
    run.updated_at = datetime.utcnow()
    for k, v in fields.items():
        setattr(run, k, v)
    db.commit()


def _themes_for(run, db) -> list[str]:
    """Connect the focus prompt with the user's interests so a run reflects BOTH.

    Onboarding (and the launcher) capture two things: the picked *interests* and a
    "what's on your mind" *focus*. These must not be separate — the focus LEADS
    the scout queries (keeps them sharp) and the interests broaden + ground it.
    With no focus, fall back to the interests alone."""
    from app.briefings import fetch_user_themes
    interests = fetch_user_themes(str(run.user_id), db) or []
    focus = (run.theme or "").strip()
    if not focus:
        return interests
    extra = [t for t in interests if t and t.strip() and t.lower() not in focus.lower()]
    return [focus] + extra[:3]


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
    if source == "exa":
        from app.briefings import fetch_web_search
        hits = await fetch_web_search(" ".join(themes[:3]), limit=8)
        return [{"title": h.get("title", ""), "url": h.get("url", ""), "snippet": h.get("snippet", "")} for h in hits]
    if source == "arxiv":
        from app.briefings import _fetch_arxiv_papers
        return await _fetch_arxiv_papers(themes, limit=8)
    # openalex | hackernews | rss | github → the dedicated generators
    from app.sources import openalex, hackernews, rss, github
    gen = {"openalex": openalex, "hackernews": hackernews, "rss": rss, "github": github}.get(source)
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

def _read_fulltexts(findings: list, limit: int = 14, per_chars: int = 6000) -> list[tuple]:
    """Pull the FULL machine-readable text of the top external findings (Exa
    contents handles arbitrary pages incl. arXiv/journal HTML). Concurrent;
    falls back to the stored snippet when a page can't be fetched."""
    from app.enricher_v2 import fetch_url_content
    ext = [f for f in findings if f.source != "garden" and f.url]
    ext.sort(key=lambda f: READ_PRIORITY.get(f.source, 9))
    picks = ext[:limit]

    async def _gather():
        async def _one(f):
            txt = None
            try:
                txt = await asyncio.to_thread(fetch_url_content, f.url)
            except Exception:
                txt = None
            return (f, (txt or f.snippet or "")[:per_chars])
        return await asyncio.gather(*[_one(f) for f in picks]) if picks else []

    try:
        return asyncio.run(_gather())
    except Exception as e:
        logger.warning(f"[deep_research] full-text read failed: {e}")
        return [(f, (f.snippet or "")[:per_chars]) for f in picks]


def synthesize_and_report(run_id: str, db) -> dict:
    from app.models import ResearchRun, ResearchFinding, Seed, User
    from app.briefings import fetch_garden_context, _call_llm
    from app.config import settings

    run = db.query(ResearchRun).filter(ResearchRun.id == _uuid.UUID(str(run_id))).first()
    if not run:
        return {"status": "error", "message": "run not found"}
    user = db.query(User).filter(User.id == run.user_id).first()
    mode = (run.mode or "deep")
    themes = _themes_for(run, db)
    theme_str = ", ".join(themes[:3])
    focus = (run.theme or "").strip() or theme_str
    # Interest areas = the themes that aren't the focus prompt — used to frame
    # the focus within what the user actually cares about (connected, not separate).
    interest_areas = [t for t in themes if t.strip().lower() != focus.strip().lower()]
    _set(db, run, "synthesizing")

    findings = db.query(ResearchFinding).filter(ResearchFinding.run_id == run.id).all()
    run.finding_count = len(findings)
    db.commit()

    garden_ctx = fetch_garden_context(str(run.user_id), themes, db) or []
    garden_block = "\n".join(f"- {g.get('title','')}: {g.get('snippet','')}" for g in garden_ctx[:12]) or "No garden seeds yet."

    # Research memory (P1): prior gaps so this run builds on, not repeats, them.
    prior = (db.query(ResearchRun)
             .filter(ResearchRun.user_id == run.user_id, ResearchRun.status == "done",
                     ResearchRun.id != run.id)
             .order_by(ResearchRun.created_at.desc()).limit(5).all())
    prior_block = "\n".join(
        f"- {p.theme or 'general'}: {((p.gap or '').splitlines() or [''])[0][:160]}"
        for p in prior if p.gap) or "Nothing explored yet."

    # ── Pass 1: decompose into sharp sub-questions (cheap model) ──────────────
    titles_block = "\n".join(f"- [{f.source}] {f.title}" for f in findings if f.source != "garden")[:4000]
    plan = _call_llm(
        f"""Focus: {focus}\nThemes: {theme_str}\n\nThe user's garden:\n{garden_block}\n\n"""
        f"""Candidate sources gathered:\n{titles_block}\n\n"""
        "Decompose this into 3-5 sharp, non-overlapping sub-questions that a rigorous "
        "research brief must answer to close a real gap for this person. Output a plain "
        "numbered list, nothing else.",
        system="You are a research lead scoping an investigation.",
        max_tokens=400, model=settings.BRIEFING_MODEL) or ""
    sub_questions = plan.strip() or "1. What's new? 2. How does it connect to the garden? 3. What's the gap?"

    # ── Read source text — full text in deep mode, snippets in lite mode ──────
    if mode == "deep":
        read = _read_fulltexts(findings)
    else:
        ext = sorted([f for f in findings if f.source != "garden" and f.url],
                     key=lambda f: READ_PRIORITY.get(f.source, 9))[:14]
        read = [(f, (f.snippet or "")[:1500]) for f in ext]
    synth_model = settings.DEEP_RESEARCH_MODEL if mode == "deep" else settings.BRIEFING_MODEL
    sources_full = ""
    cited = []
    for i, (f, text) in enumerate(read, 1):
        cited.append((i, f.source, f.title, f.url))
        sources_full += f"\n\n[S{i}] ({f.source}) {f.title}\nURL: {f.url}\n{text}"
    sources_full = sources_full[:700000]  # headroom under a 1M-context window

    # ── Pass 2: deep synthesis over full texts (1M-context model) ─────────────
    prompt = f"""You are running a DEEP RESEARCH investigation for someone's knowledge garden.
Do NOT one-shot or hand-wave — reason over the FULL source texts below and cite
them inline as [S#]. Surface where sources agree, disagree, or leave gaps; never
cite a source you wouldn't stand behind.

FOCUS (what's on their mind): {focus}
THEIR INTEREST AREAS (frame the focus within these — connect them, don't treat separately): {', '.join(interest_areas) or 'general'}

SUB-QUESTIONS TO ANSWER:
{sub_questions}

THE USER'S GARDEN (their existing thinking):
{garden_block}

PREVIOUSLY EXPLORED (build on these — do NOT repeat the same gaps):
{prior_block}

FULL SOURCE TEXTS (read these closely; cite as [S#]):
{sources_full or "No external full text available."}

Produce a rigorous, well-formatted research brief in EXACTLY this markdown shape:

# {focus} — Research Brief
## TL;DR
3-4 bullets: the sharpest takeaways and why they matter to this person.
## What your garden already knows
Ground this in their seeds (name them).
## What the research says
Answer each sub-question in its own short subsection (### …), citing [S#] for
every non-obvious claim. Note agreements and contradictions explicitly.
## The Gap
ONE specific, non-obvious gap the evidence makes addressable — the throughline.
## Recommended next moves
3 concrete actions (an experiment to run, a paper to read in full, a PRD/spec to
draft), each tied to their garden.
## Sources
A numbered list matching the [S#] citations: [S#] Title — url.

Be specific, rigorous, and grounded. Markdown only."""

    report = _call_llm(prompt, system="You produce rigorous, deeply-cited research briefs. Markdown only.",
                       max_tokens=4000, model=synth_model)
    if not report or len(report.strip()) < 120:
        logger.warning(f"[deep_research] synth model thin/empty for {run.id} — falling back")
        report = _call_llm(prompt, max_tokens=4000, model=settings.PREMIUM_MODEL)
    report = (report or "").strip()

    # ── Critique-and-revise (P2, deep mode) — tighten claims + the gap ────────
    if mode == "deep" and getattr(settings, "RESEARCH_CRITIQUE", False) and len(report) > 200:
        try:
            revised = _call_llm(
                f"""Here is a research brief. Critique it hard, then return an improved version.
Check: is every [S#] claim actually supported by that source's text above? Is "The Gap"
genuinely specific and non-obvious (not a platitude)? Are the next moves concrete? Remove
unsupported claims, sharpen the gap, keep the exact same markdown section structure.

BRIEF:
{report}

Return ONLY the improved brief (same markdown shape).""",
                system="You are a demanding research editor. Markdown only.",
                max_tokens=4000, model=synth_model)
            if revised and len(revised.strip()) > 200:
                report = revised.strip()
        except Exception as e:
            logger.warning(f"[deep_research] critique pass failed for {run.id}: {e}")
    report = (report or "").strip() or "_No synthesis produced._"

    # Append a sources appendix if the model omitted it (every run is traceable).
    if "## Sources" not in report and cited:
        report += "\n\n## Sources\n" + "\n".join(f"[S{i}] ({src}) {ttl} — {url}" for i, src, ttl, url in cited)

    # ── Most relevant papers — embed into the brief + attach to the email ─────
    # Prefer papers the synthesis actually cited ([S#]); arXiv/OpenAlex only.
    def _pdf(url: str) -> str:
        if "arxiv.org/abs/" in (url or ""):
            return url.replace("/abs/", "/pdf/")
        return url if (url or "").lower().endswith(".pdf") else ""
    relevant_papers = []
    for i, (f, txt) in enumerate(read, 1):
        if f.source in ("arxiv", "openalex") and f.url:
            relevant_papers.append({
                "title": f.title or "Untitled", "url": f.url, "source": f.source,
                "snippet": (f.snippet or (txt or "")[:300]), "pdf_url": _pdf(f.url),
                "cited": f"[S{i}]" in report,
            })
    relevant_papers.sort(key=lambda p: not p["cited"])  # cited first
    relevant_papers = relevant_papers[:5]
    if relevant_papers:
        report += "\n\n## Relevant papers\n" + "\n".join(
            f"- [{p['title']}]({p['url']})" + (f" · [PDF]({p['pdf_url']})" if p["pdf_url"] else "")
            for p in relevant_papers)

    gap = ""
    m = _re.search(r"##\s*The Gap\s*\n+(.+?)(?:\n##|\Z)", report, _re.DOTALL)
    if m:
        gap = m.group(1).strip()[:1000]

    _set(db, run, "reporting", gap=gap, report_md=report)

    # Plant as a properly-formatted research artifact (full-text + MCP-readable).
    title = f"Research Brief — {focus[:70]}"
    header = (f"> **Deep Research** · {run.finding_count} sources gathered, "
              f"{len(read)} read in full · {datetime.utcnow():%b %d, %Y}\n\n")
    seed = Seed(
        id=_uuid.uuid4(), tenant_id=run.tenant_id, user_id=run.user_id, title=title[:200],
        content=header + report,
        seed_type="research_brief", created_by="agent_research", created_via="deep_research",
        seed_metadata={"tags": ["research", "deep-research", "brief"], "seed_type": "research_brief",
                       "domain": "Research", "run_id": str(run.id), "focus": focus[:120],
                       "sources_read": len(read), "energy": "HIGH"},
        created_at=datetime.utcnow(),
    )
    db.add(seed)
    db.commit()
    db.refresh(seed)
    run.result_seed_id = seed.id
    db.commit()

    # Embed the relevant papers into the garden (full-text indexed) and connect
    # them to the brief so they're first-class, linked seeds — not just links.
    if relevant_papers:
        try:
            from app.briefings import _save_papers_as_seeds, _get_seen_paper_urls
            _save_papers_as_seeds(
                [{"title": p["title"], "url": p["url"], "content": p["snippet"],
                  "source": p["source"], "kind": "paper", "pdf_url": p["pdf_url"]}
                 for p in relevant_papers],
                str(run.user_id), db, seen_paper_urls=_get_seen_paper_urls(str(run.user_id), db))
        except Exception as e:
            logger.warning(f"[deep_research] embedding papers failed for {run.id}: {e}")
        try:
            from app.backlinker import find_and_create_links
            find_and_create_links(seed_id=str(seed.id), tenant_id=str(run.tenant_id),
                                  seed_title=seed.title, seed_content=(seed.content or "")[:2000])
        except Exception as e:
            logger.warning(f"[deep_research] backlink brief failed for {run.id}: {e}")

    app_url = settings.APP_URL.rstrip("/")
    seed_path = f"/garden?seed={seed.id}"

    # Email — brief body + the relevant papers (PDFs attached where available)
    try:
        from app.email_sender import send_research_report_email
        if user and send_research_report_email(
            to=user.email, theme=theme_str, gap=gap, report_md=report,
            finding_count=run.finding_count, seed_url=f"{app_url}{seed_path}",
            papers=relevant_papers):
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
