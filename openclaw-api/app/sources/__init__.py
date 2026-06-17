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
from . import openalex, hackernews, rss

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


async def discover_all(themes: list[str], seen_urls: set[str] | None = None,
                       paper_limit: int = 8, news_limit: int = 5) -> dict:
    """Run enabled sources concurrently → {"papers": [...], "news": [...]}."""
    if not getattr(settings, "RESEARCH_SOURCES_ENABLED", True):
        return {"papers": [], "news": []}

    results = await asyncio.gather(
        openalex.discover(themes),
        hackernews.discover(themes),
        rss.discover(themes),
        return_exceptions=True,
    )
    cands: list[dict] = []
    for r in results:
        if isinstance(r, list):
            cands.extend(r)
        elif isinstance(r, Exception):
            logger.warning(f"[sources] generator error: {r}")

    cands = _dedupe(cands, seen_urls)
    papers = [c for c in cands if c.get("kind") == "paper"][:paper_limit]
    news = [c for c in cands if c.get("kind") == "news"][:news_limit]
    logger.info(f"[sources] discover_all → {len(papers)} papers + {len(news)} news from {len(cands)} unique")
    return {"papers": papers, "news": news}
