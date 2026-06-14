# Post-Launch Backlog

Deferred work — intentionally postponed to ship sooner. Pick up after the
private beta is stable.

## Canvas collaboration — remaining milestones

Shipped in beta (v1): `CanvasShare` model + `resolve_canvas_access` gate, share/
accept/revoke/list endpoints + email invite, Studio Share button, and a
**view-only** collaborator experience. See `docs/specs/canvas-sharing.md`.

### M4 — GDPR delete cascade + audit (do before scaling)
- Account delete and seed/product delete must **purge `CanvasShare` rows** for
  the affected canvas (both as owner and as collaborator).
- When a product (canvas) is deleted, revoke all its shares.
- Add audit logging for share create / accept / revoke (actor + canvas + time).
- Containment test in CI: a collaborator token must get 403 on any seed that is
  not the shared product or one of its attached PRDs.
- **Why deferred:** no real collaborators yet; not a launch blocker, but a
  compliance must-have before inviting external collaborators at scale.

### M5 — Editor role (write access) + owner-pays credits
- Honor `role='editor'`: allow editors to move PRD build-status and edit PRD
  content on a shared canvas (gated by `resolve_canvas_access` returning
  'editor'/'owner'). Viewers stay read-only.
- **Owner-pays accounting:** when a collaborator triggers LLM work on a shared
  canvas (spec/vision generation), bill the **owner's** OpenRouter usage and
  surface it to the owner. Decided: owner pays.
- Concurrency: last-write-wins + polling for v1 of editing; real presence /
  CRDT is a separate project.
- **Why deferred:** view-only delivers the core value; write access is the
  riskier half (cross-tenant writes + billing) and deserves its own focused
  pass + the containment tests from M4 in place first.

## Other deferred items
- **PDF-drop in Studio** — full feature spec at `docs/specs/studio-pdf-drop.md`
  (upload → chunk via paper_pipeline → viewer → garden links).
- **Privacy page sub-processor accuracy** — ensure `/privacy` lists OpenRouter /
  Exa / Resend as sub-processors (the landing EU strip already notes "third-party
  providers"); confirm the legal copy matches before broad EU launch.

## Improvement backlog + code review (2026-06-14)

Full value/effort analysis, bugs, and the ordered "tomorrow" plan live in
**`docs/IMPROVEMENTS.md`**. Viable, high-leverage items pulled forward:

- **Fix the research-digest flywheel (#13).** `_save_papers_as_seeds` never calls
  `auto_prd_for_paper`, so autopilot→PRD only fires from the manual endpoint
  (`main.py:1532`). Wire it into the digest paper-save path — `auto_prd.py` is
  fully built with its own relevance gate + daily cap. **High value / small.**
- **Promote the MCP server.** `mcp_http.py` is already built + mounted at `/mcp`
  (per-user keys, Streamable HTTP). Needs a Settings "Connect your garden to
  Claude/Cursor" card + a docs page + a landing mention. **High value / small —
  a real differentiator sitting unsurfaced.**
- **Sentry + de-silence critical excepts.** `SENTRY_DSN` is unset and there are
  several `except: pass` in critical paths (paper parse, auto_prd, push). Set the
  DSN; log instead of swallow. Do before scaling users.
- **Session `user_id` scoping.** `get_session`/`delete_session` filter `tenant_id`
  only (not `user_id`) — harden before any team-tenant feature.
- **PDF-drop in Studio** — already spec'd (`studio-pdf-drop.md`) and lower-effort
  than it looks: `parse_pdf` + chunk/index + a Studio dropzone already exist;
  needs the upload endpoint + pdf.js viewer + garden-links panel.
- **Typed suggested-actions (chat M-B)** — fixes web/mobile button parity at the
  root (see chat rebuild milestones below).

Stretch/vision (raise the ceiling): lean into MCP as a headline feature,
collaborative gardens (editor role → shared wikis), an explorable mind-graph as
the hero surface, north-star/goals, capture-from-anywhere. Detail in
`docs/IMPROVEMENTS.md §D`.

## Notifications redesign — remaining + bigger bets

Shipped now: notifications shifted from *chat-prompts* to *delivered artifacts*.
Killed the pure-prompt **Weekly Garden Digest**; **merged Daily Briefing** into
the Research Digest; added **Garden Story** (narrated weekly recap) and **Garden
Signals** (connection alerts on strong new SeedLinks + theme-emergence when a
seed becomes a hub). Reframed the two daily offenders to be garden-grounded:
**Morning Spark → "Today's thread"** (one real seed + provocation + a concrete
10-min action) and **Evening Reflection → "Loose threads"** (surfaces the user's
own underdeveloped seeds + a tend-one nudge).

### Remaining per-notification reframes (lower frequency — deferred)
- **Weekly Content Eval → deliver the finding.** Today it asks the LLM to riff on
  theme strings. Ground it in real data: the user's most-revisited / most-linked
  seeds this week + a synthesized "what stuck" theme, saved as an artifact (not a
  chat prompt). Source from `Seed` access/link counts.
- **Biweekly Challenge → experiment card.** Keep the cross-domain idea, but emit a
  concrete, saveable **experiment card** (hypothesis · 3 steps · measurable
  outcome) with a one-tap "Plant as a seed/spec" action, instead of dumping the
  brief into chat.
- **Coherence Report → lead with the contradiction.** It already produces a real
  Library article (good). Improve the *notification*: surface the single top
  contradiction/gap in the body, and one-tap open the two conflicting seeds side
  by side (needs `build_coherence_report` to return a `top_contradiction` field).
- **Per-type notification toggles in Settings.** Let users mute/enable each type
  (spark / reflection / digest / story / signals / eval / challenge / coherence)
  independently — `digest_frequency` already exists; generalize it.

### Bigger product bets (the "rest" from the feature brainstorm)
- **Explorable Garden Graph** — promote the graph from a view to a first-class
  space you wander (zoom, cluster, focus a node, walk its links). The visual
  "mind." (`/garden` already deep-links to a seed; build out the graph surface.)
- **Reading queue** — pairs with PDF-drop: saved papers/PDFs get parsed + queued;
  the Research Digest pulls from *your* queue, not just arXiv.
- **North-star / goals** — seeds → products → a personal north star the AI tracks
  progress against; surfaces in Garden Story.
- **Capture-from-anywhere** — browser extension / share-target → seed in one tap.
- **Resurfacing (spaced repetition)** — a Garden Signals extension: surface a
  forgotten older seed that's newly relevant to something just captured.
- **Contradiction watch** — when a new seed contradicts an earlier belief
  (`link_type='contradicts'`), flag it proactively (intellectual honesty).
- **"Pick up where you left off"** — nudge on a stalled spec/PRD with the literal
  next step (ties into the chat Artifacts work).

## Chat experience rebuild — remaining milestones

Shipped now (M-A): reliability layer — 90s turn deadline, 8-tool budget +
duplicate-call guard, client-disconnect cancellation, tighter stream timeout.
This fixes the "stuck" + runaway-tools symptoms. Full plan in
`docs/specs/chat-experience-rebuild.md`. Deferred:

- **M-B — Typed suggested-actions** (replace the `<sugg>…</sugg>` tags parsed
  from prose with a structured `suggested_actions` data part). Fixes the
  web/mobile button gap at the root; render identical Greenplot action chips
  (Plant as seed / Turn into a PRD / Add to wiki / Go deeper) on both.
- **M-C — AI SDK data-stream protocol** behind a `chat_v3` flag: emit the SDK's
  typed stream from the backend so streaming lifecycle, tool state, and ordering
  are handled by the SDK — structurally killing the status/order/gating bugs.
  Keep `chat_v2` until parity is proven.
- **M-D — Tool timeline + result-card registry**: replace the ~250-line bespoke
  per-tool block with a collapsible "working" timeline + a small typed
  result-card registry (seed/spec/wiki/graph/paper + generic fallback).
- **M-E — Message controls + polish**: Stop / Regenerate / Copy / Edit-and-resend,
  polished markdown + code blocks, expandable garden provenance.
- **M-F (Phase 2) — Greenplot Artifacts**: spec/wiki/vision/graph open as an
  editable artifact (side panel desktop / sheet mobile) that pushes to
  Studio/Library; plus a "Think harder" reasoning mode toggle.

Also confirm SSE isn't buffered by the Cloudflare tunnel (add a heartbeat/flush)
— some "stuck" reports may be buffering, not the agent.
