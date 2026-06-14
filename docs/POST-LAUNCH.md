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
