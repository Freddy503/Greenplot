"""
cache.py
Redis caching layer for Weaviate seed lookups.
Speeds up Garden page loads (233+ seeds) by caching query results.
"""

import os
import json
import hashlib
import redis
from typing import Optional, List
from functools import wraps

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CACHE_PREFIX = "garden:cache:"
DEFAULT_TTL = 300  # 5 minutes

_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(REDIS_URL, decode_responses=True)
    return _client


def _cache_key(prefix: str, **kwargs) -> str:
    """Generate a deterministic cache key from parameters."""
    raw = json.dumps(kwargs, sort_keys=True)
    hash_part = hashlib.md5(raw.encode()).hexdigest()[:12]
    return f"{CACHE_PREFIX}{prefix}:{hash_part}"


def get_cached(key: str) -> Optional[any]:
    """Get a cached value by key."""
    try:
        r = get_redis()
        data = r.get(key)
        if data:
            return json.loads(data)
    except Exception:
        pass
    return None


def set_cached(key: str, value: any, ttl: int = DEFAULT_TTL):
    """Set a cached value with TTL."""
    try:
        r = get_redis()
        r.setex(key, ttl, json.dumps(value))
    except Exception:
        pass  # Cache failures are non-blocking


def invalidate_pattern(prefix: str):
    """Invalidate all keys matching a prefix pattern."""
    try:
        r = get_redis()
        keys = r.keys(f"{CACHE_PREFIX}{prefix}:*")
        if keys:
            r.delete(*keys)
    except Exception:
        pass


def cache_seeds(tenant_id: str, seeds: list, ttl: int = DEFAULT_TTL):
    """Cache the full seed list for a tenant."""
    key = _cache_key("seeds", tenant=tenant_id)
    set_cached(key, seeds, ttl)


def get_cached_seeds(tenant_id: str) -> Optional[list]:
    """Get cached seed list for a tenant."""
    key = _cache_key("seeds", tenant=tenant_id)
    return get_cached(key)


def cache_search(tenant_id: str, query: str, results: list, ttl: int = 120):
    """Cache search results for a tenant + query combo."""
    key = _cache_key("search", tenant=tenant_id, query=query[:200])
    set_cached(key, results, ttl)


def get_cached_search(tenant_id: str, query: str) -> Optional[list]:
    """Get cached search results."""
    key = _cache_key("search", tenant=tenant_id, query=query[:200])
    return get_cached(key)


def cache_links(tenant_id: str, links: list, ttl: int = DEFAULT_TTL):
    """Cache links list for a tenant."""
    key = _cache_key("links", tenant=tenant_id)
    set_cached(key, links, ttl)


def get_cached_links(tenant_id: str) -> Optional[list]:
    """Get cached links for a tenant."""
    key = _cache_key("links", tenant=tenant_id)
    return get_cached(key)


def invalidate_seeds(tenant_id: str):
    """Invalidate seed cache for a tenant (call after creating/updating seeds)."""
    key = _cache_key("seeds", tenant=tenant_id)
    try:
        get_redis().delete(key)
    except Exception:
        pass


def invalidate_links(tenant_id: str):
    """Invalidate links cache for a tenant."""
    key = _cache_key("links", tenant=tenant_id)
    try:
        get_redis().delete(key)
    except Exception:
        pass


def get_cache_stats() -> dict:
    """Get cache statistics."""
    try:
        r = get_redis()
        keys = r.keys(f"{CACHE_PREFIX}*")
        return {
            "total_keys": len(keys),
            "seed_caches": len([k for k in keys if "seeds:" in k]),
            "search_caches": len([k for k in keys if "search:" in k]),
            "link_caches": len([k for k in keys if "links:" in k]),
        }
    except Exception:
        return {"total_keys": 0}
