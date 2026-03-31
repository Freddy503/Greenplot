# Seedify — AI Second Brain

Personal knowledge management system powered by AI. Capture ideas via chat, voice, or notes → enriched with web research, entity extraction, and semantic connections → searchable via natural language.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│  React PWA   │────▶│  FastAPI Backend │────▶│   Weaviate    │
│  (Vercel)    │     │  (Docker)        │     │  Vector DB    │
└──────────────┘     └──────────────────┘     └───────────────┘
      │                      │                        │
   Voice, chat,          JWT auth,               Semantic search,
   file upload           tool calling,           enrichment metadata,
   streaming             enrichment bridge       tenant isolation
                             │
                     ┌───────┴────────┐
                     │ Postgres  Redis │
                     │ (users,  (jobs) │
                     │  ratings)       │
                     └────────────────┘
```

## Features

### Chat (7 tools)
- `search_seeds` — semantic search with enrichment metadata
- `search_seeds_filtered` — filter by domain, tags, energy level
- `get_seed_detail` — full seed with entities, backlinks, domain
- `create_seed` — capture ideas from chat
- `rate_seed` — rate seeds 1-5 stars
- `get_daily_briefing` — weather, recent seeds, creative prompt
- `web_search` — Exa-powered web search

### Enrichment Pipeline
- **Semantic chunking** — paragraph-aware (not fixed-size)
- **KERNEL extraction** — LLM-powered tags, entities, domain, energy classification
- **Autonomous backlinking** — BM25 candidate search + LLM relevance filtering
- **Auto-enrichment** — new seeds get enriched via `enrich_and_plant.py` bridge
- **Re-embed script** — backfill existing seeds with `enrichment/reembed.py`

### Cron Jobs (15 active)
| Schedule | Job |
|----------|-----|
| Every 5 min | Weaviate health check |
| Every 30 min | Voice memos → Seeds |
| 8:00 AM CET | FDE Daily Insight (mini-course) |
| 8:30 AM CET | Morning Idea Spark |
| 8:30 AM CET | Daily Briefing with Weather |
| 10:00 AM CET | PR Review Challenge |
| 2:00 AM UTC | Daily Backup (Weaviate + Notion) |
| 4:00 PM CET | Receptive-State Journal Prompt |
| Bi-daily | FDE Interview Prep |
| Weekly | Content Eval Review, FDE Study Check-in |
| 1st/15th | Biweekly Challenge Agent |

### FDE Training Systems
- **Daily Insight** — 6-module mini-course (Git → Docker → SQL → APIs → CI/CD → Databases)
- **PR Review** — daily GitHub PRs with AI-generated code, progressive difficulty
- **Interview Prep** — bi-daily questions from real Palantir/enterprise software FDE interviews

### Multi-Tenancy
- Weaviate: `tenant_id` property filter on all queries
- Postgres: user/tenant isolation via JWT auth
- New objects always get tenant_id; shared seeds (empty tenant_id) visible to all

## Running

### Backend
```bash
cd openclaw-api
docker compose up -d
```

Services: FastAPI (port 8001), Postgres (5432), Redis (6379), Weaviate (8080)

### Frontend
```bash
npm install
npm run dev
```
Open http://localhost:5173

### Enrichment
```bash
# Extend schema (one-time)
python3 enrichment/schema.py

# Re-embed all existing seeds
python3 enrichment/reembed.py

# Monitor enrichment health
python3 enrichment/monitor.py --full

# Check usage metering
python3 enrichment/usage_metering.py --summary
```

## Project Structure
```
├── src/                    # React frontend (Next.js)
├── openclaw-api/           # FastAPI backend
│   ├── app/
│   │   ├── main.py         # API endpoints
│   │   ├── tools.py        # Chat tool definitions (7 tools)
│   │   ├── tool_executor.py # Tool handlers
│   │   ├── weaviate_client.py # Weaviate search (tenant-filtered)
│   │   ├── enricher.py     # Embedding + seed generation
│   │   └── models.py       # Postgres models
│   └── docker-compose.yml
├── enrichment/             # Standalone enrichment pipeline
│   ├── schema.py           # Weaviate schema extension
│   ├── chunker.py          # Paragraph-aware semantic chunking
│   ├── extractor.py        # KERNEL entity/tag extraction
│   ├── backlinker.py       # BM25 + LLM relevance linking
│   ├── pipeline.py         # Orchestrator
│   ├── reembed.py          # Bulk re-processing
│   ├── queue.py            # Redis job queue
│   ├── monitor.py          # Health reports
│   ├── usage_metering.py   # ApiCall tracking
│   ├── fde_daily_insight.py    # FDE mini-course
│   ├── fde_interview_prep.py   # Interview questions
│   └── pr_review_challenge.py  # Daily PR challenges
├── skills/idea-garden-rag/ # Idea Garden automation
│   ├── enrich_and_plant.py # Web search + Nemotron synthesis
│   ├── sync_and_fetch_weaviate.py # Notion ↔ Weaviate sync
│   └── garden_orchestrator.py # Pipeline entry point
├── media/                  # Generated images
└── memory/                 # Daily logs
```

## Tech Stack
- **Frontend:** React, Next.js 16, TypeScript, Tailwind CSS, Vercel AI SDK
- **Backend:** FastAPI, Python 3.12, SQLAlchemy, JWT auth
- **Database:** PostgreSQL 15, Weaviate 1.24, Redis 7
- **AI:** OpenRouter (GPT-4o-mini, Nemotron), OpenAI embeddings
- **Infra:** Docker Compose, GitHub Actions, Vercel, Cloudflare tunnel
- **Integrations:** Notion API, Exa search, Black Forest Labs (image gen)

## Decisions
See `MEMORY.md` and daily `memory/` logs.
