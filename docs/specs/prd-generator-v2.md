# PRD Generator v2 — Engineering-Grade Drafts — PRD

**Status:** ready · **Owner:** Freddy · **Target:** ~1 week

## Problem Alignment

The auto-PRD pipeline works, but its drafts read like good essays, not buildable specs. Cross-checked against the hand-written house standard (e.g. `paper-parsing-pipeline.md`), the ContextOS draft had zero quantification, no data model, no API surface, free-floating components unconnected to any codebase, block-sized unverifiable milestones, and no acceptance criteria. Root cause is structural: a single LLM pass over paper chunks cannot produce engineering detail — it has no rubric to fail against and no codebase to ground in. Per Vishnyakova (2026), a PRD handed to a coding agent is a *context contract*: it must be sufficient, provenance-backed, and deterministic — today's drafts aren't.

## Solution Summary

Replace single-pass generation with a **three-stage pipeline: ground → draft → critique-and-revise**. Stage 1 assembles richer context (paper chunks + related seeds + the connected repo's map when available). Stage 2 drafts against Template v2, which adds Data Model, API Surface, and Acceptance Evals sections with hard detail requirements. Stage 3 scores the draft against a 7-point rubric (the cross-check table, mechanized) and revises once to fix every failure. Drafts that still fail ≥3 rubric points are labeled `quality: rough` instead of silently shipped.

## System Architecture

- **Rubric** (`auto_prd.py`: `PRD_RUBRIC_V2`): 7 machine-checkable demands — (1) ≥6 concrete numbers (budgets/limits/latencies), (2) data model with named fields, (3) ≥3 endpoint/tool signatures, (4) every component names its file/module (repo-grounded when a repo is connected, else proposed paths), (5) milestones each end in a verifiable deliverable, (6) ≥3 acceptance evals an agent can run, (7) ≥2 committed decisions with stated alternatives. The critique pass returns JSON `{score, failures[]}`; the revise pass receives the failures verbatim.
- **Template v2** (`PRD_TEMPLATE_V2`): house sections plus **Data Model**, **API Surface**, **Acceptance Evals**, and a closing **Agent State File** block — a deterministic, copy-pasteable `CLAUDE.md`-style contract: hard constraints, conflict priority (spec > repo conventions > agent judgment), do-not-touch list, token/cost budget (Vishnyakova §3, §4, §8, §10 — adopted because they serve detail, not ceremony).
- **Generation flow** (`generate_prd_draft` v2): draft (max_tokens 8000) → critique (1200) → revise (8000). All three on `CHAT_MODEL` with the existing empty-content fallback. Roughly 2.5× current cost ≈ $0.02–0.04/draft at Flash pricing — capped by the existing 3/day limit.
- **Repo grounding hook**: when the project has a connected repo (see `github-repo-sync.md`), Stage 1 injects the cached repo map (≤3K tokens); the rubric's point (4) then demands real paths.
- **Backfill**: `vision_status='pending'` auto-drafts get a "Regenerate with v2" action reusing the manual draft endpoint.

## Scope & Capabilities

**In:** rubric + critique/revise loop, Template v2 with the four new sections, quality label on drafts that still fail, repo-map injection when available, regenerate action, rubric unit tests (assert section headers + numeric density on a fixture).
**Out (v1):** more than one revise iteration, human-in-the-loop rubric editing, per-section regeneration, multi-paper synthesis.

## Acceptance Evals

1. Regenerating the ContextOS draft yields: a data-model section with ≥2 named tables/classes incl. fields; ≥3 API signatures; ≥6 quantified budgets/limits; milestones each naming a checkable artifact.
2. Critique JSON parses and lists failures for a deliberately hollow fixture draft.
3. A draft failing ≥3 rubric points renders the `ROUGH` label in Studio, not a clean AUTO pill.

## Milestones

1. Rubric + Template v2 + critique/revise loop behind a `PRD_PIPELINE_V2` flag (2 days — deliverable: ContextOS regenerated, passes evals 1–2)
2. Quality label in Studio + regenerate action (1 day — deliverable: eval 3)
3. Repo-map injection once github-repo-sync lands (1 day)
