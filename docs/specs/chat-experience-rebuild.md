# Chat Experience Rebuild — PRD

**Status:** spec · **Owner:** Freddy

## Problem Alignment

The chat is Greenplot's front door, and today it underdelivers:
1. **Gets stuck** — turns hang with no resolution, no stop button, no error state.
2. **Tool calls run wild** — the agent loops/over-calls tools; the UI shows a
   chaotic stack of raw tool chips.
3. **Sub-par output** — streaming/markdown/formatting feels rough vs. Claude/ChatGPT.
4. **No web/mobile parity** — the dynamic action buttons appear on mobile but
   not web.

### Root causes (from the current code)
- **Hand-rolled streaming agent** (`agent/agent.py`): a manual NDJSON loop with
  `max_rounds=3` + 2 recovery rounds, manual `tool_calls` accumulation,
  `finish_reason` ambiguity, and reasoning-model empty-output retries. **No hard
  per-turn timeout, no cancellation, no deterministic stop** → hangs + runaway tools.
- **Dynamic buttons are `<sugg>…</sugg>` tags written into the model's text**,
  parsed client-side and gated on `isLastAssistant && !isStreaming`. They only
  show if the model complies *and* the stream cleanly closes — so they silently
  vanish on web (stream-end/state edge cases) and vary by model.
- **Tool UI is ~250 lines of bespoke per-tool cards** — impressive but brittle and
  inconsistent; status/order bugs were just patched by hand.
- **Streaming has no robustness layer** — no reconnect, cancel, or explicit
  done/stopped/error states; SSE through the Cloudflare tunnel can buffer oddly.

## Solution Summary

Rebuild the chat on three pillars: **(1) a reliable streaming/agent layer** with
hard limits, cancellation, and clean lifecycle states; **(2) structured,
typed tool + action protocol** (no more parsing tags out of prose); **(3) a
single responsive, Claude/ChatGPT-grade UI** with first-class Greenplot
artifacts. Ship behind a `chat_v3` flag, migrate incrementally.

## System Architecture

### Pillar 1 — Reliable agent & streaming
- **Adopt the AI SDK data-stream protocol natively** on the backend (the
  frontend already uses `useChat`/`DefaultChatTransport`). Emit typed parts
  (text-delta, tool-input, tool-output, finish, error) instead of custom NDJSON.
  This hands streaming lifecycle, tool state, and ordering to the SDK — killing
  the stuck-status / order / sugg-gating bugs structurally.
- **Hard turn budget**: per-turn wall-clock timeout (e.g. 60s) + max tool rounds
  (keep 3) + **max total tool calls** (e.g. 8) → a turn always terminates with a
  finish or a clean error. No infinite "Thinking…".
- **Cancellation**: a Stop button aborts the request; the backend honors client
  disconnect and stops the loop + persists partial output.
- **Deterministic stop**: stop on `finish_reason in (stop, length)` OR no tool
  calls OR budget hit — remove the `finish_reason`-ambiguity heuristics.
- **Chat model is non-reasoning** (deepseek-v4-flash, done) or reasoning-off, so
  no empty-output recovery rounds. A separate **"Think harder"** mode opts into a
  reasoning model explicitly.
- **Idempotent tools** + dedupe identical calls within a turn → stops runaway.

### Pillar 2 — Structured tool & action protocol
- **Suggested actions become a typed field**, not `<sugg>` tags in prose. The
  agent emits `suggested_actions: [{label, prompt, kind}]` as a final data part.
  Rendered identically on web + mobile; never depends on stream-end timing or
  model formatting. *(Fixes the web/mobile button gap at the root.)*
- **Tool calls render as a single collapsible "working" timeline** ("Searched
  your garden → 3 seeds → drafting"), not a stack of raw chips. Each tool maps to
  a typed result card via a small registry (seed/spec/wiki/graph/paper), with one
  generic fallback — replacing the 250-line special-case block.
- **Tool transparency**: show inputs/outputs on expand; clear running→done→error
  per step (already half-fixed).

### Pillar 3 — Claude/ChatGPT-grade UI, Greenplot-tailored
- **Message lifecycle UI**: Thinking → streaming text → Stop / Regenerate /
  Copy / Edit-and-resend. Clear stopped & error banners with retry.
- **Polished markdown**: code blocks with copy + syntax highlight, tables, math
  if needed, tight typography parity with the rest of the app.
- **Greenplot Artifacts** (the differentiator): when a turn produces a spec /
  wiki article / design vision / garden graph, it opens as an **artifact** —
  side panel on desktop, bottom sheet on mobile — that you can read, edit, and
  push to Studio/Library. Ties chat directly into the build loop.
- **Garden grounding, visible**: the "Searched your garden" chip expands to the
  exact seeds/wiki used, each a link — trust + provenance.
- **Context-aware action chips** (typed, from Pillar 2): "Plant as seed", "Turn
  into a PRD", "Add to wiki", "Go deeper" — Greenplot verbs, not generic prompts.
- **One responsive component**: kill the web/mobile divergence; test both; ensure
  SSE flushes through the Cloudflare tunnel (disable proxy buffering / send
  keep-alive pings).

## Scope & Capabilities
**In (v1):** AI-SDK-protocol backend (`chat_v3`), turn timeout + tool budget +
cancellation, typed suggested-actions, collapsible tool timeline + result-card
registry, Stop/Regenerate/Copy/Edit, polished markdown/code, web↔mobile parity,
expandable garden provenance.
**Phase 2:** Artifacts panel (spec/wiki/vision/graph) with edit→Studio/Library,
"Think harder" reasoning mode, message branching, attachments parity.
**Out:** multi-user chat, realtime collab in chat, voice rewrite (keep current).

## Delivery Risks & Open Questions
- **Protocol migration**: emitting the AI SDK stream from the custom agent is the
  riskiest piece — do it behind `chat_v3`, keep `chat_v2` until parity is proven.
- **Tool-card registry**: must cover today's rich outputs (viz, write_spec,
  ingest_paper, wiki, seeds) before cutover — inventory them first.
- **Cloudflare tunnel + SSE**: confirm streaming isn't buffered; add periodic
  flush/heartbeat so "stuck" isn't just a buffering artifact.
- **Cost/latency**: keep chat on the fast model; artifacts/deep mode opt-in.
- **Open**: do we keep the bespoke agent or move to a framework (e.g. the AI SDK
  server `streamText` + tools) to delete most hand-rolled loop code? Recommend
  evaluating a thin migration — big reliability win, but a real lift.

## Milestones
1. **Reliability layer**: turn timeout + tool budget + cancellation + clean
   finish/error states on the current agent (fast win, fixes "stuck") (2 d)
2. **Typed suggested-actions** (replace `<sugg>`), web/mobile parity (1.5 d)
3. **AI SDK data-stream protocol** behind `chat_v3` + tool-state via the SDK (3 d)
4. **Tool timeline + result-card registry** (replace bespoke block) (2 d)
5. **Stop/Regenerate/Copy/Edit + markdown/code polish** (2 d)
6. **(Phase 2)** Greenplot Artifacts panel + "Think harder" mode
