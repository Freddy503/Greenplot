# Product Atlas — The Convergence Layer — PRD

**Status:** ready · **Owner:** Freddy · **Target:** ~1.5 weeks

## Decisions (made with Freddy)

Max **3 products**: one **MAIN**, others **backlog** — the human assigns and promotes, never the
system. **Problem-first is enforced, not encouraged**: a product cannot be created without a
problem statement that survives interrogation; every PRD must declare which facet of the problem
it serves. Atlas ships as an outline hierarchy first; the knowledge graph gains product/pillar
nodes because surfacing these connections "is the entire reason for its existence." Coherence
runs at generation time plus a weekly report.

## Problem Alignment

The system diverges brilliantly — papers in, PRDs out, visions per batch — but has no
convergence layer. Artifacts live flat: a strip of PRDs, pairwise metadata links nobody sees,
no object that says *this is the product and here is how the pieces serve it*. The user can't
find the product vision, can't see overlap or contradiction between auto-generated PRDs, and
the portfolio drifts toward solutions-in-search-of-problems — the exact failure Freddy flagged:
"we need to solve a problem, can't stress this enough."

## Solution Summary

A **Product** root object (problem statement → pillars → attached PRDs) with a hard cap of 3
and one MAIN. Creation runs through a **problem interrogation** in chat — no problem, no
product. A new **Atlas view** in Studio renders the hierarchy with coverage gaps and an orphan
strip; the knowledge graph gains product/pillar nodes and hierarchy edges. The **coherence
engine** makes every new auto-PRD vision-aware (extend, don't duplicate; declare the problem
facet served) and writes a **weekly Coherence Report** — clusters, contradictions, gaps,
merge suggestions, the story so far — which also absorbs the pending stale-draft roundup.

## System Architecture

- **Product object**: `seed_type='product'` (reuses search/graph/MCP/deep-link infra).
  Metadata: `{problem_statement (required, ≤600 chars), pillars: [{id, name, problem_facet}]
  (3-5), rank: 'main'|'backlog', success_definition}`. Creation cap enforced server-side
  (3 per tenant, exactly 1 main).
- **Creation flow**: chat `mode=product` interrogation — who hurts, how do you know (demand
  evidence), cost of the problem, why now — then `write_product` tool (new handler) validates
  `problem_statement` is non-empty and evidence-backed before creating. Editing via the
  existing PATCH seed path.
- **Attachment**: spec seeds gain `product_id`, `pillar_id`, `attachment: 'confirmed'|'proposed'`.
  Auto-PRDs attach to MAIN with a *proposed* pillar (one extra line in the existing generation
  call); the human confirms or reassigns in the Atlas — proposed attachments render dashed.
  `POST /api/v1/seeds/{id}/attach {product_id, pillar_id}` confirms (sets 'confirmed').
- **Generation-time coherence** (`auto_prd.py`): context gains the MAIN product's problem +
  pillar list + titles/one-liners of its existing PRDs (≤2K tokens). Template v2 adds a
  mandatory header line `**Serves:** <pillar> — <problem facet>` and instructs extend/reference
  over duplicate. Post-generation overlap check: top-3 similar PRDs by vector + one small LLM
  judgment → `overlaps: [{prd_id, pct, suggestion}]` in metadata → amber **OVERLAPS** badge
  with the named PRD in Studio.
- **Atlas view** (Studio Segmented becomes Board | List | Atlas): MAIN product card (problem
  statement prominent, not the vision platitude) → collapsible pillar groups with PRD rows
  (status/quality/PR badges, dashed border while `proposed`) → coverage strip (pillars with 0
  PRDs highlighted amber) → orphan strip ("serves no product — assign or archive") → backlog
  products collapsed at bottom. Assign = tap chip → picker (drag in v1.1).
- **Graph integration** (`GET /api/v1/graph`): product nodes (large, ringed), pillar nodes,
  `hierarchy` edges (product→pillar→PRD, solid heavy) and `derived_from` edges (paper→PRD,
  vision→PRD) — all from Postgres metadata, zero LLM calls, same cached payload.
- **Coherence Report** (`coherence.py`, new): inputs = product problem/pillars + every attached
  PRD's title/Serves-line/status/overlaps + orphans + stale auto-drafts (absorbs
  `build_draft_roundup`). One synthesis call (≤10K in, ≤3K out) → Library article
  `category='Coherence Report'`: story so far, clusters, contradictions, per-pillar gaps,
  merge suggestions, one recommended next action. Weekly cron (Sunday, briefing scheduler) +
  "Check coherence" button in the Atlas (202+poll, same pattern as design vision).
- **MCP**: `get_product()` returns the MAIN product (problem, pillars, PRD index) so coding
  agents know what the whole thing is for; `get_spec` header gains the Serves line.

## Data Model

Product = seed row (`seed_type='product'`) + metadata above. Spec seed metadata +=
`product_id, pillar_id, attachment, serves, overlaps[]`. Coherence Report = WikiArticle.
No new tables.

## API Surface

`POST /api/v1/products {title, problem_statement, pillars[], rank}` (cap-enforced) ·
`GET /api/v1/products` · `POST /api/v1/seeds/{id}/attach {product_id, pillar_id}` ·
`POST /api/v1/coherence-report` (202, poll product seed metadata) · graph payload extension ·
MCP `get_product`.

## Acceptance Evals

1. Creating a 4th product or a second MAIN fails with a clear 422; creating without a problem
   statement fails in the tool and the endpoint.
2. A new auto-PRD carries `**Serves:**` + a proposed pillar on MAIN, renders dashed in the
   Atlas, and one tap confirms it.
3. Two deliberately overlapping PRDs → the newer one wears OVERLAPS naming the older.
4. Coherence Report exists in the Library with ≥1 contradiction-or-gap finding and the stale-
   draft section; the Atlas coverage strip highlights an empty pillar.
5. Graph shows product/pillar nodes with hierarchy edges; clicking a PRD node still deep-links.

## Delivery Risks & Open Questions

- Pillar proposals will be wrong sometimes — by design; dashed-until-confirmed keeps the human
  in the loop (Freddy's explicit call). Never auto-confirm.
- Report quality depends on Serves lines existing — backfill: one batch LLM pass proposes
  Serves lines for existing PRDs, all marked proposed.
- Cron wiring through the briefing scheduler is the same gap as the draft roundup — solving it
  here pays both debts.
- Open (v1.1): drag-to-assign in Atlas; backlog→main promotion ritual with a "what changes"
  diff; multi-product coherence (cross-product overlap).

## Milestones

1. Product object + cap/problem enforcement + write_product interrogation + attach endpoint
   (2 days — eval 1)
2. Generation-time coherence: vision-aware context, Serves line, overlap check + badges,
   Serves backfill (2 days — evals 2, 3)
3. Atlas view + graph nodes/edges (2 days — evals 2, 5)
4. Coherence Report + weekly cron + on-demand button (2 days — eval 4)
