"""Hacker News candidate generator — the industry / practitioner pulse.

Algolia HN Search API: no key, keyword + date + points filters. Returns stories
(releases, essays, launches, post-mortems) that are actually getting traction,
so the digest reflects what builders are reading now, not just what's published.
"""
import logging
import time

import httpx

logger = logging.getLogger(__name__)

_API = "https://hn.algolia.com/api/v1/search"


async def discover(themes: list[str], since_days: int = 3, limit: int = 6, min_points: int = 50) -> list[dict]:
    query = " ".join((themes or [])[:2]).strip()
    if not query:
        return []
    cutoff = int(time.time()) - since_days * 86400
    # HN's Algolia index only allows numeric filtering on created_at_i (not
    # points) — so filter by recency server-side, then gate on points client-side.
    params = {
        "query": query,
        "tags": "story",
        "numericFilters": f"created_at_i>{cutoff}",
        "hitsPerPage": "40",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(_API, params=params)
        if resp.status_code != 200:
            logger.warning(f"[sources.hackernews] {resp.status_code} for '{query}'")
            return []
        hits = resp.json().get("hits", []) or []
    except Exception as e:
        logger.warning(f"[sources.hackernews] failed: {e}")
        return []

    # High-signal first: keep stories above the points threshold, best on top.
    hits = sorted((h for h in hits if (h.get("points") or 0) >= min_points),
                  key=lambda h: h.get("points", 0), reverse=True)[:limit]

    out: list[dict] = []
    for h in hits:
        title = (h.get("title") or "").strip()
        if not title:
            continue
        oid = h.get("objectID", "")
        # External article when present; otherwise the HN discussion itself.
        url = h.get("url") or f"https://news.ycombinator.com/item?id={oid}"
        points = h.get("points", 0) or 0
        comments = h.get("num_comments", 0) or 0
        out.append({
            "title": title[:300],
            "url": url,
            "snippet": f"{points} points · {comments} comments on Hacker News. Discussion: https://news.ycombinator.com/item?id={oid}",
            "source": "hackernews",
            "kind": "news",
            "pdf_url": "",
            "published": h.get("created_at", ""),
            "extra": {"points": points, "comments": comments, "hn_id": oid},
        })
    logger.info(f"[sources.hackernews] {len(out)} stories for '{query}'")
    return out
