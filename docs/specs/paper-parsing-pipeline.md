# Research Paper Parsing Pipeline — PRD

**Status:** ready · **Owner:** Freddy · **Target:** Phase 1 in 1 week

## Problem Alignment

The Research Digest surfaces arXiv papers and `ingest_paper` plants them as seeds, but only the **abstract** is stored. When a user develops a paper into a project spec, the agent reasons from a 1-paragraph summary instead of the method, results, and limitations — so PRDs grounded in papers are shallow. The full paper content must be parsed, chunked, and stored so retrieval brings the *right context* into chat, spec mode, and wiki compilation.

## Solution Summary

Extend `ingest_paper` into a three-stage pipeline: **fetch → parse → chunk & index**. The paper PDF is downloaded, parsed to structured text (sections preserved), split into ~800-token section-aware chunks, embedded, and stored in a new Weaviate `PaperChunk` class linked to the paper seed. Retrieval tools gain a `search_paper_content` path so chat and `develop_idea` can quote the actual method/results.

## System Architecture

- **Fetcher** (`paper_pipeline.py`, new): downloads `pdf_url` (arXiv) with httpx; falls back to Exa `/contents` for non-arXiv publisher pages. Stores raw PDF under `/data/papers/{seed_id}.pdf` (volume-mounted) so the original is always re-parseable and servable to the UI.
- **Parser**: `pymupdf` (fitz) extracts text + headings. arXiv HTML (`arxiv.org/abs → /html/`) is preferred when available (cleaner structure); PDF is the fallback. Output: ordered list of `{section, text}` (Abstract, Introduction, Method, Results, Discussion, References dropped).
- **Chunker**: section-aware splitter, target 800 tokens, 100 overlap; each chunk carries `{seed_id, paper_title, section, chunk_index, citation}`.
- **Indexer**: embeds via the existing `embed_text` (OpenRouter) and writes to new Weaviate class `PaperChunk` (tenant-scoped, same pattern as `IdeaSeed`). Paper seed metadata gains `parse_status: pending|parsed|failed` and `chunk_count`.
- **Queue**: parsing runs as a job on the existing Redis/RQ enrichment worker (`task_broker.enqueue`), never inline — PDFs take seconds to minutes.
- **Retrieval**: new tool `search_paper_content(query, seed_id?)` → hybrid search over PaperChunk; `develop_idea` and chat system prompts instruct the agent to call it when a paper seed is in context. Wiki compilation includes top chunks when a paper seed is among sources.

Data flow: `ingest_paper / digest auto-save → seed created → enqueue parse job → worker: fetch → parse → chunk → embed → PaperChunk × N → seed.parse_status='parsed'`.

## Scope & Capabilities

**In:** arXiv PDFs + HTML, publisher pages via Exa fallback, section-aware chunking, PaperChunk Weaviate class, `search_paper_content` tool, parse status surfaced in the Studio paper detail (chip: "Full text indexed · 24 chunks"), re-parse action.
**Out (v1):** figures/tables extraction, OCR for scanned PDFs, citation-graph traversal, non-English papers, LaTeX source parsing.

## Delivery Risks & Open Questions

- arXiv rate limits: throttle to 1 req/3s per their policy; queue makes this natural.
- PDF parsing quality varies; mitigate by preferring arXiv HTML and storing `parse_status='failed'` gracefully (abstract-only remains usable).
- Weaviate memory growth: ~30 chunks/paper × 1KB vectors — monitor; cap at 60 chunks/paper.
- Open: should chunks expire when the seed is deleted? Yes — extend GDPR delete + seed delete to purge PaperChunk by seed_id.

## Milestones

1. Parser + chunker + PaperChunk class, wired into ingest_paper (2 days)
2. Worker job + digest auto-parse + status chips in Studio (2 days)
3. `search_paper_content` tool + develop_idea prompt integration (1 day)
4. Backfill job for existing paper seeds (1 day)
