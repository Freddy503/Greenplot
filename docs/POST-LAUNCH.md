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
