"""RSS candidate generator — a curated, user-extensible feed list.

One reader unlocks Nature journal feeds, lab/eng blogs, and tech press with no
keys. Entries are theme-filtered so a broad feed (e.g. Nature) only contributes
items relevant to the user's interests. Feeds give title+summary; the full-text
pipeline follows the link for the body when the page is open.

Override the default list via settings.RSS_FEEDS as a pipe-list of "Name|url"
entries, comma-separated, e.g. "Nature|https://www.nature.com/nature.rss".
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Research-leaning, mostly open feeds. Nature contributes headlines+abstracts
# (full text stays paywalled); lab blogs contribute open posts.
DEFAULT_FEEDS: list[tuple[str, str, str]] = [
    # (name, url, kind)
    ("Nature", "https://www.nature.com/nature.rss", "paper"),
    ("Nature Machine Intelligence", "https://www.nature.com/natmachintell.rss", "paper"),
    ("MIT Technology Review", "https://www.technologyreview.com/feed/", "news"),
    ("Quanta Magazine", "https://www.quantamagazine.org/feed/", "news"),
    ("Google DeepMind", "https://deepmind.google/blog/rss.xml", "news"),
    ("OpenAI", "https://openai.com/news/rss.xml", "news"),
    ("Anthropic", "https://www.anthropic.com/rss.xml", "news"),
    ("Papers with Code", "https://paperswithcode.com/latest/rss", "paper"),
]


def _load_feeds() -> list[tuple[str, str, str]]:
    raw = (getattr(settings, "RSS_FEEDS", "") or "").strip()
    if not raw:
        return DEFAULT_FEEDS
    feeds: list[tuple[str, str, str]] = []
    for part in raw.split(","):
        if "|" in part:
            name, url = part.split("|", 1)
            feeds.append((name.strip(), url.strip(), "news"))
    return feeds or DEFAULT_FEEDS


def _relevant(text: str, theme_tokens: set[str]) -> bool:
    if not theme_tokens:
        return True
    low = text.lower()
    return any(t in low for t in theme_tokens)


async def discover(themes: list[str], since_days: int = 7, limit: int = 10, per_feed: int = 4) -> list[dict]:
    try:
        import feedparser  # lazy: optional dependency
    except Exception:
        logger.info("[sources.rss] feedparser not installed — skipping RSS")
        return []

    theme_tokens = {t.lower() for theme in (themes or []) for t in theme.split() if len(t) > 3}
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=10, follow_redirects=True,
                                 headers={"User-Agent": "Greenplot/1.0 (research digest)"}) as client:
        for name, url, kind in _load_feeds():
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    continue
                parsed = feedparser.parse(resp.content)
            except Exception as e:
                logger.info(f"[sources.rss] {name} failed: {e}")
                continue
            kept = 0
            for e in parsed.entries:
                if kept >= per_feed:
                    break
                title = (getattr(e, "title", "") or "").strip()
                link = (getattr(e, "link", "") or "").strip()
                summary = (getattr(e, "summary", "") or "")[:600]
                if not title or not link:
                    continue
                if not _relevant(f"{title} {summary}", theme_tokens):
                    continue
                out.append({
                    "title": title[:300],
                    "url": link,
                    "snippet": summary,
                    "source": f"rss:{name}",
                    "kind": kind,
                    "pdf_url": "",
                    "published": getattr(e, "published", "") or getattr(e, "updated", ""),
                    "extra": {"feed": name},
                })
                kept += 1
    logger.info(f"[sources.rss] {len(out)} entries across feeds")
    return out[:limit]
