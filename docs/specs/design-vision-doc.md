# Design Vision Doc — One Visual Identity per PRD Batch — PRD

**Status:** ready · **Owner:** Freddy · **Target:** ~1 week

## Problem Alignment

PRDs specify *what* to build but nothing about *how it should look and feel*. Coding agents fill the vacuum with default Tailwind gray — functionally correct, visually generic. Per-PRD design notes would drift: five PRDs, five accidental design systems. What's missing is a batch-level artifact that gives every PRD in a product the same visual spine — so the shipped app is coherent and actually appealing.

## Solution Summary

A **Design Vision Doc** is generated once per batch: select 2+ PRDs on the board → "Create design vision" → one document containing product positioning, experience principles, a concrete design-token sheet (color, type, spacing, radius — CSS variables, copy-pasteable), key-screen inventory, and a BFL-generated moodboard. Each PRD in the batch gains a short **Design** section referencing the doc; `get_spec` over MCP appends the token sheet so implementing agents inherit the identity automatically.

## System Architecture

- **Generator** (`design_vision.py`, new): input = the batch's PRDs (titles + Problem/Solution sections, ≤6K tokens) + repo map when connected (existing UI conventions win over invented ones). Two LLM calls: (1) vision narrative + experience principles + screen inventory; (2) design tokens as strict JSON (`{color: {...}, type: {...}, spacing: [...], radius: {...}}`) validated against a schema, rendered into the doc as a CSS-variable block.
- **Moodboard**: one BFL Flux call using a fixed compositional template (same discipline as architecture diagrams): 2×3 grid — palette swatches, type specimen, one hero screen impression, one component cluster — flat, professional, no photorealism. Stored as the doc's hero image.
- **Storage**: a Library article (`category='Design Vision'`) — editable, exportable to PDF, sources = the batch's PRD seed ids (reuses everything the Library already does). Batch PRDs get metadata `design_vision_id` + an appended `## Design` section linking it and naming the 3 most relevant principles.
- **Endpoint**: `POST /api/v1/design-vision {seed_ids: [...]}` → 202 + background task → poll via the first seed's metadata (same pattern as draft-PRD). Studio board: multi-select mode → "Create design vision" action.
- **MCP**: `get_spec` appends the linked vision doc's token sheet under `DESIGN TOKENS`; new `get_design_vision(spec_id)` returns the full doc.

## Data Model

Library article (existing WikiArticle class) + per-PRD metadata: `design_vision_id`, `design_section_added: bool`.

## Acceptance Evals

1. Select 3 PRDs → vision doc exists in Library with: ≥4 experience principles, a valid CSS-variable token block (parses as JSON upstream), screen inventory covering all 3 PRDs, moodboard image.
2. Each selected PRD now contains a `## Design` section linking the doc.
3. `get_spec` on a batch member returns the token sheet; an agent building from it uses the specified palette (manual check on first real build).

## Delivery Risks & Open Questions

- Token-sheet JSON drift: schema-validate; on failure retry once, then ship doc without tokens flagged `tokens: missing`.
- Moodboard BFL cost (~1 credit/batch) is trivial; regeneration is manual-only.
- Open: should a second batch reuse the existing vision doc by default? v1: prompt the user "extend existing vision or create new?".

## Milestones

1. Generator + endpoint + Library storage (3 days — eval 1)
2. Board multi-select + Design sections + poll modal (2 days — eval 2)
3. MCP token-sheet integration (1 day — eval 3)
