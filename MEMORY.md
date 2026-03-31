# MEMORY.md

## Working Preferences
- For digest-follow-up outreach workflows, use companies from the latest digest unless Freddy says otherwise.

## Project Status (2026-03-29)

**Backend (OpenClaw API):** Multi‑tenant FastAPI service with Weaviate integration, Redis background jobs, and Notion logging. Cron infrastructure runs enrichment, briefings, and prompts.

**Idea Garden RAG:** Full pipeline from Parking Lot → Exa/Weaviate enrichment → Nemotron synthesis → Idea Garden seeds with BFL concept maps. Event‑driven via heartbeat.

**Frontend MVP (React PWA):** Built and compiled. Features: chat with streaming, voice recording (MediaRecorder), file attachments, dark Seedify‑style theme, progress indicator (Step 1/7), custom message bubbles with tool status. Awaiting GitHub push and remote URL.

**Weaviate:** Running locally on port 8080; IdeaSeed class indexed; watchdog monitoring.

**Admin:** OpenRouter free models configured for nightly cron; no Anthropic billing.

## Next Actions
- Push Git (need remote URL from Freddy).
- Complete Weaviate re-embedding via enrichment pipeline (enrichment/ directory).
- Migrate to proper AI SDK + useChat with custom transport.
- Fix Vercel deploy (Cloudflare tunnel URL instability — plan to use env var or named tunnel).
- Set up Figma MCP this evening.
- Implement rating persistence.
- Wire OPENROUTER_API_KEY into enrichment pipeline environment.

## Notes
Freddy prefers approval‑first for sensitive external actions, values cost‑effectiveness and security, and wants a personal 24/7 assistant that supports creative thinking. Tone: friendly, professional, witty (Woody from Toy Story vibe). Hard boundary: never access other chats or contact people without explicit consent.

