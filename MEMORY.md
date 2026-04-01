# MEMORY.md

## Working Preferences
- For digest-follow-up outreach workflows, use companies from the latest digest unless Freddy says otherwise.

## Project Status (2026-03-29)

**Backend (OpenClaw API):** Multi‑tenant FastAPI service with Weaviate integration, Redis background jobs, and Notion logging. Cron infrastructure runs enrichment, briefings, and prompts.

**Idea Garden RAG:** Full pipeline from Parking Lot → Exa/Weaviate enrichment → Nemotron synthesis → Idea Garden seeds with BFL concept maps. Event‑driven via heartbeat.

**Frontend MVP (React PWA):** Migrated to AI SDK `useChat` + `DefaultChatTransport`. Route.ts translates backend JSON-lines events → UIMessageStream protocol (text, tools, sources). Same dark Seedify UI. Auto-deploys via Vercel on push.

**Weaviate:** Running locally on port 8080; IdeaSeed class indexed; watchdog monitoring.

**Admin:** OpenRouter free models configured for nightly cron; no Anthropic billing.

## Next Actions
- Fix Vercel deploy (Cloudflare tunnel URL instability — plan to use env var or named tunnel).
- Implement rating persistence.
- Set up Figma MCP.
- Weaviate dedup cleanup (old duplicate chunks from original sync).
- Mobile testing (iOS Safari — voice recording + streaming).
- Seed Garden UI (browse seeds, concept maps, ratings on frontend).

## Notes
Freddy prefers approval‑first for sensitive external actions, values cost‑effectiveness and security, and wants a personal 24/7 assistant that supports creative thinking. Tone: friendly, professional, witty (Woody from Toy Story vibe). Hard boundary: never access other chats or contact people without explicit consent.

