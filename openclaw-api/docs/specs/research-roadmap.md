# Research system — where we are & what's next

**Date:** 2026-06-18 · A step-back after building the research stack end-to-end.

## What we now have (end-to-end)

```
CAPTURE            ENRICH / INDEX           DISCOVER                 SYNTHESIZE                 DELIVER / ACT
─────────          ──────────────           ────────                ───────────                ─────────────
seeds, chat        full-text compile        Research Digest         Deep Research (durable):   garden seed (formatted,
PDF upload    →    (machine-readable    →   (arXiv·OpenAlex·   →    scope→scouts→read full →   markdown-rendered) +
papers/links       + MCP-readable)          HN·RSS·GitHub·Exa)      text→1M synth (minimax-m3) email (+ PDFs attached)
                   Weaviate chunks          + garden graph          → cited [S#] brief         + push/bell + MCP read
```

Concretely, this session shipped: reliable PRD save; robust PDF indexing; a
unified `…` action menu (delete everywhere); **MCP full-text** (`get_paper_fulltext`,
`list_papers`); frictionless invite links; a **multi-source Research Digest**;
and a **Deep Research** system that is durable (Postgres run-of-record + Redis
worker, Phase-2 self-hosted Temporal with parallel scout activities), reads
sources **in full** with a **1M-context model**, emits a **structured cited
brief**, **embeds + attaches the relevant papers**, and notifies by email + push.

That's a complete *inbound* research pipeline: from raw curiosity to a grounded,
cited brief that lands in the garden and the inbox.

## The gap to "more useful": the loop is open

The system informs, but it doesn't yet **act**, **compound**, or **run itself**:
1. **Research → action is manual.** A brief names "next moves" (draft a PRD, run
   an experiment) but the user re-types them. Greenplot's whole thesis is
   research → *buildable spec*; that last hop is a copy-paste today.
2. **Runs don't compound.** Each Deep Research starts cold — no memory of what it
   already explored, which gaps it named, which papers it read. It can re-surface
   the same things. Value should accrue run over run.
3. **It only runs when poked.** "Go deep" is a button. The promised "long-running
   agents that work while you sleep" needs a schedule.
4. **Single-pass synthesis.** We read full text, but synthesize once. The chat
   `research` mode already does corrective retrieval; the PRD pipeline already
   does critique-and-revise (PRD_PIPELINE_V2). The background brief doesn't yet.
5. **Cost is now real.** 1M-context synthesis + full-text fetches per run is the
   most expensive path in the app. Autonomous/scheduled runs make this acute.

## Prioritized next steps

### P0 — Close the loop: brief → action (highest leverage, mostly reuse)
From a brief, one tap to:
- **"Draft a PRD from this gap"** → feed the gap + cited sources into the existing
  `write_spec` / auto-PRD pipeline → a spec in Studio. This is the research→build
  hop that makes Greenplot's thesis real, and we already have every piece.
- **"Read this paper in full"** → the relevant papers are already saved + indexed;
  surface a one-tap "ingest + summarize" / open in chat.
- **"Go deeper on this"** → spawn a follow-up run scoped to one sub-question of the
  brief (uses the topic-direct scouting we just built).
Why first: turns research from informative to *productive*, and it's a thin UI +
glue layer over systems that already exist.

### P1 — Make it proactive + compounding
- **Scheduled Deep Research** (reuse APScheduler): a weekly autonomous run on the
  user's top theme/cluster → brief in the inbox Monday morning. The "second brain
  works while you sleep." Gate behind a per-user opt-in + the cost cap below.
- **Research memory:** persist named gaps + read papers per user (we have the
  `research_runs`/`research_findings` tables — add a thin "explored" index). New
  runs skip what's covered and explicitly build on prior gaps ("last week you
  found X; here's what moved").
- **Garden-native gap detection** (reuse `garden_skimmer`): pick the run's target
  from *disconnected clusters* in the user's own graph — "these 3 things never
  connect; here's the bridge" — not just themes.

### P2 — Quality, trust, breadth, cost
- **Critique-and-revise brief** (mirror PRD_PIPELINE_V2): a second pass that
  checks every [S#] claim against its source and tightens the gap. Biggest
  quality lever now that retrieval is solid.
- **Cost guardrails:** per-user run cap + a cheaper "lite" mode (skip full-text
  read / smaller model) vs "deep" mode; surface spend in the admin dashboard
  (we already track tokens there).
- **Source breadth/personalization:** Settings toggles per source; per-user
  GitHub (starred repos) + Reddit (the Tier-3 we skipped) + Semantic Scholar
  citation-graph expansion ("papers that cite the key paper").
- **Unify the two Deep Researches:** kick a background run *from* a chat thread,
  and open a background brief *into* chat to interrogate it. Find the gap
  autonomously, then discuss it interactively.

## Implemented (P0–P2, 2026-06-18)

**P0 — brief → action (loop closed):**
- `app/deep_research/actions.py`: `brief_to_prd` (gap + brief → PRD via `write_spec`)
  and `brief_deeper` (follow-up run scoped to the gap, with `parent_run_id`).
- Endpoints `POST /research/brief/{seed_id}/to-prd` + `/deeper`; proxy routes
  `/api/research/brief/[seedId]/{to-prd,deeper}`.
- Seed sheet shows **"Draft PRD from gap"** + **"Go deeper"** on a brief.

**P1 — proactive + compounding:**
- `_job_weekly_research` (APScheduler, Mon 07:30 CET): one autonomous run for each
  user with `consents.weekly_research`. Settings toggle **"Weekly Deep Research"**.
- **Research memory:** synthesis now feeds the last 5 runs' gaps into the prompt
  ("build on these, don't repeat").

**P2 — quality, cost, breadth:**
- **Critique-and-revise** (`RESEARCH_CRITIQUE`): a second editor pass checks every
  [S#] claim + sharpens the gap (deep mode).
- **Cost guard:** `RESEARCH_DAILY_CAP` (per-user deep runs/day → 429); **Lite/Deep
  mode** (`run.mode`) — lite skips full-text reads + uses the cheap model. Garden
  launcher has a Deep/Lite toggle.
- New columns `research_runs.mode` + `parent_run_id` (model + defensive startup ALTER).

Verified: backend syntax + import clean (actions, model columns); tsc clean;
garden/settings compile 200; brief proxy routes resolve + forward to the backend.

## Recommendation

**Do P0 next.** The inbound pipeline is strong; the missing magic is the
*outbound* hop — a brief you can act on in one tap. "Draft a PRD from this gap"
closes Greenplot's signature research→build loop using `write_spec` + the brief
we already produce, for a small UI + glue cost. Pair it with the **scheduled
weekly run (P1)** so the system both *works on its own* and *hands you something
buildable* — that's when it stops being a research tool and becomes a research
*partner*. Layer in cost guardrails before turning autonomous runs on widely.
