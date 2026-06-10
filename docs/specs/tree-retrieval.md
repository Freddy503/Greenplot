# Tree Retrieval — Reasoning-Based Paper Navigation (PageIndex pattern) — PRD

**Status:** ready · **Owner:** Freddy · **Target:** 2 days

## Decision: adopt the PageIndex *pattern* natively; hybrid with vectors, not a replacement

PageIndex (VectifyAI, MIT) proves the thesis "similarity ≠ relevance" for long structured
documents: build a table-of-contents tree, let an LLM reason over it, fetch whole sections.
We implement the pattern on our own parser (sections already exist in `paper_pipeline.py`,
models route through OpenRouter, no new dependency); their package remains an option for
gnarly PDFs later. Vectors are NOT replaced: cross-corpus recall over 170+ papers and
thousands of seeds stays Weaviate's job — an LLM cannot navigate 170 trees per query.

## Problem Alignment

Paper retrieval picks chunks by embedding similarity: asking for "evaluation methodology"
returns prose that *sounds* methodological while missing the results table; chunk boundaries
cut arguments mid-flow. Worst case is the auto-PRD generator, which grounds drafts in the
top-8 chunks nearest to the paper's *title* embedding — similarity-as-relevance distilled.
Engineering-grade PRDs need the method, results, and limitations sections *whole*.

## Solution Summary

**Two-stage hybrid**: Stage 1 (unchanged) — Weaviate vectors answer *which paper(s)*.
Stage 2 (new) — a per-paper **doc tree** (section nodes with LLM summaries) lets a single
small LLM call answer *which sections*; those sections return as full, ordered text
reassembled from stored chunks. Trees are built at parse time and backfilled for the
existing corpus from chunks already in Weaviate (no re-download).

## System Architecture

- **`tree_retrieval.py` (new)**: `build_doc_tree(sections) -> tree` (ONE batched LLM call:
  all section titles + first ~300 chars each → 1-2 sentence summary per node; output
  `[{id, title, summary, chunk_count}]`, ≤40 nodes, stored in seed metadata `doc_tree`);
  `navigate_tree(tree, query) -> node_ids` (one ~1.5K-token call, returns 1-3 ids, strict
  JSON with digit-parse fallback); `fetch_sections(seed_id, node_titles)` reassembles full
  section text from PaperChunk rows ordered by chunk_index.
- **`weaviate_client.get_paper_chunks(seed_id)`** (new): where-filtered fetch, no vector.
- **Parse hook** (`paper_pipeline.parse_paper_for_seed`): after indexing, build the tree
  from the in-memory sections; failures degrade silently (vector path remains).
- **Backfill** (`POST /api/v1/papers/tree-all`): for parsed papers missing `doc_tree`,
  rebuild trees from stored chunks via BackgroundTasks (same pattern as parse-all).
- **`search_paper_content` v2** (tool + REST + MCP unchanged interfaces): when the target
  paper is known (seed_id given, or stage-1 vector hit concentrates on one paper) AND it
  has a tree → navigate + return whole sections with `retrieval: "tree"`; otherwise the
  existing vector path with `retrieval: "vector"`.
- **Auto-PRD generator** (`auto_prd._gather_context`): tree navigation with the fixed query
  "method, results, limitations, system design, evaluation" replaces title-embedding chunk
  selection; sections map into the existing excerpt format so the generator is untouched.

## Data Model

Seed metadata gains `doc_tree: [{id, title, summary, chunk_count}]` and `tree_built_at`.
No new tables; chunks stay in Weaviate PaperChunk.

## Acceptance Evals

1. Parse (or backfill) a paper → `doc_tree` exists with ≥3 nodes, each with a non-empty summary.
2. `search_paper_content(query="evaluation methodology", seed_id=X)` returns whole sections
   with `retrieval: "tree"`, including a results/evaluation section the vector path missed.
3. Auto-PRD regeneration on ContextOS grounds in ≥3 distinct tree sections (visible in the
   draft's section citations).
4. A paper without a tree falls back to `retrieval: "vector"` with no error.

## Delivery Risks & Open Questions

- Navigation cost: +1 LLM call (~2-5s) per tree retrieval — acceptable for spec/PRD work;
  chat over seeds keeps vectors. Tree build: +1 call per paper (~cents for the corpus).
- Bad section extraction (PDF parsers) → flat trees; mitigation: trees with <3 nodes are
  not stored, vector path persists. Their package is the upgrade path for hard PDFs.
- Open: extend trees to long PRDs/wiki articles (structured markdown, headers as nodes) — v1.1.

## Milestones

1. tree_retrieval.py + parse hook + get_paper_chunks + backfill endpoint (1 day — eval 1, 4)
2. search_paper_content v2 + auto-PRD integration (1 day — evals 2, 3)
