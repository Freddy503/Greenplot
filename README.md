# Greenplot — The Living Laboratory

Your AI-powered second brain. Capture ideas through chat, voice, or notes — enriched with web research, your personal memory, and semantic connections.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Next.js PWA (Vercel)                         │
│  Chat · Garden · Sources · Onboarding · Voice Memos · Push         │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Chat v2  │  │  Garden   │  │ Sources  │  │  API Routes (25) │  │
│  │ + Tools  │  │ + Intel   │  │ + Bridge │  │  BACKEND_URL env │  │
│  └──────────┘  └───────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Authorization: Bearer JWT
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (Docker, port 8001)               │
│  JWT Auth · Tool Calling · Session Mgmt · Activity Feed            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │  Chat v1/v2  │  │  Enricher v2 │  │  Tool Executor (12)    │   │
│  │  (streaming) │  │  (pipeline)  │  │  search_seeds          │   │
│  │  + source    │  │  chunk→embed │  │  search_sources        │   │
│  │    surfacing │  │  →entity→    │  │  create_seed           │   │
│  └──────────────┘  │  backlink    │  │  create_seed_from_src  │   │
│                    └──────────────┘  │  read_source            │   │
│  ┌──────────────┐  ┌──────────────┐  │  web_search            │   │
│  │  Harvest     │  │  Activity    │  │  get_daily_briefing    │   │
│  │  (auto+manual│  │  Feed (Redis)│  │  get_garden_intel      │   │
│  └──────┬───────┘  └──────────────┘  │  get_knowledge_digest  │   │
│         │                             │  get_activity_feed     │   │
│         ▼                             │  rate_seed             │   │
│  ┌──────────────┐                     │  list_recent_seeds     │   │
│  │  Redis Queue │                     │  search_seeds_filtered │   │
│  │  (pub/sub)   │                     └────────────────────────┘   │
│  └──────┬───────┘                                                   │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │ Enrichment Worker│  │ Redis Cache  │  │  Cron Jobs       │     │
│  │ (separate proc)  │  │ (seed lookup)│  │  (harvest,brief) │     │
│  └──────────────────┘  └──────────────┘  └──────────────────┘     │
└──────┬───────────────┬──────────────────┬──────────────────────────┘
       │               │                  │
       ▼               ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│  PostgreSQL  │ │   Weaviate   │ │      Redis       │
│  (port 5432) │ │  (port 8080) │ │    (port 6379)   │
│              │ │              │ │                  │
│  users       │ │  IdeaSeed    │ │  enrichment queue│
│  seeds       │ │  Link        │ │  activity feed   │
│  ratings     │ │  230+ items  │ │  cache layer     │
│  sessions    │ │  BM25 + vec  │ │  task status     │
└──────────────┘ └──────────────┘ └──────────────────┘
```

## Core Concepts

### Seeds vs Sources

Two distinct entities with a clear bridge:

| | **Sources (Links)** | **Seeds (Garden)** |
|---|---|---|
| **What** | External URLs, references, articles | Personal ideas, insights, thoughts |
| **Flow** | Inbound (collect & browse) | Outbound (develop & connect) |
| **Value** | "Is this reference useful?" | "Is this idea worth pursuing?" |
| **Lifecycle** | Enriched once (metadata) | Full pipeline (enrich, connect, rate) |
| **Bridge** | → "Create Seed from Source" | ← Shows source origins |

### The Research → Idea → Development Flow

```
Sources Page (collect) ──→ "Create Seed from Source" ──→ Garden (develop)
       ↑                                                        │
       │                                                        ▼
Web Search auto-saves ←── Enrichment Pipeline ←── Seed enrichment
       │
Chat auto-surfaces relevant sources during conversation
```

## Features

### 💬 Chat (12 tools)
The chat is the primary interface to the entire knowledge base:

| Tool | Description |
|------|------------|
| `search_seeds` | Semantic search over Garden seeds |
| `search_sources` | Search saved source links |
| `create_seed` | Create a new idea seed |
| `create_seed_from_source` | Bridge: create seed from a source |
| `read_source` | Fetch and read full source content |
| `web_search` | Search web (auto-saves to Sources) |
| `get_daily_briefing` | Actionable morning digest |
| `get_garden_intelligence` | Trending, stale, health score |
| `get_knowledge_digest` | Recent seeds + sources + connections |
| `get_activity_feed` | What the system has been doing |
| `rate_seed` | Rate seeds 1-5 stars |
| `list_recent_seeds` | Browse recent seeds |

**Source Surfacing:** When relevant, the chat automatically surfaces saved sources that match the conversation topic. The LLM sees: *"📎 Relevant sources: Forward-Deployed Engineer (sundeepteki.org)"* and can reference them.

**Source Browsing:** For complex questions, the LLM can use `read_source` to fetch and read the full content of saved sources, then synthesize an answer.

### 🌱 Garden
- Semantic search via Weaviate (BM25 + vector)
- Knowledge graph with seed connections
- **Garden Intelligence API:** trending seeds, stale seeds (decay signal), health score, source breakdown
- Star ratings for seed quality

### 📎 Sources
- Auto-enriched on add (title, summary, domain, favicon, OG image)
- Auto-connected to related seeds (tag/domain/title scoring)
- Auto-populated from web searches (both chat and enrichment pipeline)
- "Create Seed from Source" button (Sources → Garden bridge)
- Shows spawned seeds for each source

### ⚡ Architecture

**Task Service Separation:**
- Enrichment runs as a standalone worker (`openclaw-worker` container)
- Harvest pushes jobs to Redis queue (non-blocking)
- Worker processes enrichment independently
- Fallback to inline if Redis is down

**Redis Layer:**
- **Queue:** Sorted set for enrichment job priority
- **Cache:** Seed/link lookups (5min TTL) for Garden page performance
- **Activity Feed:** Sorted set of system events
- **Task Status:** Hash of enrichment job states

**Activity Feed:**
Tracks system events: seed creation, source discovery, enrichment completion, ratings. Available via API and chat tool.

### 🧠 Multi-Layer Memory (MLMA)
Based on [arxiv.org/abs/2603.29194](https://arxiv.org/abs/2603.29194):
- **Working Memory** — bounded dialogue window
- **Episodic Memory** — recursive session summaries with decay
- **Semantic Memory** — entity-event graphs with stability scores

### 🎙️ Voice Memos
Record → Whisper transcription → message → optional seed creation

### 📊 MemFactory Pipeline
Inspired by [Valsure/MemFactory](https://github.com/Valsure/MemFactory):
- Extractor → Updater → Retriever with adaptive layer weighting

### 🖼️ Image Generation
"Visualize this idea" → BFL FLUX.2 [pro] generates concept art

### 📅 Google Calendar Integration
OAuth connect → smart cron timing based on calendar gaps

## Running

### Backend (Docker Compose)
```bash
cd openclaw-api
docker compose up -d --build
```
Services:
- **FastAPI** (port 8001) — main API
- **Enrichment Worker** — background enrichment via Redis queue
- **PostgreSQL** (port 5432) — users, seeds, ratings, sessions
- **Weaviate** (port 8080) — vector + BM25 search
- **Redis** (port 6379) — queue, cache, activity feed

### Frontend (Vercel)
```bash
npm install
npm run dev
```

## Project Structure
```
├── src/                        # Next.js frontend
│   ├── app/
│   │   ├── chat/               # Chat page with source surfacing
│   │   ├── garden/             # Garden grid/list + intelligence
│   │   ├── links/              # Sources page + create seed bridge
│   │   ├── onboarding/         # 5-step onboarding flow
│   │   └── api/
│   │       ├── chat/           # AI streaming proxy (v1/v2)
│   │       ├── seeds/          # Seed CRUD + search + graph
│   │       ├── links/          # Source CRUD + enrichment
│   │       └── push/           # Push notifications
│   ├── components/
│   │   ├── ai-elements/        # AI SDK UI (Conversation, Message, Tool, Sources)
│   │   ├── links/              # Link detail sheet + seed bridge
│   │   ├── seeds/              # Seed detail + knowledge graph
│   │   └── ui/                 # shadcn/ui components
│   └── hooks/
│       ├── use-voice-recorder.ts
│       └── use-push-notifications.ts
├── openclaw-api/               # FastAPI backend
│   ├── app/
│   │   ├── main.py             # API routes (45+)
│   │   ├── weaviate_client.py  # Weaviate client (IdeaSeed + Link)
│   │   ├── tool_executor.py    # 12 LLM tool handlers
│   │   ├── tools.py            # Tool definitions (OpenAI format)
│   │   ├── enricher_v2.py      # Seed enrichment pipeline
│   │   ├── entity_extractor.py # LLM topic/entity extraction
│   │   ├── backlinker.py       # Auto-link related seeds
│   │   ├── task_broker.py      # Redis queue (publish/consume)
│   │   ├── task_worker.py      # Standalone enrichment worker
│   │   ├── cache.py            # Redis cache layer
│   │   ├── activity.py         # Activity feed (Redis sorted set)
│   │   ├── links.py            # Source link CRUD + enrichment
│   │   ├── database.py         # SQLAlchemy + PostgreSQL
│   │   └── agent/              # Chat agent architecture
│   └── docker-compose.yml      # Full stack orchestration
├── skills/idea-garden-rag/     # Notion pipeline
│   ├── enrich_and_plant.py     # Web search + Nemotron synthesis
│   ├── garden_orchestrator.py  # Pipeline entry point
│   ├── sync_and_fetch_weaviate.py  # Notion ↔ Weaviate sync
│   └── multi_layer_memory.py   # MLMA implementation
└── memory/                     # Session logs
```

## Cron Jobs
| Job | Schedule | Description |
|---|---|---|
| Weaviate Watchdog | Every 30 min | Health check, alerts on failure |
| Auto-seed Harvest | Every 30 min | Scan chat sessions → Redis queue → enrichment |
| Daily Briefing | 8:30 AM CET | Weather + seeds to review + new sources |
| Morning Idea Spark | 8:30 AM CET | Creative prompt from latest seed |
| Daily Reflection | 4:00 PM CET | Reflection prompt + push |
| Voice → Seeds | Every 30 min | Process voice memo transcriptions |
| Backup | 2:00 AM UTC | Weaviate + Notion backup |
| Seed Extraction | 11:00 PM UTC | Extract seeds from daily conversations |

## Tech Stack
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, AI SDK
- **Backend:** FastAPI, Python 3.12, SQLAlchemy, JWT auth
- **Database:** PostgreSQL 15, Weaviate 1.36 (BM25 + vector), Redis 7
- **AI:** OpenRouter (Nemotron Super, Mimo), OpenAI Whisper, BFL FLUX
- **Memory:** Multi-Layer Memory Architecture + MemFactory pipeline
- **Infra:** Docker Compose, Vercel Pro, OpenClaw (agent orchestration)

## Design System
- Primary: `#69f6b8` | Background: `#01120b`
- Font: Plus Jakarta Sans (headings) + Be Vietnam Pro (body)
- All pill-shaped (border-radius: 9999px)
- Glass-morphism headers, gradient CTAs, dark green theme

## Status
🟢 **Working:** Chat (12 tools), Garden + Intelligence, Sources + Bridge, Enrichment worker, Redis queue/cache, Activity feed, Login, Knowledge graph, PWA notifications, Image generation, Calendar integration
🟡 **Partial:** Enrichment fields (5/230+ seeds enriched — pipeline re-run pending)
🔴 **Pending:** App Store (Capacitor), Figma MCP, mobile PWA polish
