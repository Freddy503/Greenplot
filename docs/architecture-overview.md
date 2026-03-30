# MVP Architecture Overview

## Components

- **React PWA** (Vite + Tailwind) — Frontend chat UI, voice/file attachments, dark Seedify theme
- **FastAPI** (OpenClaw API) — Chat endpoint, Weaviate sync, Notion logging, cron jobs
- **OpenRouter LLM** — Model provider with tool support (Exa, Weaviate search)
- **Weaviate** — Vector store for Seeds and Link Tree entries
- **Exa** — Web search API
- **Postgres** — Structured data (Users, Thoughts, Seeds, Usage)
- **Calendar** (future) — Optional integration

## Key Flows

1. Chat message → frontend → FastAPI
2. FastAPI calls OpenRouter with tool definitions
3. LLM may emit tool calls; FastAPI executes them
4. Responses streamed back as NDJSON events: text_delta, tool_start, tool_result
5. Weaviate serves long-term memory via semantic search
6. Cron pipeline enriches new seeds and produces daily briefings

## Data Model

- `Seeds`: Idea Garden entries (vectorized)
- `LinkTree`: Curated learning resources (vectorized)
- `ChatHistory`: temporally ordered conversations
- `Thoughts`: user reflections
- `Usage`: token/API spend tracking