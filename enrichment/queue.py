#!/usr/bin/env python3
"""
queue.py — Redis-backed job queue for background enrichment.

Jobs are JSON objects with:
  - notion_id: seed to enrich
  - priority: 1 (high) to 5 (low)
  - created_at: ISO timestamp
  - attempts: retry count
  - status: pending | processing | done | failed

Uses Redis sorted sets for priority ordering.
"""

import json
import os
import sys
import time
import datetime

try:
    import redis
except ImportError:
    print("redis-py not installed. Install: pip install redis", file=sys.stderr)
    redis = None

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
QUEUE_KEY = "enrichment:queue"
STATUS_KEY = "enrichment:status"
DEAD_LETTER_KEY = "enrichment:dead_letter"
MAX_RETRIES = 3


def get_redis():
    """Get a Redis connection."""
    if redis is None:
        raise RuntimeError("redis-py not installed")
    return redis.from_url(REDIS_URL)


def enqueue(notion_id: str, priority: int = 3):
    """Add a seed to the enrichment queue."""
    r = get_redis()
    job = {
        "notion_id": notion_id,
        "priority": priority,
        "created_at": datetime.datetime.now().isoformat(),
        "attempts": 0,
        "status": "pending"
    }
    # Score = priority * 1e12 + timestamp (lower = higher priority + FIFO)
    ts = int(time.time() * 1000)
    score = priority * 1e12 + ts
    r.zadd(QUEUE_KEY, {json.dumps(job): score})
    print(f"Enqueued: {notion_id} (priority={priority})")


def enqueue_batch(notion_ids: list[str], priority: int = 3):
    """Add multiple seeds to the queue."""
    r = get_redis()
    pipe = r.pipeline()
    ts = int(time.time() * 1000)
    for i, nid in enumerate(notion_ids):
        job = {
            "notion_id": nid,
            "priority": priority,
            "created_at": datetime.datetime.now().isoformat(),
            "attempts": 0,
            "status": "pending"
        }
        score = priority * 1e12 + ts + i
        pipe.zadd(QUEUE_KEY, {json.dumps(job): score})
    pipe.execute()
    print(f"Enqueued {len(notion_ids)} jobs (priority={priority})")


def dequeue() -> dict | None:
    """Get the next job from the queue (highest priority, oldest first)."""
    r = get_redis()
    # Get the item with the lowest score
    results = r.zrange(QUEUE_KEY, 0, 0)
    if not results:
        return None

    job_str = results[0]
    job = json.loads(job_str)

    # Remove from queue
    r.zrem(QUEUE_KEY, job_str)

    # Mark as processing
    job["status"] = "processing"
    job["started_at"] = datetime.datetime.now().isoformat()
    r.hset(STATUS_KEY, job["notion_id"], json.dumps(job))

    return job


def mark_done(notion_id: str, result: dict = None):
    """Mark a job as completed."""
    r = get_redis()
    status = r.hget(STATUS_KEY, notion_id)
    if status:
        job = json.loads(status)
        job["status"] = "done"
        job["completed_at"] = datetime.datetime.now().isoformat()
        if result:
            job["result"] = result
        r.hset(STATUS_KEY, notion_id, json.dumps(job))


def mark_failed(notion_id: str, error: str):
    """Mark a job as failed. Re-queue if retries remain, else dead-letter."""
    r = get_redis()
    status = r.hget(STATUS_KEY, notion_id)
    if not status:
        return

    job = json.loads(status)
    job["attempts"] = job.get("attempts", 0) + 1
    job["last_error"] = error

    if job["attempts"] < MAX_RETRIES:
        # Re-enqueue with lower priority
        job["status"] = "pending"
        job["priority"] = min(job.get("priority", 3) + 1, 5)
        score = job["priority"] * 1e12 + int(time.time() * 1000)
        r.zadd(QUEUE_KEY, {json.dumps(job): score})
        print(f"Re-queued {notion_id} (attempt {job['attempts']}/{MAX_RETRIES})")
    else:
        # Dead letter
        job["status"] = "dead"
        job["dead_at"] = datetime.datetime.now().isoformat()
        r.hset(DEAD_LETTER_KEY, notion_id, json.dumps(job))
        print(f"Dead-lettered {notion_id} after {MAX_RETRIES} attempts")

    r.hset(STATUS_KEY, notion_id, json.dumps(job))


def queue_size() -> int:
    """Get current queue size."""
    r = get_redis()
    return r.zcard(QUEUE_KEY)


def get_status(notion_id: str) -> dict | None:
    """Get status of a specific job."""
    r = get_redis()
    status = r.hget(STATUS_KEY, notion_id)
    return json.loads(status) if status else None


def process_queue(batch_size: int = 5):
    """
    Process jobs from the queue using the enrichment pipeline.
    Call this from a cron job or run in a loop.
    """
    from pipeline import enrich_seed

    processed = 0
    while processed < batch_size:
        job = dequeue()
        if not job:
            print("Queue empty")
            break

        notion_id = job["notion_id"]
        print(f"\nProcessing: {notion_id} (attempt {job['attempts'] + 1})")

        try:
            result = enrich_seed(notion_id)
            mark_done(notion_id, result)
            processed += 1
        except Exception as e:
            print(f"  Error: {e}")
            mark_failed(notion_id, str(e))
            processed += 1

    print(f"\nProcessed {processed} jobs")
    return processed


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Enrichment job queue")
    parser.add_argument("--enqueue", nargs="+", help="Enqueue notion IDs")
    parser.add_argument("--process", type=int, default=5, help="Process N jobs")
    parser.add_argument("--status", help="Check status of a notion ID")
    parser.add_argument("--size", action="store_true", help="Show queue size")
    args = parser.parse_args()

    if args.enqueue:
        enqueue_batch(args.enqueue)
    elif args.process:
        process_queue(batch_size=args.process)
    elif args.status:
        s = get_status(args.status)
        print(json.dumps(s, indent=2) if s else "Not found")
    elif args.size:
        print(f"Queue size: {queue_size()}")
    else:
        parser.print_help()
