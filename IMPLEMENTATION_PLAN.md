# Implementation Plan: AI Second Brain PWA MVP

_Last updated: 2026-03-30 by Claude (OpenClaw assistant)_

## 1. Executive Summary

This plan integrates practical insights from industry blueprints into our current development trajectory. It prioritizes mobile reliability, cost-efficient AI workflows, deterministic automation, and scalable knowledge retrieval.

**Core architecture:** React PWA + FastAPI backend + Weaviate (vector) + PostgreSQL (relational) + OpenRouter (LLM gateway).

## 2. Current Project Status (as of 2026-03-29)

- Backend: Multi-tenant FastAPI with Weaviate, Redis jobs, Notion logging
- Idea Garden RAG: End-to-end pipeline (Seed → Enrich → Plant) with Exa/Weaviate + Nemotron
- Frontend MVP: React PWA compiled; chat streaming, voice recording, attachments, dark theme, progress indicator
- Weaviate: Running locally (port 8080); IdeaSeed class defined; watchdog active
- Admin: OpenRouter free models; no Anthropic billing

**Blockers (Sprint 0 - mostly resolved):**
- ✅ Remote Git URL configured (`https://github.com/Freddy503/Seedify`)
- ✅ Backend CORS configured for PWA origin (configurable via `CORS_ORIGINS` env)
- ✅ Attachment handling implemented (base64 → multimodal OpenRouter format)
- Rating persistence not implemented
- PWA hosting not deployed (e.g., Vercel)

## 3. High-Priority Implementation Workstreams

### 3.1 Mobile PWA Reliability (iOS/Android)

**Problem:** iOS restricts background sync and suspends JS when app is backgrounded.

**Solutions:**
- Voice capture: Use `navigator.wakeLock.request('screen')` to keep display on during recording.
- Offline queue: Store captures in IndexedDB; flush on `online` event or app resume.
- Background processing: Accept that sync only occurs in foreground; design UX accordingly.
- Cache strategy: Warn users that 7-day cache purge may occur; implement cache-first with network fallback.

**Implementation tasks:**
- Add Wake Lock to voice recording UI
- Build IndexedDB queue for pending uploads (text + voice)
- Hook into `window.addEventListener('online', flushQueue)` and `visibilitychange`
- Test on iOS Safari (background recording must keep app foregrounded)

### 3.2 Client-Side Preprocessing (Edge AI)

**Goal:** Reduce bandwidth and cloud costs by processing audio/text locally before upload.

**Approach:**
- Transcribe audio in-browser using `@xenova/transformers` with `xenova/whisper-tiny.en` (6.3x faster than Cloud Whisper, 1% WER delta).
- Generate embeddings locally using `gte-small` (384d, 512 tokens, ~30ms with WebGPU).
- Upload only plain text + optional embedding vector (backend may re-embed for consistency).

**Tasks:**
- Install `@xenova/transformers` in PWA
- Implement `transcribeAudioBlob(blob): string` using Whisper tiny
- Implement `computeEmbedding(text): number[]` using gte-small
- Update upload API: accept optional `embedding` field; backend uses if provided or recomputes
- Add toggle: "Process locally (privacy mode)" in settings

**Fallback:** If WebGPU unavailable or model download fails, revert to server-side processing.

### 3.3 Enrichment Pipeline (Backend)

When a new seed (raw note) arrives:

1. **Chunking** (if length > model context)
   - Use paragraph-aware semantic chunker (respect headings, line breaks).
   - Avoid fixed-size splits that cut sentences in half.

2. **Embedding generation**
   - If client provided embedding, validate dimension (384); else generate using gte-small (or OpenAI `text-embedding-3-small`).

3. **Entity extraction & tagging**
   - Prompt: KERNEL style with XML delimiters.
   - Output: `{ "summary": "2 sentences", "tags": ["tag1","tag2","tag3"], "entities": [...] }`.
   - Model: cost-effective reasoning model (e.g., `claude-3.5-haiku`, `gpt-4o-mini`).

4. **Autonomous backlinking**
   - Vector search in Weaviate for top-k similar seeds (k=5).
   - LLM evaluates which links are contextually relevant.
   - Inject Markdown links into the new seed's `content` body bi-directionally.
   - Store link relationships in Postgres `seed_links` table for graph traversal.

5. **Storage**
   - Save seed to Postgres (`seeds` table) with metadata.
   - Index content chunks in Weaviate (`IdeaSeed` class) with hybrid properties (content, tags, entities).

**Implementation notes:**
- Use fast, streaming LLM calls to keep pipeline latency <2s for short notes.
- Cache intermediate results (embedding, tags) to avoid reprocessing.
- Add retry logic and dead-letter queue for failures.

### 3.4 Hybrid Retrieval: Vector + GraphRAG

- **Vector search**: BM25 + cosine hybrid in Weaviate (already supported).
- **Graph layer**: Maintain `seed_links` (direct) and `entities` table with relations (subject/predicate/object).
- **Query flow**:
  1. Parse user query: extract entities via small model.
  2. Vector search to get top-n seed chunks.
  3. Graph traversal from entities to expand context (1-2 hops).
  4. Fuse and rank results.
  5. Pass to LLM for synthesis with citations.

**Tasks:**
- Define `entities` and `seed_links` schema in Postgres.
- Implement enrichment step to populate these tables.
- Build retrieval service that does hybrid fetch.

### 3.5 Daily Briefing (Map-Reduce)

Trigger: cron (local start of workday).

Steps:
1. Fetch calendar events via Aurinko API (universal calendar).
2. Fetch "open loops" (unresolved seeds/tasks from past 72h).
3. For each event:
   - Vector search for related past notes (specific attendees, topics).
   - Use a fast model (Haiku/Mini) to produce an atomic summary: { "event_id": "...", "summary": "...", "action_items": [...], "related_seeds": [...] }.
   - Run these in parallel (async workers).
4. Concatenate summaries + open loops + today's priorities.
5. Use a larger reasoning model (Claude Sonnet or GPT-4o) to synthesize final formatted briefing.
6. Send via Telegram bot and store in app.

**Cost optimization:**
- Restrict context per mapping step to just relevant snippets.
- Cache briefing components for repeat patterns (Helicone semantic cache).
- Use token budgets per section.

### 3.6 Observability & Cost Controls

- Deploy LLM gateway: Helicone or Portkey.
  - Route all OpenRouter calls through gateway.
  - Enable semantic caching to reduce repeat calls.
  - Monitor per-user token consumption.
- Add usage metering in Postgres: `api_calls` table with user_id, model, tokens, cost.
- Set up alerts for cost spikes (e.g., > $10/day).

### 3.7 Infrastructure Hardening

- Keep orchestrator on low-cost VPS (Hetzner CX33), GPU node optional for sensitive data.
- Use Redis for background job queue (already in place).
- Implement healthchecks for Weaviate, Postgres, Redis, and gateway.
- Add watchdog for Weaviate memory usage (already have `weaviate_watchdog.py`).
- Use Weaviate 384d vectors to limit memory footprint.

## 4. Near-Term Development Sprints

### Sprint 0: Foundation (1 week)
- [ ] Configure CORS for PWA origin (`localhost:5173`) in FastAPI
- [ ] Complete attachment handling: accept base64 uploads, store temp files, or embed in chat context
- [ ] Implement rating persistence in database
- [ ] Deploy PWA to Vercel (or similar) and get remote URL
- [ ] Push repository to remote Git

### Sprint 1: Structured Tool Calling & Streaming (1 week)
- [x] Backend: Switch from SSE text lines to NDJSON streaming for tool events
- [x] Define event types: `tool_call`, `tool_result`, `tool_error`, `status`, `done`
- [x] Frontend: Implement NDJSON parser; maintain tool call stack
- [x] Update chat UI to show incremental tool progress (expandable cards)
- [x] LLM tool calling loop (multi-round, up to 3 iterations)
- [x] Tool definitions: search_seeds, create_seed, get_daily_briefing, list_recent_seeds

### Sprint 2: Mobile Reliability & Client-Side AI (1 week)
- [ ] Add Wake Lock to voice recording
- [ ] Implement IndexedDB pending uploads queue
- [ ] Integrate Xenova Whisper tiny for local transcription
- [ ] Integrate gte-small for local embeddings (optional)
- [ ] Add setting for local vs server processing
- [ ] Test on iOS Safari (light/dark modes, background behavior)

### Sprint 3: Enrichment Pipeline (1 week)
- [ ] Implement paragraph-aware semantic chunking
- [ ] Design KERNEL-style prompts for entity extraction/tagging
- [ ] Implement autonomous backlinking (vector search + LLM relevance)
- [ ] Store enriched seeds in Postgres + Weaviate
- [ ] Add background job queue for enrichment (Celery/Redis)

### Sprint 4: GraphRAG Hybrid Retrieval (1 week)
- [ ] Define `entities` and `seed_links` schema and migrations
- [ ] Update enrichment to populate graph tables
- [ ] Build retrieval service with vector + graph fusion
- [ ] Add query parser to extract entities from user input
- [ ] Test multi-hop queries (e.g., "How does X relate to Y?")

### Sprint 5: Daily Briefing (1 week)
- [ ] Integrate Aurinko Calendar API (or simpler alternative)
- [ ] Build briefing orchestrator (heartbeat cron -> gather data)
- [ ] Implement Map-Reduce flow (small model mappers, large reducer)
- [ ] Connect Telegram bot for delivery
- [ ] Add caching and cost monitoring

### Sprint 6: Polish & Observability (Ongoing)
- [ ] Deploy Helicone gateway; route all LLM calls
- [ ] Add usage metering
- [ ] Implement alerting for costs/errors
- [ ] Performance profiling and optimization
- [ ] Documentation and onboarding flow

## 5. Technology Choices (Reconfirmed)

- **Frontend:** React + TypeScript, Vite, PWA manifest, MediaRecorder, IndexedDB
- **Backend:** FastAPI, Redis (background jobs), PostgreSQL, Weaviate
- **LLM:** OpenRouter with haiku/sonnet/gpt-4o-mini routing; local GPU fallback optional
- **Gateway:** Helicone (or Portkey) for observability & caching
- **Calendar:** Aurinko (universal) to reduce OAuth complexity
- **Billing (future):** Lago or Flexprice for usage metering; Stripe for payments

## 6. Cost Management Rules

- Use 384d embeddings; avoid large models (1536d) to keep RAM low.
- Prefer smaller LLMs (Haiku/Mini) for mapping and simple tasks.
- Enable semantic caching; monitor Helicone dashboards.
- Cap monthly LLM spend via OpenRouter budget alerts.
- Keep orchestrator on cheap VPS; GPU node only if needed for privacy/scale.

## 7. Prompt Engineering Standards (KERNEL)

- **Keep it simple:** Single objective per prompt.
- **Easy to verify:** Output JSON with clear schema.
- **Reproducible:** Deterministic temperature (0.0 for structured tasks).
- **Narrow scope:** Precise task boundaries.
- **Explicit constraints:** List required fields, max items, formatting rules.
- **Logical structure:** Use XML delimiters `<SystemRole>`, `<ExecutionTask>`, `<RigidConstraints>`, `<RetrievedHistoricalContext>`, `<UserInput>`.

Example template provided in section 9.

## 8. Monitoring & Healthchecks

- Weaviate: memory %, query latency, index health (existing watchdog)
- Backend: request latency, error rates, background job queue length
- Costs: hourly spend, per-user consumption
- Uptime: uptimeRobot or similar for PWA and API

## 9. Appendix: Prompt Template for Enrichment

```xml
<SystemRole>You are an expert ontological architect and knowledge synthesizer.</SystemRole>
<ExecutionTask>Analyze the user input. Extract explicit entities, summarize the core concept in precisely two sentences, and identify conceptual linkages to the provided historical context.</ExecutionTask>
<RigidConstraints>
- Output must be perfectly formatted JSON matching the system schema.
- Do not output markdown code blocks containing the JSON.
- Extract exactly three primary categorical tags.
</RigidConstraints>
<RetrievedHistoricalContext>

</RetrievedHistoricalContext>
<UserInput>

</UserInput>
```

Schema:
```json
{
  "summary": "string",
  "tags": ["string", "string", "string"],
  "entities": [
    { "name": "string", "type": "person|project|concept|location|organization", "relations": [] }
  ],
  "linked_seed_ids": ["uuid"]
}
```

## 10. Next Immediate Actions

- [ ] Save this plan to `/root/.openclaw/workspace/IMPLEMENTATION_PLAN.md`
- [ ] Review with Freddy for approval/adjustments
- [ ] Begin Sprint 0 tasks
- [ ] Set up cron for daily heartbeat checks and watchdog

---

**Sync with Weaviate:** This plan is also stored as a seed in Weaviate for searchability and version history. A copy can be ingested via the admin pipeline or manually added to the `IdeaSeed` class.
