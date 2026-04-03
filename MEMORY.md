# MEMORY.md

## Working Preferences
- For digest-follow-up outreach workflows, use companies from the latest digest unless Freddy says otherwise.

## Project Status (2026-04-01)

**Backend (OpenClaw API):** Multi‑tenant FastAPI service with Weaviate integration, Redis background jobs, and Notion logging. Running on Docker (localhost:8001). Cloudflare tunnel down — DNS resolves to WARP private address, needs dashboard fix.

**Idea Garden RAG:** Full pipeline from Parking Lot → Exa/Weaviate enrichment → Nemotron synthesis → Idea Garden seeds with BFL concept maps. 100 seeds in Weaviate. Enrichment fields (domain, tags, energy) empty — pipeline reported success but data not saved to Weaviate fields.

**Frontend (React PWA):** Migrated to AI SDK `useChat` + `DefaultChatTransport`. AI Elements: Conversation, Message, Tool, Sources, PromptInput, Shimmer. Seed Garden page (`/garden`) with grid/list views, filters, star ratings. Tab navigation between Chat and Garden. Auto-deploys via Vercel on push.

**Weaviate:** Running locally on port 8080; IdeaSeed class indexed; watchdog monitoring (clean today).

**Admin:** OpenRouter free models configured for nightly cron; no Anthropic billing. 13+ cron jobs active.

## Next Actions
- Fix Cloudflare tunnel (10 PM UTC tonight — Freddy + dashboard config).
- Re-run enrichment pipeline to populate Weaviate fields (domain, tags, energy, etc.).
- Rating persistence backend endpoint (`/api/v1/seeds/{id}/rate`) — verify exists on backend.
- Figma MCP setup.
- Mobile PWA testing (iOS Safari).
- Weaviate dedup cleanup (old duplicate chunks from original sync).

## Notes
Freddy prefers approval‑first for sensitive external actions, values cost‑effectiveness and security, and wants a personal 24/7 assistant that supports creative thinking. Tone: friendly, professional, witty (Woody from Toy Story vibe). Hard boundary: never access other chats or contact people without explicit consent.


## Project State (2026-04-02 EOD)
**Frontend:** Next.js 16 on Vercel Pro, deployed to seedify-six.vercel.app + www.greenplot.ink
**Backend:** FastAPI Docker, Weaviate 1.36.6 on port 8080, PostgreSQL, Redis
**Account:** contact@example.com / <password> (FreddyK), tenant 87959b2e
**Seeds:** 221 in Weaviate with Freddy's tenant_id, vectors, enrichment data
**Design:** Stitch MCP design system, shadcn/ui, dark mode (#69f6b8 primary, #01120b bg)
**Working:** Login, chat, garden, seed creation, seed detail, knowledge graph, PWA notifications
**Broken:** Voice transcription (CORS fixed but Freddy hasn't confirmed working), cloudflare tunnel
**Pending:** Enrichment pipeline re-run (5/221 enriched), Obsidian wikilinks, Figma MCP
