# Karpathy LLM Wiki Pattern vs GreenPlot — Gap Analysis

**Date:** 2026-04-04
**Source:** [Karpathy gist — llm-wiki.md](https://gist.githubusercontent.com/karpathy/442a6bf555914893e9891c11519de94f/raw/ac46de1ad27f92b28ac95459c782c07f6b8c964a/llm-wiki.md)
**Status:** Awaiting approval for implementation

## Karpathy's Core Pattern

> "Instead of retrieving from raw documents at query time, the LLM **incrementally builds and maintains a persistent wiki** — a structured, interlinked collection of markdown files that sits between you and the raw sources."

### Karpathy Architecture
1. **Raw sources** (immutable) — articles, papers, data files
2. **The wiki** (LLM-owned) — directory of LLM-generated markdown files
3. **The schema** (co-evolved) — document telling the LLM how to structure/maintain the wiki
4. **index.md** — catalog of every page with summaries
5. **log.md** — append-only timeline with parseable prefixes
6. **Three operations:** Ingest (one at a time, human-involved), Query (answers filed back), Lint (health check)

## Where GreenPlot Matches ✅

| Concept | Karpathy | GreenPlot |
|---|---|---|
| Three layers | Sources → Wiki → Schema | Sources → Seeds → Wiki |
| LLM synthesis | Wiki pages written by LLM | Wiki articles synthesized by LLM |
| Persistent wiki | Yes | Yes |
| Auto-linking | Cross-references maintained | Automatic seed/link connections |
| Markdown-based | Git repo of .md files | Weaviate + Notion |

## Where We Deviate (Gaps) 🔸

| Gap | Impact | Karpathy's Version | GreenPlot Current |
|---|---|---|---|
| **1. Batch vs incremental ingest** | Medium | Updates 10-15 wiki pages per source | Domain-batch compilation |
| **2. No index.md equivalent** | High | Human-readable catalog of all pages | Weaviate metadata (not browsable) |
| **3. No wiki lint operation** | High | Periodic health check for contradictions, orphans, stale claims | Garden lint exists, wiki lint does not |
| **4. Query answers don't compound** | Medium | Good answers filed back as wiki pages | Answers disappear into chat history |
| **5. No human in loop on ingest** | Low | User stays involved, guides emphasis | Fully automated pipeline |

## Where GreenPlot Exceeds Karpathy 🚀

| Feature | GreenPlot | Karpathy |
|---|---|---|
| **Decay scoring** | Mathematical model (14-day half-life, visit tracking) | None |
| **Push notifications** | Proactive delivery via 14 cron jobs | Pull-only |
| **Activity Summary** | "What's New" on login | None |
| **Multi-tenant** | Built for many users | Single-user Obsidian |
| **Chat as unified interface** | All interaction happens in one place | Requires Obsidian + terminal |
| **Missed connections** | Finds unlinked seed pairs with shared tags | None |
| **Voice memos** | Auto-transcription → seeds | None |
| **Auto-bridge** | Sources → Seeds when no related seeds exist | None |
| **Garden Intelligence API** | Trending, stale, revisit suggestions | None |
| **BFL hero images** | Generated concept art per article | None |
| **D3 concept maps** | Force-directed connection visualizations | Graph view (Obsidian) |
| **Cron job automation** | 14 jobs running on autopilot | None |
| **Enrichment pipeline** | Multi-stage (chunk→embed→entity→backlink) | Manual ingest |
| **Source surfacing in chat** | Auto-shows relevant sources during conversation | None |
| **Missed connections** | Finds unlinked seed pairs with shared tags | None |

## Proposed Adoptions (Pending Approval)

### P0 — Should Do This Week

**1. Wiki Index Page (`/wiki/index` or index.md endpoint)**
- Endpoint: `GET /api/v1/wiki/index`
- Returns all wiki articles with title, category, summary, source counts, last updated
- Ordered by category → recency
- Frontend: browsable table with search/filter
- **Effort:** 1 day
- **Value:** Makes wiki navigable without Weaviate query

**2. Wiki Lint Operation**
- Endpoint: `POST /api/v1/wiki/lint`
- Checks: contradictions between articles, orphan pages (0 inbound links), stale claims (sources superseded), missing cross-refs, categories with 0 articles
- Scheduled cron: weekly (Sunday, same time as Content Eval)
- **Effort:** 1 day
- **Value:** Self-healing wiki that gets healthier over time

### P1 — Should Do This Month

**3. Incremental Per-Source Updates (Optional, behind toggle)**
- When a new Source → Seed is created, prompt LLM to update relevant existing wiki articles
- Uses the same LLM synthesis prompts but scoped to affected articles only
- Keeps wiki current in real-time, not just batch
- **Effort:** 2 days
- **Value:** Organic wiki growth, not big-bang compilation

**4. Wiki Activity Log**
- Append to existing Activity Feed with parseable prefix: `## [2026-04-02] compile | Domain — Insights (3 links + 8 seeds)`
- Exportable as log.md on demand
- Cron: `GET /api/v1/wiki/log?format=md`
- **Effort:** 0.5 day
- **Value:** Timeline of wiki evolution, grep-friendly

### P2 — Nice to Have

**5. Save Query Answer to Wiki**
- In chat: "Save this answer to wiki" button
- Creates a wiki article with `source: "chat_answer"`
- Links to the conversation and the question asked
- **Effort:** 1 day
- **Value:** Chat explorations compound into the knowledge base

## Recommendation

Start with **P0 (Index + Lint)** this week. Both are small wins that immediately improve wiki usability. Then evaluate whether P1 (incremental updates) is worth the 2-day investment based on how the index/lint perform.

P2 (save answers) is low priority — the chat is already a powerful interface, and filing answers back is more a Karpathy/Obsidian pattern than a GreenPlot/Chat-first pattern.
