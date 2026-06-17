"""Phase 2 — self-hosted Temporal harness for Deep Research.

Spec: docs/specs/deep-research-agents.md · Temporal: https://github.com/temporalio

The workflow drives the *same* composable steps as the Phase 1 orchestrator, but
each becomes a durable Temporal activity: scope → N parallel scout activities →
synthesize. Temporal adds automatic retries with backoff, crash-replay, timeouts,
heartbeats and a Web UI — no changes to the agent/source/email code. Scouts are
idempotent (skip already-persisted findings) so a retry resumes, not duplicates.

Run as its own process (see docker-compose.temporal.yml):
    python -m app.deep_research.temporal_worker

`temporalio` is imported lazily — the Phase 1 worker (RESEARCH_ENGINE=worker)
never touches this module.
"""
import asyncio
import logging
import os
from datetime import timedelta

logger = logging.getLogger(__name__)

TASK_QUEUE = "greenplot-research"
WORKFLOW_PREFIX = "deep-research"
SCOUTS = ["garden", "exa", "arxiv", "openalex", "github", "hackernews", "rss"]

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

    # Activities wrap the sync orchestrator steps; each gets its own DB session.
    @activity.defn(name="scope")
    async def scope_activity(run_id: str) -> list[str]:
        from app.database import SessionLocal
        from app.deep_research.orchestrator import scope_run
        db = SessionLocal()
        try:
            return await asyncio.to_thread(scope_run, run_id, db)
        finally:
            db.close()

    @activity.defn(name="scout")
    async def scout_activity(run_id: str, source: str, themes: list[str]) -> int:
        from app.database import SessionLocal
        from app.deep_research.orchestrator import scout_one
        activity.heartbeat(source)
        db = SessionLocal()
        try:
            return await asyncio.to_thread(scout_one, run_id, source, themes, db)
        finally:
            db.close()

    @activity.defn(name="synthesize")
    async def synthesize_activity(run_id: str) -> dict:
        from app.database import SessionLocal
        from app.deep_research.orchestrator import synthesize_and_report
        activity.heartbeat("synthesizing")
        db = SessionLocal()
        try:
            return await asyncio.to_thread(synthesize_and_report, run_id, db)
        finally:
            db.close()

    @workflow.defn
    class DeepResearchWorkflow:
        @workflow.run
        async def run(self, run_id: str) -> dict:
            retry = RetryPolicy(initial_interval=timedelta(seconds=10),
                                backoff_coefficient=2.0, maximum_attempts=3)
            themes = await workflow.execute_activity(
                scope_activity, run_id,
                start_to_close_timeout=timedelta(minutes=5), retry_policy=retry,
            )
            # Fan out scouts in parallel — durable, each retried independently.
            await asyncio.gather(*[
                workflow.execute_activity(
                    scout_activity, args=[run_id, source, themes],
                    start_to_close_timeout=timedelta(minutes=10),
                    heartbeat_timeout=timedelta(minutes=2), retry_policy=retry,
                )
                for source in SCOUTS
            ])
            return await workflow.execute_activity(
                synthesize_activity, run_id,
                start_to_close_timeout=timedelta(minutes=10),
                heartbeat_timeout=timedelta(minutes=3), retry_policy=retry,
            )


async def _run_worker() -> None:
    if not _HAVE_TEMPORAL:
        logger.error("temporalio not installed — `pip install temporalio` to run the Phase 2 worker.")
        return
    client = await Client.connect(_temporal_host())
    worker = Worker(
        client, task_queue=TASK_QUEUE,
        workflows=[DeepResearchWorkflow],
        activities=[scope_activity, scout_activity, synthesize_activity],
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
