# Comments on PRDs — PRD

**Status:** spec · **Owner:** Freddy · **Builds on:** `canvas-sharing.md`

## Problem Alignment

Canvas sharing (v1) is view-only — a collaborator can see PRDs but can't say
anything. To make Studio *actually* collaborative, people need to discuss the
work where it lives: leave comments on a PRD, ask a question, flag a concern,
react to the design vision. Async, lightweight, in-context.

## Solution Summary

Add **threaded-ish comments on PRD seeds**, scoped to a shared canvas. Anyone
with access to the canvas (owner or active collaborator, **any role**) can read
and post; the same `resolve_canvas_access` gate enforces it — no new isolation
hole. A comment count shows on the PRD card; the comment panel lives in the PRD
detail view and in the read-only shared view. New comments notify the canvas
owner + thread participants via the existing per-user notification store.

## System Architecture

### Model: `Comment`
```
Comment(
  id, seed_id (the PRD), product_id (the canvas — for access scoping),
  author_user_id, author_name,           # display name snapshot
  body (<= 4000 chars),
  parent_id (nullable — flat in v1, reply-ready),
  resolved (bool, default false),
  created_at, edited_at
)
```
Indexed on `(seed_id)` and `(product_id)`. Table auto-creates via
`Base.metadata.create_all`.

### Access — reuse the canvas gate
Every comment read/write resolves through `resolve_canvas_access(user,
product_id)`:
- access `None` → 403.
- otherwise allowed to **read and post** (commenting ≠ editing — see Decision 1).
The endpoint verifies the PRD actually belongs to that canvas via
`can_read_seed_for_canvas`, so you can't comment your way into an unrelated seed.

### Endpoints
- `GET  /api/v1/seeds/{seed_id}/comments?product_id=X` → list (oldest→newest).
- `POST /api/v1/seeds/{seed_id}/comments` `{product_id, body, parent_id?}` → add.
- `PATCH /api/v1/comments/{id}` `{body?|resolved?}` → edit own / resolve.
- `DELETE /api/v1/comments/{id}` → author deletes own; canvas owner deletes any.
- Comment counts piggyback on the canvas-read payload (`comment_count` per PRD).

### Notifications
On a new comment, notify (via the existing per-user notif store + push):
- the canvas **owner** (unless they authored it), and
- distinct **prior commenters** on that PRD.
Title: "💬 New comment on {PRD title}". Links to `/studio?...&prd={seed_id}`.

### Frontend
- **PRD detail view**: a Comments section — list (author, time, body, resolve/
  delete affordances) + a composer. Same component in the **read-only shared
  view** so collaborators can comment there.
- **PRD card**: a small `💬 N` badge when comments exist.
- Optimistic add; poll/refetch on open (no realtime in v1).

## Scope & Capabilities
**In (v1):** flat comments on PRDs, post/edit-own/delete-own (+ owner delete
any), resolve toggle, comment counts, notifications to owner + participants,
access via the canvas gate, GDPR delete cascade (purge comments with the seed/
canvas/account).
**Out (v1):** threaded replies (model is ready, UI later), @mentions (comes with
the activity-feed feature), comments on the canvas/vision itself, reactions/
emoji, rich text/attachments, realtime presence.

## Decisions to confirm (let's lock these)
1. **Can viewers comment, or only editors?** → *Recommend: viewers can comment.*
   Commenting is the whole point of inviting someone; editing the PRD stays
   gated. (If you'd rather, we can add a 'commenter' vs 'viewer' split.)
2. **PRD-level only, or also canvas/vision-level comments?** → *Recommend:
   PRD-level first; canvas/vision comments in a fast-follow.*
3. **Flat or threaded in v1?** → *Recommend: flat (parent_id in the model so we
   can add replies without a migration).*
4. **Resolve/archive threads?** → *Recommend: yes, a simple resolved flag —
   cheap and keeps long canvases tidy.*
5. **Notify scope** → *Recommend: owner + prior commenters. @mentions later.*

## Delivery Risks & Open Questions
- **Notification noise**: a chatty canvas could spam the owner — batch or cap
  ("3 new comments on {canvas}") if it gets loud.
- **Author identity**: collaborators are other tenants; we snapshot `author_name`
  (nickname) and never expose the owner's other PII.
- **Edit history**: v1 stores `edited_at` only (no full history) — fine for now.

## Milestones
1. `Comment` model + access-gated CRUD endpoints + Next proxy (1.5 d)
2. PRD detail comments panel + card badge + shared-view parity (1.5 d)
3. Notifications (owner + participants) + GDPR cascade (0.5 d)
4. (fast-follow) threaded replies + canvas/vision-level comments + @mentions
