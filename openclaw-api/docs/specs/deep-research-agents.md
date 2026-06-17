# Deep Research agents — which harness?

**Question (2026-06-16):** "Sprawl out long-running subagents that connect the
dots in my garden, find a gap across many sources, share context, and email me a
report. Which harness do I need?"

**Short answer:** You don't need a new *agent framework* (LangGraph / CrewAI /
AutoGen / OpenAI Agents SDK) — you already have the agent layer. What you're
missing is a **durable execution layer** for long-running, multi-step jobs.
Start by building it on your existing stack; graduate to **self-hosted Temporal**
only when runs get long enough to need step-level crash recovery. Keep it
self-hosted on Hetzner — EU data sovereignty is a Greenplot differentiator, so
avoid US-cloud orchestration/observability SaaS.

## Two layers people conflate as "the harness"
1. **Agent orchestration** — how subagents are defined, scoped to tools, share
   context, fan out/in. **You already have this:**
   - `app/agent/agent.py` — streaming tool-calling loop (deadline, max rounds).
   - `app/agent/subagents.py` — `SubagentRunner.spawn()`, `SubagentManifest`,
     `SubagentToolExecutor` (restricted registries), `create_subagent_tool_spec`
     (the main agent can already spawn subagents *as a tool*).
   - `app/sources/` (OpenAlex/HN/RSS) + arXiv + garden graph + backlinker +
     `garden_skimmer` (gap/trend insight agents) — the "many sources" + "find a
     gap" raw material.
   - `app/email_sender.py` (Resend) — the "report back by email" channel.
   - APScheduler (`BackgroundScheduler`) — triggers (spark/briefing/digest).
2. **Durable execution** — how a job runs for minutes→hours, fans out work,
   persists progress + partial results, survives restarts, retries on failure,
   then delivers. **This is the gap:**
   - `SubagentRunner` runs subagents as in-process `asyncio.create_task`; the
     manifest store is `self._manifests: dict` (in-memory — *"replace with DB in
     production"*). Dies on restart, no persistence, no retry.
   - `app/task_worker.py` is an at-most-once Redis loop: dequeue → run → mark
     status. No retries, no long-run state, jobs lost if Redis is flushed.

So the answer is about **layer 2**, not layer 1.

## Options for the durable layer

| Option | What it gives | Cost / fit | Verdict |
|---|---|---|---|
| **A. Build on your stack** (Postgres `research_run` table + a `deep_research` job type on the existing Redis worker) | Durable progress + partial findings, restartable, fan-out as enqueued sub-jobs, reuse SubagentRunner + sources + Resend | Lowest friction; you own it; 100% EU-hosted | **Start here** |
| **B. Temporal (self-hosted on Hetzner)** | Step-level durability, deterministic replay, retries+backoff, parallel fan-out/fan-in, timers, hour+ runtimes, great observability | Real infra (server + DB + workers); steeper learning curve | **Graduate here** when runs go long / need bulletproof recovery |
| C. Inngest | Event-driven durable steps, simpler than Temporal | Easy mode is **US cloud** (sovereignty risk); self-host is younger | Only if you accept the hosting trade-off |
| D. LangGraph / CrewAI / AutoGen / OpenAI Agents SDK | Multi-agent graph authoring | **Overlaps your custom agent** — you'd discard working code; still needs a queue/Temporal under it for durability; LangSmith is US cloud | **Avoid** as "the harness" |

The trap: D markets itself as the harness, but it solves layer 1 (which you've
already built) and *not* layer 2. You'd rewrite working code and still need A or
B underneath for long-running durability.

## Recommended architecture — "Deep Research Run"

Phase 1 (build-on-stack), reusing what exists:

```
trigger (manual button / schedule / chat "go deep on X")
  → enqueue deep_research job  (task_broker)
  → orchestrator (task_worker: new job type)
      1. SCOPE: pick a theme/cluster from the garden graph + a detected gap
               (reuse garden_skimmer gap/trend detection + backlinker edges)
      2. FAN OUT scouts — one persisted sub-job per source, in parallel:
               garden-scout · arxiv-scout · openalex-scout · hn-scout · rss-scout
               (reuse app/sources/ + the paper full-text pipeline)
      3. Each scout writes findings + citations to research_run (Postgres) →
               durable, survives restarts, resumable
      4. SYNTHESIZE: a gap-finder agent reads all scout findings + the garden
               graph, names the gap, connects the dots, proposes next steps
      5. REPORT: render markdown → Resend email; also save as a wiki article +
               a "research run" seed so it's in the garden + MCP-readable
```

New, small:
- `app/models.py`: `ResearchRun` + `ResearchFinding` tables (status, theme,
  gap, per-scout findings, citations, report_md, timestamps).
- `app/deep_research/orchestrator.py`: the scope→fan-out→synthesize→report flow.
- `task_worker`: handle `type == "deep_research"` and `type == "research_scout"`.
- `task_broker`: `enqueue_deep_research`, `enqueue_scout`.
- `email_sender.py`: `send_research_report_email`.
- Resumability = the worker re-reads `ResearchRun` state; a scout that already
  has findings is skipped. Retry = re-enqueue the scout job (add a `retries`
  column + cap).

Phase 2 (Temporal) — only if/when runs routinely exceed ~10–15 min or you want
true crash-replay: lift the same orchestrator into a Temporal **workflow**, the
scouts become **activities** (idempotent, auto-retried), timers/heartbeats handle
long fetches. Self-host the Temporal cluster on Hetzner to stay EU-resident. The
agent + sources + email code is unchanged — only the conductor swaps.

## Bottom line
- **Harness you need:** a durable-execution layer, *not* an agent framework.
- **Now:** build it on Postgres + your Redis worker + `SubagentRunner` + `sources/`
  + Resend. You already have ~80% of it.
- **Later:** self-hosted **Temporal** when long-running durability/observability
  becomes the bottleneck.
- **Don't:** adopt LangGraph/CrewAI/etc. as the harness — wrong layer, discards
  working code, and the hosted parts break EU data residency.

---

## Implemented

### Phase 1 — build-on-stack (shipped)
- **Models** (`models.py`): `ResearchRun` (durable run-of-record: status, theme,
  gap, report_md, finding_count, result_seed_id, engine) + `ResearchFinding`
  (per-scout hit). Auto-created via `create_all`.
- **Orchestrator** (`deep_research/orchestrator.py`): `run_deep_research(run_id,
  db)` — scope (themes + garden slice) → scout (garden + arXiv + OpenAlex + HN +
  RSS, concurrent, every finding persisted) → synthesize (gap-finder LLM names
  the gap, connects the dots, cites sources, proposes moves) → report (planted as
  a garden seed + emailed). **Idempotent per scout** (skips sources that already
  have findings) so a restarted worker resumes.
- **Worker** (`task_worker.py` + `task_broker.py`): new `deep_research` job type
  (lowest priority, never starves enrichment/parsing); `enqueue_deep_research`.
- **Email** (`email_sender.py`): `send_research_report_email` (branded brief with
  the gap callout + "open in garden").
- **API**: `POST /research/deep` (kick off; inline fallback if the queue is
  down), `GET /research/runs/{id}` (status/report), `GET /research/runs` (list).
- **Delivery**: planted as a garden seed (full-text + MCP-readable) **+ email**
  (`send_research_report_email`) **+ push/bell** (`notify.notify_user`, worker-safe)
  deep-linking to the report.
- **Frontend trigger**: a "Deep Research" launcher on the garden page (optional
  theme input + "Go deep"), Next proxy routes `/api/research/deep` +
  `/api/research/runs`, an in-progress status chip (polls while active), and a
  one-tap link to the latest report.

### Depth upgrade — full-text + 1M context (not a fast snippet pass)
The background run is now the *deepest* of the two Deep Researches (the other is
the interactive chat `research` thinking-mode):
- **Scouts include Exa** web search alongside garden + arXiv + OpenAlex + HN + RSS.
- **Reads sources in full:** the top ~14 external findings are pulled as full
  machine-readable text (Exa `/contents`, handles arXiv/journal/article pages),
  not snippets.
- **Two passes:** (1) decompose the focus into 3-5 sharp sub-questions; (2) a
  **1M-context model** (`DEEP_RESEARCH_MODEL`, default `google/gemini-2.5-pro`)
  reasons over *all* the full texts at once and writes an inline-cited [S#] brief.
- **Proper Greenplot artifact:** saved as a `research_brief` seed with the same
  rigorous shape as the chat mode (TL;DR · what your garden knows · what the
  research says, per sub-question · The Gap · next moves · Sources), so it reads
  like a real brief — not a dump — and is full-text + MCP-readable.
- Naturally takes minutes (full-text reads + big synthesis) — which is exactly
  why it belongs on the long-running harness, and what Phase 2/Temporal is for.

### Phase 1 orchestrator is now composable
`scope_run` → `scout_one(source)` (idempotent per source) → `synthesize_and_report`
(LLM + seed + email + push). The Redis worker calls them sequentially; Temporal
runs the scouts as parallel durable activities — same functions, two harnesses.

### Phase 2 — self-hosted Temporal (built; flip a flag to adopt)
- **`docker-compose.temporal.yml`**: official `temporalio` images (auto-setup +
  UI + its Postgres) + a `research-worker` service — all on Hetzner (EU-resident).
- **`deep_research/temporal_worker.py`**: `DeepResearchWorkflow` + a durable
  `run_deep_research` activity (retries w/ backoff, 30-min timeout, heartbeats)
  that reuses the **same Phase 1 orchestrator** — idempotency makes retries
  resume, not duplicate. `start_workflow()` is the sync entrypoint the API uses.
  `temporalio` is an **optional** dep (gated import) — Phase 1 never needs it.
- **Switch**: `RESEARCH_ENGINE=temporal` + `TEMPORAL_HOST` route `POST
  /research/deep` to Temporal (falls back to the Redis worker on any error).
  Phase 2b (later): split the single activity into parallel per-scout activities
  for step-level recovery — the workflow already has the comment showing how.

**To turn on Phase 2:** uncomment `temporalio` in requirements, rebuild, bring up
`docker-compose.temporal.yml`, set `RESEARCH_ENGINE=temporal`. No agent-code
changes — only the conductor swaps.
