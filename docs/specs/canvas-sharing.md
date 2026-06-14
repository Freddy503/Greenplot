# Share a Canvas → Invite Collaborators by Email — PRD

**Status:** spec · **Owner:** Freddy · **Security-critical** (crosses tenant isolation)

## Problem Alignment

Studio canvases (a product + its attached PRDs) are single-owner today.
Founders want to **invite collaborators by email** to a specific canvas — to
co-shape PRDs and the product vision. The whole app is built on **strict
per-tenant isolation** (every row carries `tenant_id`; every query filters on
`current_user.tenant_id`). Sharing must add a **narrow, explicit, revocable
exception** for one canvas — never a general loosening of isolation. Getting
this wrong leaks a user's entire garden. This is the inverse of the privacy
hardening we just did and demands the same rigor.

## Solution Summary

Introduce a **CanvasShare** ACL: the owner grants a named collaborator
(by email) access to **one product (the "canvas") and exactly the PRD seeds
attached to it** — nothing else in their tenant. Access is resolved through a
single `can_access_canvas(user, product_id)` gate reused by every
product/PRD endpoint. Invites reuse the existing email + invite infrastructure.
**v1 ships view-only, single-canvas sharing**; edit roles + realtime come later.

## System Architecture

### The shareable unit
A **canvas = a product seed** (`seed_type="product"`) + the PRD seeds where
`seed_metadata.product_id == product.id`. That set, and only that set, is what a
collaborator may see.

### New model: `CanvasShare`
```
CanvasShare(
  id, product_id (the canvas),
  owner_tenant_id,                  # who shared it
  collaborator_user_id (nullable),  # set once they accept / if existing user
  collaborator_email,               # invite target
  role: 'viewer' | 'editor',        # v1: viewer only
  status: 'pending' | 'active' | 'revoked',
  invited_at, accepted_at, created_by
)
```
Indexed on `(collaborator_user_id, status)` and `(product_id)`.

### The access gate (the heart of the feature)
A single resolver, used everywhere a product/PRD is read or written:
```
def resolve_canvas_access(user, product_id) -> 'owner' | 'editor' | 'viewer' | None
```
- `owner` if the product's `tenant_id == user.tenant_id`.
- else the role from an `active` `CanvasShare` matching `(product_id,
  collaborator_user_id=user.id)`.
- else `None` → 403.

**Containment rule (non-negotiable):** a collaborator may ONLY touch:
- the shared product seed, and
- seeds whose `seed_metadata.product_id == product_id`.
Every collaborator-facing query is filtered by `product_id`, **not** by tenant.
The owner's other seeds, garden, chats, briefings, paper chunks, etc. remain
invisible. No endpoint falls back to `tenant_id == current_user.tenant_id` for
shared access.

### Endpoint changes
- A small set of **canvas-scoped read endpoints** (the studio board, a product's
  PRDs, a PRD's content, the design vision) switch from "tenant filter" to
  "`resolve_canvas_access` + `product_id` filter". Implement as a shared
  dependency so it's auditable in one place.
- Write endpoints (move PRD status, edit) require role `editor`/`owner` — gated
  off in v1 (viewer only).
- List/garden/chat endpoints are **unchanged** (never shared).

### Invite flow (reuse existing infra)
1. Owner clicks **Share** on the canvas → enters an email + role.
2. Backend `POST /api/v1/canvas/{product_id}/share`:
   - owner-only; creates a `CanvasShare(status=pending)`.
   - if the email is an existing user → link `collaborator_user_id`.
   - sends an email (reuse `send_invite_email` styling) with a deep link
     `…/studio?canvas={product_id}&share={share_id}`.
3. Recipient: if new, onboards (existing invite-gated flow); on first visit to
   the link, `POST /canvas/share/{id}/accept` flips status→active and binds
   `collaborator_user_id`.
4. Collaborator sees the shared canvas in Studio under a "Shared with me" group.

### Frontend (Studio)
- **Share button** on the canvas header → modal: email input, role (v1 viewer),
  list of current collaborators with **revoke**.
- "Shared with me" section listing canvases others shared.
- Read-only affordance for viewers (no drag, no edit; "View only" chip).

## Scope & Capabilities
**In (v1):** Share button, email invite (existing + new users), `CanvasShare`
model, `resolve_canvas_access` gate, **view-only** access to one canvas's
product + PRDs + design vision, "Shared with me" list, revoke, GDPR delete
cascades shares.
**Out (v1):** editor role / co-editing, realtime presence & live cursors,
comments, link-based public sharing, sharing the whole garden, granular
per-PRD sharing, transfer ownership.

## Security & Privacy (must-haves)
- **Default deny**: every shared-access path goes through `resolve_canvas_access`;
  no implicit tenant fallback. One audited helper, unit-tested with a
  cross-tenant "collaborator cannot read owner's *other* seeds" case.
- **Containment test in CI**: collaborator token + a non-canvas seed id → 403.
- **Revoke is immediate**: status→revoked drops access on the next request.
- **Least data**: collaborator endpoints return only canvas fields; never the
  owner's email/profile beyond a display name.
- **Audit**: log share create/accept/revoke with actor + canvas.
- Reuse the same review rigor as the privacy fixes (the `load_session`/notif work).

## Delivery Risks & Open Questions
- **LLM credits**: when a collaborator triggers spec/vision generation on a
  shared canvas, whose OpenRouter budget pays? → **Recommend: the owner's**, and
  show the owner usage from collaborators. (Decide before editor role ships.)
- **Weaviate scoping**: paper chunks / vector reads are tenant-scoped; shared
  reads must query by `product_id`/seed-id allowlist, not tenant.
- **Concurrency** (when editing lands): last-write-wins + polling for v2; real
  CRDT/presence is a separate project.
- **Billing/plan**: is collaboration a paid-tier gate? (Product decision.)
- **Open**: can a collaborator re-share? → No in v1 (owner-only).
- **Open**: email to a non-user — invite-gate them (needs a code) or auto-allow
  via the share link? → Recommend the share link itself acts as the gate
  (single-use, bound to that email), bypassing `INVITE_CODES` for that flow.

## Milestones
1. `CanvasShare` model + `resolve_canvas_access` gate + containment tests (2 d)
2. Share/accept/revoke endpoints + email invite (reuse send_invite_email) (1.5 d)
3. Studio Share modal + "Shared with me" + view-only board (2 d)
4. GDPR delete cascade + audit logging + sub-processor/privacy copy (0.5 d)
5. (v2) Editor role + write gating + owner-pays credits accounting
