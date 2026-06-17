"""GitHub candidate generator — tools, releases and projects shipping on a theme.

Uses the GitHub Search API (repositories), authenticated with GITHUB_TOKEN when
present (5000 req/hr vs 60 unauth). Surfaces actively-maintained, well-starred
repos so the digest/Deep Research reflect what's being *built*, not just written.
The repo README is read in full during Deep Research synthesis (Exa /contents).
"""
import logging
from datetime import date, timedelta

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_API = "https://api.github.com/search/repositories"


def _headers() -> dict:
    h = {"Accept": "application/vnd.github+json", "User-Agent": "Greenplot/1.0"}
    tok = getattr(settings, "GITHUB_TOKEN", None)
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    return h


async def discover(themes: list[str], since_days: int = 90, limit: int = 6, min_stars: int = 30) -> list[dict]:
    query = " ".join((themes or [])[:2]).strip()
    if not query:
        return []
    pushed = (date.today() - timedelta(days=since_days)).isoformat()
    params = {
        "q": f"{query} pushed:>{pushed} stars:>{min_stars}",
        "sort": "stars",
        "order": "desc",
        "per_page": str(limit),
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(_API, params=params, headers=_headers())
        if resp.status_code != 200:
            logger.warning(f"[sources.github] {resp.status_code} for '{query}'")
            return []
        items = resp.json().get("items", []) or []
    except Exception as e:
        logger.warning(f"[sources.github] failed: {e}")
        return []

    out: list[dict] = []
    for r in items:
        name = r.get("full_name") or ""
        url = r.get("html_url") or ""
        if not name or not url:
            continue
        desc = (r.get("description") or "").strip()
        stars = r.get("stargazers_count", 0) or 0
        lang = r.get("language") or ""
        topics = ", ".join((r.get("topics") or [])[:6])
        meta = " · ".join(p for p in (f"★{stars}", lang, topics) if p)
        out.append({
            "title": name[:300],
            "url": url,
            "snippet": (f"{desc} — {meta}" if desc else meta)[:600],
            "source": "github",
            "kind": "news",          # tools/industry pulse, not a paper
            "pdf_url": "",
            "published": r.get("pushed_at", ""),
            "extra": {"stars": stars, "language": lang},
        })
    logger.info(f"[sources.github] {len(out)} repos for '{query}'")
    return out
