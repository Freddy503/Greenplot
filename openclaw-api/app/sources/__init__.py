"""Research source candidate generators.

Each module exposes `async discover(themes, ...) -> list[dict]` returning
candidates of the shape:

    {title, url, snippet, source, kind ("paper"|"news"), pdf_url, published, extra}

`discover_all` fans them in, de-dupes by normalized URL + title, and splits the
pool into papers (→ saved as paper seeds, full-text indexed) and news (→ the
digest's news section, top few also saved as seeds). Everything is fail-soft:
any source erroring contributes nothing and never breaks the digest.
"""
import asyncio
import logging
import re

from app.config import settings
from . import openalex, hackernews, rss, github

logger = logging.getLogger(__name__)


def _norm_url(u: str) -> str:
    u = (u or "").strip().lower()
    u = re.sub(r"^https?://(www\.)?", "", u)
    u = u.split("?")[0].split("#")[0].rstrip("/")
    return u


def _norm_title(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (t or "").lower()).strip()


def _dedupe(cands: list[dict], seen_urls: set[str] | None = None) -> list[dict]:
    seen_urls = {_norm_url(u) for u in (seen_urls or set())}
    out, urls, titles = [], set(seen_urls), set()
    for c in cands:
        nu, nt = _norm_url(c.get("url", "")), _norm_title(c.get("title", ""))
        if not nu or nu in urls or (nt and nt in titles):
            continue
        urls.add(nu)
        if nt:
            titles.add(nt)
        out.append(c)
    return out


def _enabled(enabled_sources: dict | None, key: str) -> bool:
    if not isinstance(enabled_sources, dict):
        return True
    return bool(enabled_sources.get(key, True))


def _passes_blocklist(c: dict, blocked_terms: list[str] | None = None) -> bool:
    terms = [str(t).strip().lower() for t in (blocked_terms or []) if str(t).strip()]
    if not terms:
        return True
    extra = c.get("extra") if isinstance(c.get("extra"), dict) else {}
    haystack = " ".join(
        str(part or "")
        for part in (
            c.get("title"),
            c.get("snippet"),
            c.get("url"),
            c.get("source"),
            extra.get("venue"),
            extra.get("feed"),
        )
    ).lower()
    return not any(term in haystack for term in terms)


async def discover_all(themes: list[str], seen_urls: set[str] | None = None,
                       paper_limit: int = 8, news_limit: int = 5,
                       enabled_sources: dict | None = None,
                       blocked_terms: list[str] | None = None) -> dict:
    """Run enabled sources concurrently → {"papers": [...], "news": [...]}."""
    if not getattr(settings, "RESEARCH_SOURCES_ENABLED", True):
        return {"papers": [], "news": []}

    jobs = []
    if _enabled(enabled_sources, "openalex"):
        jobs.append(openalex.discover(themes))
    if _enabled(enabled_sources, "hackernews"):
        jobs.append(hackernews.discover(themes))
    if _enabled(enabled_sources, "rss"):
        jobs.append(rss.discover(themes))
    if _enabled(enabled_sources, "github"):
        jobs.append(github.discover(themes))
    if not jobs:
        return {"papers": [], "news": []}

    results = await asyncio.gather(*jobs, return_exceptions=True)
    cands: list[dict] = []
    for r in results:
        if isinstance(r, list):
            cands.extend(r)
        elif isinstance(r, Exception):
            logger.warning(f"[sources] generator error: {r}")

    cands = [c for c in cands if _passes_blocklist(c, blocked_terms)]
    cands = _dedupe(cands, seen_urls)
    papers = [c for c in cands if c.get("kind") == "paper"][:paper_limit]
    news = [c for c in cands if c.get("kind") == "news"][:news_limit]
    logger.info(f"[sources] discover_all → {len(papers)} papers + {len(news)} news from {len(cands)} unique")
    return {"papers": papers, "news": news}
