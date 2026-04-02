# Greenplot — The Living Laboratory

Your AI-powered second brain. Capture ideas through chat, voice, or notes — enriched with web research, your personal memory, and semantic connections.

## Vision

Greenplot is a **second brain** that:
- **Learns** from every conversation, building a personal knowledge graph
- **Remembers** context across sessions via multi-layer memory architecture
- **Enriches** ideas with web research, semantic connections, and entity extraction
- **Protects** your data — local-first, multi-tenant isolation

Inspired by [Obsidian](https://obsidian.md/)'s philosophy: **your thoughts are yours, stored privately, connected meaningfully, lasting forever.**

## What We Learned from Obsidian

| Obsidian Concept | Greenplot Implementation |
|---|---|
| **Wikilinks (`[[Note]]`)** | Automatic backlinking between seeds via entity extraction |
| **Backlinks pane** | Seed Connections card shows related seeds by domain |
| **Graph View** | Weaviate semantic graph + domain cluster visualization |
| **Daily Notes** | Daily Briefing cron + auto-harvest from conversations |
| **Tags & metadata** | Enrichment fields: domain, tags, energy, entities |
| **Plugin ecosystem** | Modular pipeline (extractor → updater → retriever) |
| **Local-first** | Data on your server, open formats, no vendor lock-in |
| **Transclusion** | Garden enrichment injects relevant seeds into chat context |

**Key insight from Obsidian:** The magic isn't in storing notes — it's in *connecting* them. Every link compounds value over time. Greenplot automates this connection-building.

## Architecture

```
┌────────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Next.js PWA   │────▶│  FastAPI Backend │────▶│   Weaviate    │
│  (Vercel)      │     │  (Docker)        │     │  Vector DB    │
└────────────────┘     └──────────────────┘     └───────────────┘
       │                      │                        │
    Chat, voice,          JWT auth,               BM25 search,
    enrichment            tool calling,           seed storage,
    memory retrieval      session mgmt            enrichment data
                              │
                      ┌───────┴────────┐
                      │ Postgres  Redis │
                      │ (users,  (jobs) │
                      │  ratings)       │
                      └────────────────┘
```

## Core Features

### 🧠 Multi-Layer Memory (MLMA)
Based on [arxiv.org/abs/2603.29194](https://arxiv.org/abs/2603.29194) — three memory layers with adaptive retrieval:

- **Working Memory** — bounded window of recent dialogue (2000 tokens)
- **Episodic Memory** — recursive session summaries with decay (α=0.7)
- **Semantic Memory** — stable entity-event graphs with stability scores

Adaptive gating: `γ_i = softmax(β * sim(query, layer_i))` — dynamically prioritizes the most relevant layer.

### 🌱 Garden Enrichment
Every message is enriched from two sources in parallel:
1. **Garden search** — BM25 on Weaviate (your captured knowledge)
2. **Memory retrieval** — adaptive layer weighting (your conversation history)

Intelligent gating: skips enrichment for greetings/short messages, enriches substantive questions.

### 🎙️ Voice Memos
Tap the mic → record → auto-transcribe via backend Whisper → send as message → optionally plant as seed.

### 📊 MemFactory Pipeline
Inspired by [Valsure/MemFactory](https://github.com/Valsure/MemFactory) — modular memory processing:
- **Extractor** — LLM extracts structured memory items (key, value, type, tags)
- **Updater** — decides ADD/UPDATE/DEL/NONE operations per item
- **Retriever** — adaptive layer-weighted context retrieval

### 🔌 shadcn/ui Components
10+ shadcn components: Progress, Skeleton, Sonner/Toaster, Empty, Alert, Checkbox, Drawer, Sheet, Switch, Toggle, Kbd, Slider, Field.

### 🎨 Stitch Design System
Design tokens from Google Stitch MCP:
- Primary: `#69f6b8` | Background: `#01120b`
- Font: Plus Jakarta Sans + Be Vietnam Pro
- All pill-shaped (border-radius: 9999px)
- Glass-morphism headers, gradient CTAs

## Running

### Backend
```bash
cd openclaw-api
docker compose up -d
```
Services: FastAPI (8001), PostgreSQL (5432), Redis (6379), Weaviate (8080)

### Frontend
```bash
npm install
npm run dev
```

### Memory & Enrichment
```bash
# Multi-layer memory (Python)
python3 skills/idea-garden-rag/multi_layer_memory.py

# MemFactory pipeline
python3 skills/idea-garden-rag/memfactory_pipeline.py

# Enrichment pipeline
python3 enrichment/pipeline.py

# Weaviate watchdog
python3 weaviate_watchdog.py
```

## Project Structure
```
├── src/                        # Next.js frontend
│   ├── app/
│   │   ├── chat/               # Chat page with enrichment
│   │   ├── garden/             # Knowledge garden view
│   │   ├── onboarding/         # 5-step onboarding flow
│   │   └── api/
│   │       ├── chat/           # AI streaming proxy
│   │       ├── seeds/          # Seed CRUD + search + memory
│   │       └── thoughts/       # Thought ingestion
│   ├── components/
│   │   ├── ai-elements/        # AI SDK UI components
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── layout/             # Header, BottomNav
│   │   └── seeds/              # Seed-related components
│   └── hooks/
│       └── use-voice-recorder.ts
├── skills/idea-garden-rag/     # Memory & enrichment
│   ├── multi_layer_memory.py   # MLMA (arxiv paper impl)
│   ├── memfactory_pipeline.py  # MemFactory-inspired pipeline
│   ├── enrich_and_plant.py     # Web search + synthesis
│   └── garden_orchestrator.py  # Pipeline entry
├── enrichment/                 # Enrichment pipeline
├── openclaw-api/               # FastAPI backend
├── memory/                     # Session logs
└── backups/                    # Weaviate + Notion backups
```

## Cron Jobs
| Job | Schedule | Description |
|---|---|---|
| Weaviate Watchdog | Every 30 min | Health check, alerts on failure |
| Auto-seed Harvest | Every 30 min | Scan sessions for new seeds |
| Daily Briefing | 8:30 AM CET | Personalized morning overview |
| Morning Idea Spark | 8:30 AM CET | Creative prompt from garden |
| FDE Course | 8:00 AM CET | Daily learning lesson |
| Voice → Seeds | Every 30 min | Process voice memo transcriptions |
| Backup | 2:00 AM UTC | Weaviate + Notion backup |
| PR Review | 10:00 AM CET | Code challenge from repo |

## Tech Stack
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend:** FastAPI, Python 3.12, SQLAlchemy, JWT auth
- **Database:** PostgreSQL 15, Weaviate 1.36, Redis 7
- **AI:** OpenRouter (Nemotron, Mimo), OpenAI Whisper
- **Memory:** Multi-Layer Memory Architecture + MemFactory pipeline
- **Design:** Google Stitch MCP, Material Symbols
- **Infra:** Docker Compose, Vercel, OpenClaw (agent orchestration)

## Design Principles
- **Connection > Storage** — the value is in linking ideas, not hoarding them
- **Enrichment is automatic** — ideas get smarter without user effort
- **Memory persists** — conversations build on each other across sessions
- **Local-first** — data on your server, open formats
- **Ship incrementally** — working software over perfect architecture

## Status
🟢 Chat + Garden — working
🟡 Seed creation — fixing (thoughts endpoint proxy)
🟡 Login flow — fixing (registration → login handoff)
🔴 Enrichment fields — need pipeline re-run (only 5/221 seeds enriched)
