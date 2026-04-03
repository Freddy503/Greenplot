# GreenPlot: Remaining Features — Full Specs

## A. Quick Wins (Low effort, high value)

### A1. Export Markdown
- Wiki article detail → "Download .md" button
- Generates clean markdown file with title, content, sources
- `GET /api/v1/wiki/:id/export` returns markdown text

### A2. Bulk Bookmark Import
- Paste browser bookmark JSON export (Chrome/Firefox)
- Parses bookmark tree, extracts URLs + titles
- Batch creates links via existing `/api/v1/links/bulk`
- Frontend: paste-area modal in Hub page

### A3. File Chat Outputs Back
- After each assistant response, auto-detect if it contains a useful insight
- "Save to Garden" button on each assistant message
- Creates a seed in the parking lot via `/api/v1/seeds` (existing)
- Simple: user clicks → seeds the message content

## B. Medium (Core functionality gaps)

### B1. Auto-Trigger Connections on Enrichment
- When a link status changes to "enriched", run detect-connections for that link
- Background: PATCH /api/v1/links/:id with status="enriched" also triggers connection scan
- No separate cron needed — event-driven

### B2. Regenerate Wiki Article (Real)
- `POST /api/v1/wiki/:id/regenerate` actually re-runs LLM synthesis
- Fetches source links from article's sourceLinkIds
- Re-runs the Nemotron synthesis prompt
- Updates article in place (content, summary, updatedAt)

### B3. Vector Indexing for Links
- Change Weaviate Link schema: enable vectorizer (text2vec-openrouter)
- Requires: embedding generation on link creation
- Benefit: semantic search over links (not just word overlap)
- `update_link` called after creation with embedded vector

### B4. Obsidian-Compatible Export
- Export wiki articles as .md with wikilinks: `[[Article Title]]`
- Export entire wiki as zip of .md files in folder structure
- `GET /api/v1/wiki/export/obsidian` returns zip

## C. Heavy (Long-term moat)

### C1. Vector-Based Connection Detection
- Replace word-overlap with Weaviate nearVector search
- For each enriched link, find top-5 similar links by embedding
- Score = cosine similarity * 10
- Much better semantic connections

### C2. Training Data Export
- Export garden as structured Q&A pairs
- `GET /api/v1/garden/export-training` returns JSONL
- Each pair: { "question": "...", "answer": "...", "sources": [...] }
- Generated from wiki articles + Q&A history

### C3. Linting Auto-Fix
- Detect: links with empty summaries, wiki articles with missing sources
- Auto-fix: re-enrich empty summaries, re-link orphan articles
- `POST /api/v1/garden/lint` runs checks + fixes

### C4. RSS/Feed Auto-Add
- User adds feed URL → system polls on schedule
- New articles auto-create links
- Cron job: check feeds every 6h
