# Drop-a-PDF in Studio → Chunk, View, Link to Garden — PRD

**Status:** spec · **Owner:** Freddy · **Builds on:** `paper-parsing-pipeline.md`

## Problem Alignment

Today, full-text papers only enter the garden via the Research Digest or
`ingest_paper` (arXiv URL / Exa). Users can't bring their **own** PDFs —
research papers, reports, whitepapers — directly. They want to **drop a PDF
into the Studio**, watch it get chunked (with a progress bar) through the
existing pipeline, **read the PDF in-app**, and immediately see **how it
connects to their garden** (related seeds, wiki articles).

Separately, EU users need visible reassurance that their data stays in the EU —
the server sits in Frankfurt (Hetzner) and all data is stored in the EU.

## Solution Summary

Reuse the existing `paper_pipeline` almost entirely. Add:
1. A **drop zone in Studio** that uploads a PDF (binary) → creates a paper seed
   with `source: "upload"` → stores the file at `/data/papers/{seed_id}.pdf` →
   enqueues the **existing** parse→chunk→embed→`PaperChunk` job, *skipping the
   fetch stage* (the file is already local).
2. A **progress bar** driven by the seed's `parse_status` + `chunk_count`
   (`uploading → queued → parsing → parsed`), polled while open.
3. A **PDF viewer** (serve `/data/papers/{seed_id}.pdf`, render with `pdf.js`).
4. A **"Links to your garden" panel** populated from `backlinker.search_similar`
   over the new chunks/seed — related seeds, wiki articles, and overlapping
   papers, each a tap-through.

Plus a concise **"Your data stays in the EU"** section on the landing page.

## System Architecture

### Backend (mostly reuse)
- **Upload endpoint** (new): `POST /api/v1/papers/upload` — `multipart/form-data`,
  `UploadFile` (PDF only, ≤25 MB), tenant-scoped. Creates a seed
  (`seed_type=spec`/paper, `source: "upload"`, `parse_status: "pending"`),
  writes the file to `/data/papers/{seed_id}.pdf`, enqueues the parse job, returns
  `{seed_id}`. Reuses size/type guards from `process_attachments`.
- **Parse job** (reuse `paper_pipeline`): branch the fetcher — if a local file
  exists, parse it directly (`pymupdf`) instead of downloading. Everything
  downstream (section-aware chunk → embed → `PaperChunk` → `parse_status`,
  `chunk_count`) is unchanged.
- **Garden linking** (reuse `backlinker`): after chunks land, run
  `search_similar` on the paper to create `SeedLink`s; expose them via
  `GET /api/v1/papers/{seed_id}/links` → `{related_seeds, wiki_articles, papers}`.
- **Status** (reuse): `GET /api/v1/seeds/{id}` already returns
  `parse_status` + `chunk_count` → the progress bar polls this (every ~1.5 s
  until `parsed`/`failed`).
- **Serve PDF** (new): `GET /api/v1/papers/{seed_id}/file` → streams the stored
  PDF (tenant-scoped, `Content-Type: application/pdf`). Behind the Next proxy.

### Frontend (Studio)
- **Drop zone**: a dashed "Drop a PDF" target on the Studio canvas (and a file
  picker fallback). On drop → `POST /papers/upload` (with an XHR progress event
  for the upload %).
- **Progress bar**: card appears immediately showing
  `Uploading → Queued → Parsing → Indexed · N chunks`, polling seed status.
- **Paper detail view**: split layout — left, the **PDF viewer** (`pdf.js` /
  `react-pdf`); right, the **"Links to your garden"** panel (related seeds,
  wiki, papers as chips → deep-link to `/garden?seed=…`, `/library?article=…`).
- Reuses the existing Studio paper-status chip ("Full text indexed · N chunks").

### Data flow
`drop PDF → POST /papers/upload → seed(parse_status=pending) + file saved →
enqueue parse job → worker: parse(local) → chunk → embed → PaperChunk×N →
parse_status=parsed → backlinker → SeedLinks → UI polls status, then renders
viewer + garden links.`

## UX Flow
1. User drags a PDF onto the Studio canvas.
2. A card appears: upload bar → "Queued" → "Parsing…" → "Indexed · 24 chunks".
3. Card opens to a reader: PDF on the left, "Links to your garden" on the right
   ("Relates to 3 seeds, 1 wiki article — tap to explore").
4. The paper is now a normal garden seed: searchable, citable in chat/specs,
   included in wiki compilation.

## Data Model (paper seed `seed_metadata`)
`source: "upload"`, `parse_status: pending|queued|parsing|parsed|failed`,
`chunk_count: int`, `file_path: "/data/papers/{seed_id}.pdf"`,
`original_filename`, `page_count`, plus existing seed fields. Links live in
`SeedLink` (already used by backlinker).

## Scope & Capabilities
**In (v1):** PDF drag-drop + picker in Studio, binary upload, reuse of the full
parse/chunk/index pipeline, progress bar, in-app PDF viewer, "Links to your
garden" panel, tenant scoping, GDPR delete purges the file + `PaperChunk`s.
**Out (v1):** non-PDF docs (docx/epub), OCR for scanned PDFs, figure/table
extraction, multi-file batch drop, annotations/highlights, >25 MB files.

## Privacy / EU data-safety (landing page)
Add a compact **"Your data stays in the EU"** section to the landing page
(`src/app/page.tsx`) and a one-liner in onboarding's privacy step:
- Servers in **Frankfurt, Germany (Hetzner)**; all data stored in the **EU**.
- **GDPR-compliant**; data encrypted in transit; **delete anytime** (account
  delete already purges Postgres + Weaviate + files).
- No training on your data; no third-country transfer of stored content.
- Link to the existing `/privacy` page and `/impressum`.
Placement: a small trust strip near the waitlist CTA (icons: lock, EU flag,
"Frankfurt"). Keep it factual — verify the Resend/OpenRouter/Exa sub-processor
note on the privacy page matches reality.

## Delivery Risks & Open Questions
- **Disk**: PDFs live on the 38 GB VPS volume — cap file size (25 MB), count
  files, and include `/data/papers` in the backup + the disk-usage watch.
- **Parse quality**: scanned/figure-heavy PDFs parse poorly → `parse_status=
  failed` must degrade gracefully (viewer still works, no chunks).
- **Sub-processors & EU claim**: OpenRouter/Exa/Resend may process data outside
  the EU. The "data *stored* in the EU" claim is true (Hetzner + Supabase EU);
  but be precise on the landing/privacy copy that *LLM/search* calls go to
  third-party APIs — list them as sub-processors to keep the claim honest.
- **Open**: should an uploaded PDF auto-attach to the current product on the
  canvas, or land in the garden first? (Recommend: garden first, then user
  drags it onto a product — consistent with existing PRD flow.)

## Milestones
1. Upload endpoint + local-file parse branch + PDF serve endpoint (1.5 d)
2. Studio drop zone + progress bar polling (1 d)
3. PDF viewer + "Links to your garden" panel (1.5 d)
4. EU data-safety landing section + privacy-page sub-processor accuracy (0.5 d)
5. GDPR delete purges file + chunks; backup includes `/data/papers` (0.5 d)
