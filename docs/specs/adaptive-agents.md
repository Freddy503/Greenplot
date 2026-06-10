# Adaptive Studio Agents — The Knowledge Ledger — PRD

**Status:** ready · **Owner:** Freddy · **Target:** ~4 days

## Decisions (made with Freddy)

**Ledger engine, light**: a backend pre-pass builds a knowledge ledger persisted in seed
metadata; the chat agent receives it plus adaptive instructions (no full state machine — chat
stays the driver). **Budget: max 5 questions + confirmations**, one drill-down per weak answer.
**Scope: all six Studio agent surfaces at once** — Spec it, Shape-the-vision, Define-the-problem,
Brainstorm, Pressure-test, Devil's advocate (Deep Dive follows v1.1).

## Problem Alignment

The Studio "agents" are static scripts: Spec-it asks 11 fixed questions in order even when the
user's garden, the paper's full text, the product problem and the repo already answer most of
them; the vision interrogation asks WHO when a seed states it verbatim. Users repeat themselves
to their own knowledge system — the one failure a second brain must never have. Questions must
be earned by genuine unknowns, follow the answer rather than the script, and survive
interruption.

## Solution Summary

A shared **knowledge ledger**: before the first question, a `build_ledger` tool sweeps
everything already known (related seeds, the source paper's doc tree, the MAIN product's
problem/pillars, the repo map, prior session state, rubric/overlap metadata) and returns
per-slot status — **known** (with evidence + a one-line confirmation), **weak**, or **unknown**
(with a suggested question). Every agent follows one adaptive protocol: confirm the known in a
single block, ask ≤5 questions targeting only unknown/weak slots, one drill-down max, flag
contradictions against evidence, then deliver. The ledger persists in seed metadata —
interrupted sessions resume instead of restarting.

## System Architecture

- **`agent_ledger.py`** (new): `LEDGER_SLOTS` per kind — `spec` (11 gstack slots), `vision`
  (who, demand_evidence, why_us_now, wedge, taste), `problem` (who_hurts, evidence, cost,
  why_now), `brainstorm` (core_idea, adjacent_unexplored, tensions, why_now), `pressure`
  (weakest_assumptions, missing_evidence, failure_modes, overlap_risk), `devil`
  (strongest_counter, disconfirming_evidence, alternative_path). `build_ledger(kind, seed_id?)`:
  gathers context (subject content ≤3K, top-5 related seeds, MAIN product, source paper's
  doc-tree summaries, repo map ≤2K, rubric/overlaps for pressure), one LLM call → JSON slots,
  persists `interrogation: {kind, ledger, at}` to the subject seed (resume window 7 days).
- **`build_ledger` tool**: registered in the agent registry; every mode's FIRST ACTION.
  Returns `{resumed, slots: [{slot, status, evidence, confirmation?, question?}]}`.
- **Adaptive protocol** (shared block in all six prompts): (1) call build_ledger first,
  (2) one compact confirmation block for knowns — never ask about them, (3) ≤5 questions, one
  at a time, unknown/weak only, highest-leverage first, (4) one drill-down per weak answer,
  (5) name contradictions against evidence, (6) budget spent or slots filled → deliver.
- **Mode rewrites** (`thinking-modes.ts` + the two Studio prefill directives): Spec-it's 11
  questions become ledger slots (structure/output unchanged, write_spec unchanged); Brainstorm
  diverges from the ledger's *edges* (unexplored adjacent seeds, tensions); Pressure-test
  attacks the draft's actual weak slots + rubric failures + OVERLAPS; Devil's advocate builds
  the strongest evidence-grounded counter-case, then steelmans a resolution.

## Data Model

Subject seed metadata += `interrogation: {kind, ledger: [...], at}`. No new tables.

## API Surface

`build_ledger(kind, seed_id?)` (chat tool) — no REST endpoint needed; the agent loop owns it.

## Acceptance Evals

1. Spec-it on a parsed paper's idea opens with ≥3 confirmations sourced from the paper/garden
   and asks ≤5 questions (was: 11 always).
2. Shape-the-vision on a PRD whose draft already names the user opens by confirming WHO, not
   asking it.
3. Pressure-test on a ROUGH/OVERLAPS draft names the rubric failures and the overlapped PRD in
   its first attack.
4. Abandon an interrogation after 2 answers → reopening resumes with the ledger intact
   (`resumed: true`), no repeated questions.
5. No session ever exceeds 5 questions before delivering.

## Delivery Risks & Open Questions

- Model discipline on the budget: the protocol states it three ways; eval 5 guards it.
- Ledger wrong-confidence (marking weak things known): confirmations are shown for correction —
  the user veto is the safety net, one tap of friction instead of five questions.
- Open (v1.1): Deep Dive page on the same engine; ledger-aware question phrasing per user
  expertise.

## Milestones

1. agent_ledger.py + tool + registry (1.5 days — eval 4)
2. Six prompt rewrites on the shared protocol (1.5 days — evals 1, 2, 5)
3. Pressure/devil rubric+overlap grounding (1 day — eval 3)
