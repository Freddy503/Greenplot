# Second Brain Project

A personal AI creativity system with a React PWA frontend and a FastAPI backend, powered by Weaviate for semantic memory and Notion for structured data.

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   React PWA     │────▶│   OpenClaw API      │────▶│  Weaviate    │
│  (Vercel AI)    │     │  (FastAPI)          │     │  Vector DB   │
└─────────────────┘     └─────────────────────┘     └──────────────┘
        │                         │                          │
        │                         │                          │
        ▼                         ▼                          ▼
   Local browser             Postgres, Redis          Semantic search
   (voice, file, TTS)        (multi-tenancy, jobs)   (RAG, connections)
```

### Key Components

- **PWA** (`/pwa`): Chat interface inspired by Seedify designs. Vercel AI SDK integration for streaming, tool status display, voice recording, file attachments, TTS, and rating.
- **OpenClaw API** (`/openclaw-api`): Multi-tenant backend. Endpoints for chat, seeds, usage metering. Workers process background jobs via Redis.
- **Idea Garden RAG** (`/skills/idea-garden-rag`): Enrichment pipeline. Parking Lot → Exa search + Weaviate queries + Nemotron synthesis → Idea Garden seeds. BFL generates concept maps.
- **Weaviate**: Local Docker instance on port 8080, class `IdeaSeed`.
- **Notion**: Databases for Receptive-State Journal, Parking Lot, Idea Garden. Cron jobs log outputs.

## Running

### Backend

```bash
cd openclaw-api
docker-compose up -d
docker-compose exec api alembic upgrade head
docker-compose exec api python -m app.cli create-admin --email admin@example.com
```

### Frontend

```bash
cd pwa
npm install
npm run dev
```

Open http://localhost:5173

### Watchdogs

- Weaviate health: `python3 weaviate_watchdog.py` (cron every 5 min)

## Seeds & Enrichment

The system runs every 30 minutes:
1. Detects new raw Parking Lot entries
2. Enriches with web search (Exa) + Weaviate semantic connections
3. Generates a seed in Idea Garden with BFL concept map
4. Telegram notification with link

## Decisions

See `MEMORY.md` and daily `memory/` logs.
