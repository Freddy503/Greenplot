"""
activity.py
Activity feed — logs system events so the user can see what happened.
Uses Redis sorted set (fast, no schema changes).
"""

import os
import json
import time
import redis
from typing import Optional

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
FEED_KEY = "activity:feed"
MAX_ITEMS = 200

_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(REDIS_URL, decode_responses=True)
    return _client


def log_activity(tenant_id: str, event_type: str, title: str, detail: str = "", metadata: dict = None):
    """
    Log an activity event.
    event_type: seed_created, source_found, connection_made, enrichment_done, seed_rated, digest_sent
    """
    try:
        r = get_redis()
        entry = {
            "tenant_id": tenant_id,
            "type": event_type,
            "title": title,
            "detail": detail[:200] if detail else "",
            "meta": metadata or {},
            "ts": time.time(),
        }
        score = time.time()
        r.zadd(FEED_KEY, {json.dumps(entry): score})
        # Trim to max items
        count = r.zcard(FEED_KEY)
        if count > MAX_ITEMS:
            r.zremrangebyrank(FEED_KEY, 0, count - MAX_ITEMS - 1)
    except Exception:
        pass  # non-blocking


def get_activity_feed(tenant_id: str, limit: int = 20, hours: int = 48) -> list:
    """Get recent activity for a tenant."""
    try:
        r = get_redis()
        cutoff = time.time() - (hours * 3600)
        items = r.zrangebyscore(FEED_KEY, cutoff, "+inf", withscores=True)
        events = []
        for raw, score in items:
            try:
                entry = json.loads(raw)
                if entry.get("tenant_id") == tenant_id:
                    entry["timestamp"] = score
                    events.append(entry)
            except:
                continue
        events.sort(key=lambda x: x["timestamp"], reverse=True)
        return events[:limit]
    except Exception:
        return []


# ── Convenience loggers ──

def log_seed_created(tenant_id: str, title: str, source: str = "manual"):
    log_activity(tenant_id, "seed_created", f"🌱 {title}", f"Source: {source}", {"source": source})


def log_source_found(tenant_id: str, title: str, url: str, origin: str = "web_search"):
    log_activity(tenant_id, "source_found", f"📎 {title}", url[:100], {"url": url, "origin": origin})


def log_connection_made(tenant_id: str, seed_a: str, seed_b: str, link_type: str = "similar"):
    log_activity(tenant_id, "connection_made", f"🔗 {seed_a} ↔ {seed_b}", f"Type: {link_type}")


def log_enrichment_done(tenant_id: str, title: str, seed_title: str = ""):
    detail = f"→ {seed_title}" if seed_title else ""
    log_activity(tenant_id, "enrichment_done", f"✨ Enriched: {title}", detail)


def log_seed_rated(tenant_id: str, title: str, score: int):
    log_activity(tenant_id, "seed_rated", f"⭐ {title}", f"{score}/5 stars", {"score": score})


def log_digest_sent(tenant_id: str, channel: str = "telegram"):
    log_activity(tenant_id, "digest_sent", "📬 Daily digest sent", f"via {channel}")
