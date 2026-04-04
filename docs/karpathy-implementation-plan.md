# Missing from Karpathy Gap Analysis — Implementation Plan

## 1. Wiki Index Page (`/wiki-index`)
### What Karpathy has
- `index.md` — human-readable catalog of every page with summaries
- Organized by category (entities, concepts, sources)
- LLM reads index first to find relevant pages

### What we have
- Weaviate metadata (powerful but not browsable by humans)
- Wiki card list (title + summary, no search/filter)

### Implementation
| Step | Effort | Details |
|---|---|---|
| Backend endpoint | 0.5 day | `GET /api/v1/wiki/index` returns all articles with title, category, summary, update date, seed/link counts |
| Frontend page | 0.5 day | `/wiki-index` page with search, filter by category, sort by date, category badges |
| Navigation | 0.25 day | Add "Index" icon/link to wiki page + bottom nav |

## 2. Wiki Lint Operation  
### What Karpathy has
- Periodic health check for contradictions, orphans, stale claims
- Identifies orphan pages with 0 inbound links
- Flags concepts mentioned but lacking their own page

### What we have
- Garden lint (decay scoring, stale seeds)
- No wiki lint whatsoever

### Implementation
| Step | Effort | Details |
|---|---|---|
| Cron job | 0.5 day | Sundays 6PM CET, same as Content Eval |
| Lint checks | 0.5 day | Orphan articles (0 backlinks), stale claims (>30 days old, sources superseded), missing cross-refs (shared topics with no links) |
| Report | 0.5 day | Saves as WikiArticle `status: lint-report`, sends Telegram summary |
| Auto-fix | Future | Auto-create backlinks for orphan pages |

## 3. Query Answer Compounding
### What Karpathy has
- Good answers from chat are filed back as new wiki pages
- Explorations compound in the knowledge base

### What we have
- "Save to Garden" button (creates seed, not wiki article)
- Wiki is compiled-only, not from chat

### Implementation
| Step | Effort | Details |
|---|---|---|
| "Save Answer to Wiki" | 0.5 day | Button below assistant responses in chat |
| LLM structuring | 0.5 day | Convert chat answer → wiki article format |
| Frontend UX | 0.5 day | Modal with preview before saving |

## 4. Incremental Per-Source Updates
### What Karpathy has
- Add one source → LLM updates 10-15 existing wiki pages
- Organic, incremental wiki growth

### What we have
- Batch compile by domain only
- No update propagation when new source added

### Implementation
| Step | Effort | Details |
|---|---|---|
| Source added trigger | 0.5 day | When link added or seed created → scan existing articles |
| Update candidate | 0.5 day | Find articles with overlapping tags/keywords → update content |
| LLM update call | 1 day | "Revise article X to include new source Y" prompts |
