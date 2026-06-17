"""OpenAlex candidate generator — peer-reviewed / published research across all
publishers (incl. Nature/Science), complementing arXiv preprints.

No API key. Polite-pool access via the `mailto` param. Abstracts come back as an
inverted index, reconstructed here. Open-access works expose a direct PDF URL
that flows into the full-text pipeline; paywalled works contribute
title+abstract (still linked by DOI).
"""
import logging
from datetime import date, timedelta

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_API = "https://api.openalex.org/works"


def _reconstruct_abstract(inv: dict | None) -> str:
    if not inv:
        return ""
    pos: dict[int, str] = {}
    for word, locs in inv.items():
        for loc in locs:
            pos[loc] = word
    return " ".join(pos[i] for i in sorted(pos))[:1200]


async def discover(themes: list[str], since_days: int = 14, limit: int = 8) -> list[dict]:
    query = " ".join((themes or [])[:3]).strip() or "artificial intelligence"
    frm = (date.today() - timedelta(days=since_days)).isoformat()
    mailto = (getattr(settings, "OPENALEX_MAILTO", "") or "contact@example.com")
    params = {
        "search": query,
        "filter": f"from_publication_date:{frm}",
        "per_page": str(limit),
        "mailto": mailto,
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(_API, params=params)
        if resp.status_code != 200:
            logger.warning(f"[sources.openalex] {resp.status_code} for '{query}'")
            return []
        works = resp.json().get("results", []) or []
    except Exception as e:
        logger.warning(f"[sources.openalex] failed: {e}")
        return []

    out: list[dict] = []
    for w in works:
        title = (w.get("display_name") or "").strip()
        if not title:
            continue
        oa = w.get("open_access") or {}
        pdf = oa.get("oa_url") or ""
        loc = w.get("primary_location") or {}
        landing = loc.get("landing_page_url") or w.get("doi") or pdf
        if not landing:
            continue
        venue = ((loc.get("source") or {}) or {}).get("display_name") or ""
        out.append({
            "title": title[:300],
            "url": landing,
            "snippet": _reconstruct_abstract(w.get("abstract_inverted_index")) or (f"{venue} · {w.get('publication_date','')}").strip(" ·"),
            "source": "openalex",
            "kind": "paper",
            "pdf_url": pdf,
            "published": w.get("publication_date", ""),
            "extra": {"venue": venue, "citations": w.get("cited_by_count", 0), "is_oa": bool(oa.get("is_oa"))},
        })
    logger.info(f"[sources.openalex] {len(out)} works for '{query}'")
    return out
