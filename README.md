# Seedify — AI Creativity Companion

A trusted AI companion that learns and grows with you. Capture ideas through chat, voice, or notes — enriched with web research, semantic connections, and entity extraction — searchable via natural language.

## Vision

Seedify isn't a note-taking app. It's a thinking partner that:
- **Learns** from your ideas, building a personal knowledge graph over time
- **Grows** with you — the more you use it, the smarter its connections become
- **Enriches** every idea with context: related concepts, web research, entity links
- **Protects** your data — multi-tenant isolation, per-user knowledge boundaries

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

## Key Components

### Chat Interface
AI-powered chat with 7 integrated tools:
- **Semantic search** — find ideas by meaning, not keywords
- **Filtered search** — browse by domain, tags, energy level
- **Seed detail** — full enrichment: entities, backlinks, related concepts
- **Create & rate** — capture and evaluate ideas inline
- **Web search** — enrich ideas with current information
- **Daily briefing** — personalized overview of recent activity

### Enrichment Pipeline
Every idea gets automatically enriched:
1. **Semantic chunking** — paragraph-aware splitting (not dumb character limits)
2. **Entity extraction** — LLM-powered identification of people, projects, concepts
3. **Tag classification** — domain and energy level classification
4. **Autonomous backlinking** — finds connections to existing ideas via semantic similarity
5. **Re-embedding** — bulk re-process existing ideas when the pipeline improves

### Knowledge Graph
Ideas aren't isolated notes — they form a growing graph:
- Each idea has tags, entities, domain, and energy level
- Backlinks connect related ideas automatically
- Search returns enriched context, not just raw text
- The graph gets denser and more useful over time

### Multi-Tenancy
Built for sharing from day one:
- Per-user data isolation via `tenant_id`
- JWT authentication
- Users see only their own ideas + shared content
- Friends can be onboarded with simple registration

## Running

### Backend
```bash
cd openclaw-api
docker compose up -d
```

Services: FastAPI (port 8001), PostgreSQL (5432), Redis (6379), Weaviate (8080)

### Frontend
```bash
npm install
npm run dev
```

### Enrichment
```bash
# Extend Weaviate schema
python3 enrichment/schema.py

# Re-embed existing ideas
python3 enrichment/reembed.py

# Monitor enrichment health
python3 enrichment/monitor.py --full
```

## Project Structure
```
├── src/                    # React frontend (Next.js)
│   └── app/api/chat/       # AI chat streaming endpoint
├── openclaw-api/           # FastAPI backend
│   ├── app/
│   │   ├── main.py         # API endpoints
│   │   ├── tools.py        # Chat tool definitions
│   │   ├── tool_executor.py # Tool handlers
│   │   ├── weaviate_client.py # Vector search
│   │   ├── enricher.py     # Embedding + generation
│   │   └── models.py       # Data models
│   └── docker-compose.yml
├── enrichment/             # Enrichment pipeline
│   ├── schema.py           # Weaviate schema
│   ├── chunker.py          # Semantic chunking
│   ├── extractor.py        # Entity extraction
│   ├── backlinker.py       # Connection finding
│   ├── pipeline.py         # Orchestrator
│   ├── reembed.py          # Bulk re-processing
│   ├── monitor.py          # Health monitoring
│   └── usage_metering.py   # Usage tracking
├── skills/idea-garden-rag/ # Idea Garden automation
│   ├── enrich_and_plant.py # Web search + synthesis
│   ├── sync_and_fetch_weaviate.py # Notion sync
│   └── garden_orchestrator.py # Pipeline entry
├── media/                  # Generated images
└── memory/                 # Session logs
```

## Tech Stack
- **Frontend:** React, Next.js 16, TypeScript, Tailwind CSS, Vercel AI SDK
- **Backend:** FastAPI, Python 3.12, SQLAlchemy, JWT auth
- **Database:** PostgreSQL 15, Weaviate 1.36, Redis 7
- **AI:** OpenRouter (GPT-4o-mini, Nemotron), OpenAI embeddings
- **Infra:** Docker Compose, GitHub Actions, Vercel (Hobby tier)

## Known Issues & Status

### Tunnel Flakiness
The Cloudflare tunnel connecting Vercel → backend intermittently drops requests, especially during long tool calls (>8s). Simple requests (2-3s) work fine.

### Vercel Hobby Timeout
Vercel Hobby plan limits serverless functions to 10 seconds. Tool-heavy requests (research, search) often exceed this, causing timeouts. Options:
- Upgrade to **Vercel Pro** ($20/mo) — 300s timeout
- Set up **HTTPS on the server** with Let's Encrypt — stable direct connection
- Accept limitation — simple chat works, tools may timeout

### Weaviate Enrichment
Enrichment fields (domain, tags, energy) are empty — pipeline reported success but data not saved. Needs re-run.

### Idea Garden
100 seeds in Weaviate, but enrichment data missing. BFL concept maps generated for some seeds.

## Design Principles
- **Immutability where possible** — frozen dataclasses, no accidental mutation
- **Enrichment is automatic** — ideas get smarter without user effort
- **Search understands meaning** — vector similarity, not keyword matching
- **Data stays private** — tenant isolation at every layer
- **Ship incrementally** — working software over perfect architecture

## Decisions
See `MEMORY.md` and daily `memory/` logs.
