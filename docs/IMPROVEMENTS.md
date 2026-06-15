# Greenplot — Improvement Backlog & Code Review

**Date:** 2026-06-14 · **Author:** code review pass over `openclaw-api/app` + `src`
**Purpose:** an actionable, value/effort-ranked list to work from. Bugs first,
then a do-next matrix, a concrete "tomorrow" plan, and stretch/vision projects.

> **Shipped in the autonomous pass (2026-06-14):** ✅ **PDF-drop in Studio**
> (upload→parse→view→garden-links, GDPR purge); ✅ **B3** session `user_id`
> scoping; ✅ **landing page** PDF-drop feature added. Found already-built (no
> work needed): the **MCP "Connect your garden" Settings card** (`settings`
> line ~251) and **per-type notification toggles**. Needs you: **Sentry DSN**
> (B2), **deploy**, and **verify #13** end-to-end now Exa is funded.

> Key context discovered during review: a lot of the ambitious stuff is **already
> built and just not surfaced** — the MCP server (`/mcp`), the graph backend
> (`/api/v1/graph`, `/nodes`), `tree_retrieval.py`, `auto_prd.py`, and the full
> `paper_pipeline.py` (incl. `parse_pdf`). So the highest leverage is **connecting
> and promoting**, not greenfield building.

---

## A. Bugs & correctness issues found

| # | Severity | Bug | Where | Fix | Effort |
|---|---|---|---|---|---|
| B1 | Med | **#13 — digest→PRD autopilot rarely fires.** Correction after deeper review: it *is* wired (`paper_pipeline.py:311` calls `auto_prd_for_paper` for `created_via=='academic_digest'` papers that parse). The real causes were (a) Exa out of credits → no papers to parse (fixed — topped up) and (b) the relevance gate (`sco<RESEND_API_KEY>` < `RELEVANCE_THRESHOLD`) scores sparse-garden papers low, so early users never get a draft. | `paper_pipeline.py:309-317`, `auto_prd.py:210/480` | **Verify** end-to-end now Exa is funded. *Optionally* relax the gate for low-seed users so the magic happens early (judgment call — risks low-quality PRDs). | **Verify (S)** |
| B2 | **High** | **No production error visibility.** Sentry is wired (`main.py:194`) but `SENTRY_DSN` is unset, and there are 143 broad `except` blocks in `main.py` plus several `except: pass` (`enricher_v2.py:147/553`, `paper_pipeline.py:76`, `auto_prd.py:300`, `task_worker.py:87`). Errors vanish silently. | repo-wide | Set `SENTRY_DSN`; convert `except: pass` in critical paths (paper-parse enqueue, auto_prd, push send) to `logger.warning`. | **S** |
| B3 | Med | **Session get/delete scope to `tenant_id` only, not `user_id`** — inconsistent with `list_sessions` (which also filters `user_id`). Not exploitable while tenant=user 1:1, but breaks the moment a tenant has multiple users (teams). | `main.py:3413, 3433` | Add `user_id` filter (defense in depth). | **XS** |
| B4 | Low | **Garden Signals dedup is time-window based** (3 h lookback matching the cron). A link created on the boundary can double-notify or be skipped. | `main.py _job_garden_signals` | Stamp notified `SeedLink` ids (or a `signals_seen` set) instead of relying on the window. | **S** |
| — | — | **Checked, no bug:** all sampled `next(get_db())` job sites close in a `finally` (incl. 4941 `_job_garden_signals`); `datetime.now(_CET)` vs naive `utcnow()` are never compared directly (dedup uses string `isoformat`), so no timezone bug. | — | — | — |
| — | — | **Already fixed this session** (listed for completeness): morning-spark weather gate skipping the whole notification; digest JSON parse had no retry + read the wrong fallback key (`snippet` vs `text`) → bare link-only digests; 410-prune used falsy `if e.response` so dead push subs were never pruned. | — | done | — |

---

## B. Value / Effort matrix — do-next

Ranked by leverage. "Viable because…" notes the existing infra that de-risks it.

| Item | Value | Effort | Viable because… | Verdict |
|---|---|---|---|---|
| **B1 — wire auto-PRD into the digest (#13)** | High | **S** | `auto_prd.py` fully built w/ relevance gate + cap; just not called from the digest. | **Do first** |
| **Promote the MCP server** | High | **S** | `mcp_http.py` is built + mounted at `/mcp` with per-user keys. Needs a Settings card ("Connect your garden to Claude/Cursor" + key issue/copy) + a docs page + landing mention. | **Do first** — huge differentiation for almost no code |
| **Sentry + de-silence critical excepts (B2)** | High | **S** | Sentry already wired; just needs DSN + a few log lines. | **Do first** (before more users) |
| **PDF-drop in Studio** | High | **M** | `parse_pdf` + chunk/index + `studio/page.tsx` dropzone infra already exist. Needs: `POST /papers/upload`, viewer (pdf.js), "links to your garden" panel. Spec ready (`studio-pdf-drop.md`). | **Do this week** |
| **Typed suggested-actions (chat M-B)** | Med-High | **M** | Replaces `<sugg>` tag parsing with a typed field → fixes web/mobile button parity at the root. Spec in `chat-experience-rebuild.md`. | **Do this week** |
| **Canvas editor role (M5)** | High | **High** | `resolve_canvas_access` already returns `editor`; needs write-paths + owner-pays accounting + containment tests. | Schedule (real multiplayer) |
| **Explorable Garden Graph** | High | **M-High** | `/api/v1/graph` + `/nodes` + `/garden` exist; enhance into a wander-able space (zoom/cluster/focus). | Schedule (hero surface) |
| **Reading queue** | Med | **M** | Pairs with PDF-drop; digest pulls from a user queue, not just arXiv. | After PDF-drop |
| **Per-type notification toggles** | Med | **S** | `digest_frequency` + schedule config exist; generalize. | Quick win |

---

## C. Tomorrow — an ordered, concrete plan

1. **Set `SENTRY_DSN`** (create project, set env, redeploy). ~15 min. *Now you can see what breaks.* (B2)
2. **Fix #13** — call `auto_prd_for_paper` for high-relevance saved papers in the digest path; verify one paper → draft PRD end-to-end. ~1–2 h. (B1)
3. **Session `user_id` scoping** — 2-line hardening. ~15 min. (B3)
4. **MCP "Connect your garden" Settings card** — surface the per-user key + copy a ready-made client config block; add a one-paragraph landing mention. ~half day. *Biggest value-per-hour on this list.*
5. **Start PDF-drop** — `POST /papers/upload` (reuse `process_attachments` guards) → write `/data/papers/{seed_id}.pdf` → enqueue existing parse job. Backend half-day; viewer + links panel the day after.

(1–3 are tiny and ship safety + the flywheel; 4 is the differentiator; 5 is the marquee feature.)

---

## D. Stretch / vision projects (raise the ceiling on product value)

- **"Your second brain, in every AI tool" (lean into MCP).** The MCP server already exists — make it a headline feature: a polished connect-flow, scoped read/write tools, and positioning as the PKM that plugs into Claude Code / Cursor / Claude Desktop. Few PKMs have this.
- **Collaborative gardens.** Editor role → shared wikis → team knowledge bases. The canvas-sharing foundation (CanvasShare + `resolve_canvas_access`) is the on-ramp.
- **Explorable mind-graph as the hero surface.** Turn the existing graph backend into a beautiful, wander-able map of how your thinking connects — the visual identity of the product.
- **North-star / goals.** Seeds → products → a personal north star the AI tracks progress against; surfaces in Garden Story.
- **Capture-from-anywhere.** Browser extension / mobile share-target → seed in one tap. Removes the biggest friction in any PKM (getting things *in*).
- **Voice journal → seeds.** Daily voice capture auto-parsed into seeds + connections.
- **Resurfacing / spaced repetition + contradiction watch** (Garden Signals extensions) — make the garden feel alive and intellectually honest.

---

## D2. Ideas mined from awesome-llm-apps (2026-06-14)

> **All four shipped (2026-06-14, autonomous pass 2):** ✅ **Seed-a-link** (URL/
> YouTube → garden, via the PDF pipeline + youtube-transcript-api) **and PDF**,
> both **discoverable in chat** (a "＋ Add" menu, an "Add to garden" button on
> detected links, and PDF drag-drop) — PDF drop also stays in Studio. ✅
> **Citations** — the "Grounded in your garden" chip is now expandable with the
> exact seeds, each linking to the garden (web Sources already existed). ✅
> **Deep Research** — a new thinking mode (multi-step garden+web → cited brief).
> ✅ **Corrective RAG** — a relevance-judge/re-query rule added to the base agent
> prompt (applies to all chat) + baked into Deep Research. Needs you: backend
> rebuild (installs youtube-transcript-api) + Vercel redeploy.

Filtered against what Greenplot already has (RAG/Weaviate + tree_retrieval, MCP,
arXiv/paper agent, chat-with-PDF, knowledge graph). Net-new and viable:

- **Seed-a-link (chat-with-URL / YouTube)** — *V: High · E: Low-Med · top pick.*
  Paste a URL or YouTube link → fetch article/transcript → run the **existing
  PDF-drop pipeline** (`fetch_paper` already does HTML/Exa; the new garden-summary
  step generalizes) → a connected seed. Reuses ~90% of the PDF-drop code; nails
  the biggest PKM friction (capture-from-anywhere). Add a YouTube transcript
  fetcher + a "paste a link" affordance in Studio/chat.
- **RAG with citations (provenance)** — *V: High · E: Med.* Chat/specs already
  retrieve from the garden but don't show *which* seed/paper-chunk grounded the
  answer. Emit citations as a typed field → render as expandable source chips
  (already a chat-rebuild milestone — fold in there).
- **Deep Research mode** — *V: Med-High · E: Med-High.* A multi-step garden+web
  research agent that produces a structured report seeded back into the garden
  (extends Research Digest + the chat agent). Differentiating; gate behind a
  "Think harder / Deep Research" toggle.
- **Corrective / agentic RAG** — *V: Med · E: Med.* Self-check retrieved chunks
  for relevance and re-query when weak, before answering → fewer ungrounded
  replies. Slots into the chat retrieval layer.

## E. Already-built — surface, don't rebuild

| Capability | Module | Status |
|---|---|---|
| MCP server (per-user keys, Streamable HTTP) | `mcp_http.py` → `/mcp` | Built, mounted — **unpromoted** |
| Graph + nodes API | `main.py /api/v1/graph`, `/nodes/*` | Built |
| Tree retrieval (RAG) | `tree_retrieval.py` | Built |
| Auto-PRD pipeline | `auto_prd.py` | Built — **disconnected from digest (B1)** |
| Paper parse/chunk/index incl. PDF | `paper_pipeline.py` (`parse_pdf`) | Built — PDF-drop only needs the upload+viewer shell |
| Canvas sharing (view-only) | `canvas_access.py` + endpoints | Shipped; editor role is M5 |
