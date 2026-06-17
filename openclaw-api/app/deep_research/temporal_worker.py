"""Phase 2 — self-hosted Temporal harness for Deep Research.

Spec: docs/specs/deep-research-agents.md · Temporal: https://github.com/temporalio

The Phase 1 orchestrator (orchestrator.run_deep_research) already does the
scope → scout → synthesize → report work and is durable via the research_runs
table. Temporal adds the *execution* guarantees: automatic retries with backoff,
crash-replay, timeouts, heartbeats and a Web UI — without changing the agent
code. The orchestrator runs inside a single durable activity here; decompose
into per-scout activities later for step-level recovery (see the comment below).

Run as its own process (see docker-compose.temporal.yml):
    python -m app.deep_research.temporal_worker

`temporalio` is an optional dependency — Phase 1 (RESEARCH_ENGINE=worker) does
not import it. Install only when you turn Phase 2 on: pip install temporalio
"""
import asyncio
import logging
import os
from datetime import timedelta

logger = logging.getLogger(__name__)

TASK_QUEUE = "greenplot-research"
WORKFLOW_PREFIX = "deep-research"

try:
    from temporalio import workflow, activity
    from temporalio.client import Client
    from temporalio.worker import Worker
    from temporalio.common import RetryPolicy
    _HAVE_TEMPORAL = True
except Exception:  # temporalio not installed (Phase 1 default)
    _HAVE_TEMPORAL = False


def _temporal_host() -> str:
    return os.environ.get("TEMPORAL_HOST", "temporal:7233")


if _HAVE_TEMPORAL:

    @activity.defn(name="run_deep_research")
    async def run_research_activity(run_id: str) -> dict:
        """Durable activity wrapping the Phase 1 orchestrator. Heartbeats so a
        long run isn't declared dead; retried by the workflow's RetryPolicy.
        The orchestrator is idempotent per-scout (skips persisted findings), so
        a retry resumes rather than duplicating."""
        from app.database import SessionLocal
        from app.deep_research.orchestrator import run_deep_research
        activity.heartbeat("started")
        db = SessionLocal()
        try:
            return await asyncio.to_thread(run_deep_research, run_id, db)
        finally:
            db.close()

    @workflow.defn
    class DeepResearchWorkflow:
        @workflow.run
        async def run(self, run_id: str) -> dict:
            # Phase 2a: one durable activity = the whole orchestrator.
            # Phase 2b (later): replace with parallel per-scout activities +
            # a synthesize activity, e.g.
            #   scouts = [workflow.execute_activity(scout, (run_id, s), ...)
            #             for s in ("garden","arxiv","openalex","hackernews","rss")]
            #   await asyncio.gather(*scouts)
            #   await workflow.execute_activity(synthesize_and_report, run_id, ...)
            return await workflow.execute_activity(
                run_research_activity,
                run_id,
                start_to_close_timeout=timedelta(minutes=30),
                heartbeat_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(
                    initial_interval=timedelta(seconds=10),
                    backoff_coefficient=2.0,
                    maximum_attempts=3,
                ),
            )


async def _run_worker() -> None:
    if not _HAVE_TEMPORAL:
        logger.error("temporalio not installed — `pip install temporalio` to run the Phase 2 worker. "
                     "Phase 1 (RESEARCH_ENGINE=worker) needs nothing here.")
        return
    client = await Client.connect(_temporal_host())
    worker = Worker(
        client, task_queue=TASK_QUEUE,
        workflows=[DeepResearchWorkflow], activities=[run_research_activity],
    )
    logger.info(f"[temporal] research worker up — host={_temporal_host()} queue={TASK_QUEUE}")
    await worker.run()


async def _start_async(run_id: str) -> str:
    client = await Client.connect(_temporal_host())
    handle = await client.start_workflow(
        DeepResearchWorkflow.run, run_id,
        id=f"{WORKFLOW_PREFIX}-{run_id}", task_queue=TASK_QUEUE,
    )
    return handle.id


def start_workflow(run_id: str) -> str:
    """Sync entrypoint the API uses to launch a run on Temporal. Raises if
    temporalio isn't available or the cluster is unreachable — the caller falls
    back to the Phase 1 Redis worker."""
    if not _HAVE_TEMPORAL:
        raise RuntimeError("temporalio not installed")
    return asyncio.run(_start_async(run_id))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_run_worker())
