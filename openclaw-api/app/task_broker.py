"""
task_broker.py
Redis-based message broker for enrichment tasks.
Publish jobs from harvest → enrichment worker via Redis queue.
"""

import os
import json
import redis
import uuid
from datetime import datetime
from typing import Optional

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
QUEUE_KEY = "enrichment:queue"
STATUS_KEY = "enrichment:status"  # hash: task_id -> status json

_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(REDIS_URL, decode_responses=True)
    return _client


def enqueue_enrichment(thought_id: str, tenant_id: str, priority: int = 0) -> str:
    """
    Push an enrichment job onto the Redis queue.
    Returns task_id for tracking.
    """
    r = get_redis()
    task_id = str(uuid.uuid4())
    job = {
        "task_id": task_id,
        "thought_id": thought_id,
        "tenant_id": tenant_id,
        "enqueued_at": datetime.utcnow().isoformat() + "Z",
        "status": "queued",
        "priority": priority,
    }

    # Set status
    r.hset(STATUS_KEY, task_id, json.dumps(job))

    # Push to queue (sorted set by priority, lower = higher priority)
    r.zadd(QUEUE_KEY, {json.dumps(job): priority})

    return task_id


def dequeue_enrichment(timeout: int = 5) -> Optional[dict]:
    """
    Pop the highest-priority job from the queue.
    Blocks for up to `timeout` seconds if queue is empty.
    Falls back to sorted set pop if blocking pop isn't available.
    """
    r = get_redis()

    # Try blocking pop first (list-based)
    try:
        result = r.bzpopmin(QUEUE_KEY, timeout=timeout)
        if result:
            _, job_json, _ = result
            job = json.loads(job_json)
            job["status"] = "processing"
            job["started_at"] = datetime.utcnow().isoformat() + "Z"
            r.hset(STATUS_KEY, job["task_id"], json.dumps(job))
            return job
    except Exception:
        pass

    return None


def update_task_status(task_id: str, status: str, error: str = None, result: dict = None):
    """Update the status of an enrichment task."""
    r = get_redis()
    try:
        existing = r.hget(STATUS_KEY, task_id)
        if existing:
            job = json.loads(existing)
        else:
            job = {"task_id": task_id}
    except:
        job = {"task_id": task_id}

    job["status"] = status
    job["updated_at"] = datetime.utcnow().isoformat() + "Z"
    if error:
        job["error"] = error[:500]
    if result:
        job["result"] = result

    r.hset(STATUS_KEY, task_id, json.dumps(job))

    # Expire completed/failed tasks after 1 hour
    if status in ("completed", "error"):
        r.expire(f"{STATUS_KEY}:{task_id}", 3600)


def get_task_status(task_id: str) -> Optional[dict]:
    """Get the current status of an enrichment task."""
    r = get_redis()
    data = r.hget(STATUS_KEY, task_id)
    if data:
        return json.loads(data)
    return None


def get_queue_depth() -> int:
    """Get the number of jobs in the queue."""
    r = get_redis()
    return r.zcard(QUEUE_KEY)


def get_pending_tasks(limit: int = 10) -> list:
    """Get pending tasks from the queue without removing them."""
    r = get_redis()
    items = r.zrange(QUEUE_KEY, 0, limit - 1, withscores=True)
    return [json.loads(item[0]) for item in items]
