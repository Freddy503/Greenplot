"""
task_worker.py
Standalone enrichment worker — reads jobs from Redis queue, runs enrichment.
Run: python -m app.task_worker
Or: python app/task_worker.py

This is the Task Service in the architecture. It runs as a separate process
(not inline in the API), so harvest endpoints return instantly.
"""

import os
import sys
import time
import signal
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [worker] %(levelname)s %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("enrichment-worker")

# ── Setup Django/SQLAlchemy context ──
# Add parent dir to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.task_broker import dequeue_enrichment, update_task_status, get_queue_depth
from app.database import engine
from sqlalchemy.orm import Session
from sqlalchemy import text

# Graceful shutdown
_running = True

def _shutdown(signum, frame):
    global _running
    log.info("Shutting down...")
    _running = False

signal.signal(signal.SIGTERM, _shutdown)
signal.signal(signal.SIGINT, _shutdown)


def process_job(job: dict, db: Session):
    """Dispatch a queue job: thought enrichment (default) or paper parsing."""
    task_id = job["task_id"]
    tenant_id = job["tenant_id"]

    # Research-paper full-text parsing (spec: docs/specs/paper-parsing-pipeline.md)
    if job.get("type") == "paper_parse":
        seed_id = job["seed_id"]
        log.info(f"Processing paper_parse {task_id[:8]}... seed={seed_id[:8]}...")
        try:
            from app.paper_pipeline import parse_paper_for_seed
            result = parse_paper_for_seed(seed_id, tenant_id, db)
            if result.get("status") == "ok":
                update_task_status(task_id, "completed", result=result)
                log.info(f"✅ Paper parsed: {result.get('chunks')} chunks ({result.get('source')})")
            else:
                update_task_status(task_id, "error", error=result.get("message", "parse failed"))
                log.error(f"❌ Paper parse failed: {result.get('message')}")
        except Exception as e:
            update_task_status(task_id, "error", error=str(e))
            log.error(f"❌ Paper parse crashed: {e}")
        return

    thought_id = job["thought_id"]

    log.info(f"Processing task {task_id[:8]}... thought={thought_id[:8]}...")

    try:
        from app.enricher_v2 import enrich_thought_v2
        result = enrich_thought_v2(thought_id, tenant_id, db)

        if result:
            update_task_status(task_id, "completed", result={
                "seed_id": str(result.id) if hasattr(result, 'id') else None,
                "title": result.title if hasattr(result, 'title') else None,
            })
            log.info(f"✅ Completed: {getattr(result, 'title', 'unknown')}")

            # Activity log
            try:
                from app.activity import log_enrichment_done
                log_enrichment_done(tenant_id, thought_id[:30], getattr(result, 'title', ''))
            except:
                pass
        else:
            update_task_status(task_id, "completed", result={"note": "no result returned"})
            log.info(f"✅ Completed (no seed returned)")

    except Exception as e:
        update_task_status(task_id, "error", error=str(e))
        log.error(f"❌ Failed: {e}")


def run_worker():
    """Main worker loop — poll Redis queue for enrichment jobs."""
    log.info("🔧 Enrichment worker started")
    log.info(f"   Redis queue: enrichment:queue")

    # Create a persistent DB session
    with Session(engine) as db:
        idle_count = 0
        while _running:
            try:
                job = dequeue_enrichment(timeout=3)

                if job:
                    idle_count = 0
                    process_job(job, db)
                else:
                    idle_count += 1
                    if idle_count == 1:
                        log.info("⏳ Queue empty, waiting...")
                    elif idle_count % 60 == 0:
                        depth = get_queue_depth()
                        log.info(f"⏳ Still idle ({idle_count}s), queue depth: {depth}")

            except Exception as e:
                log.error(f"Worker error: {e}")
                time.sleep(2)

    log.info("Worker stopped.")


if __name__ == "__main__":
    run_worker()
