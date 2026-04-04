# MEMORY.md

## Working Preferences
- For digest-follow-up outreach workflows, use companies from the latest digest unless Freddy says otherwise.

## Integrations (Configured 2026-04-04)
- **Notion API**: `~/.config/notion/api_key` — `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`
- **Exa Web Search**: `~/.config/exa/api_key` — `9c091493-cae9-458e-91e6-018ede5b3b79`
- **GitHub**: Configured in `~/.git-credentials` — token `<GITHUB_TOKEN>`
- **VAPID**: Web Push keys at `/root/.openclaw/.vapid_private.pem`

## Project Status (2026-04-04)

**Backend (OpenClaw API):** Multi‑tenant FastAPI service with Weaviate integration, Redis background jobs. Running on Docker (localhost:8001). Web Push notifications now implemented with pywebpush + VAPID.

**Frontend (React PWA):** Next.js 16 on Vercel Pro, deployed to seedify-six.vercel.app + www.greenplot.ink. AI SDK useChat, shadcn/ui, dark mode. Push notifications enabled via service worker.

**Weaviate:** Running locally on port 8080; IdeaSeed class indexed; watchdog monitoring.

**Glue Layer (80% complete):**
- ✅ Chat tools (14 total: search_seeds, search_sources, create_seed, etc.)
- ✅ Source → Chat surfacing (keyword overlap matching)
- ✅ Garden intelligence with decay scoring (e^(-λt) formula)
- ✅ Daily briefing with missed connections (unlinked seeds with shared tags)
- ✅ Web Push notifications (true push, not just polling)
- ✅ Seed visit tracking (last_visited, visit_count)
- ✅ Activity feed (Redis sorted set)
- ✅ Cache layer (Redis 5min TTL)
- 🟡 Knowledge graph interaction (click opens detail, but no actions)
- ❌ "New sources" UI badge (not yet implemented)

**Seedify Project:** Workspace IS the Freddy503/Seedify repo. Commits go directly there.

**Admin:** 17 OpenClaw cron jobs active (daily briefing, idea spark, voice memos, harvest, backup, etc.)

## Next Actions
- Test PWA push notifications end-to-end (Freddy needs to enable in Settings)
- Run enrichment pipeline to populate Weaviate fields
- Implement "New sources" UI badge
- Knowledge graph click → actions (merge, review sources, create task)
- Figma MCP setup
- Cloudflare tunnel fix

## Notes
Freddy prefers approval‑first for sensitive external actions, values cost‑effectiveness and security, and wants a personal 24/7 assistant that supports creative thinking. Tone: friendly, professional, witty (Woody from Toy Story vibe). Hard boundary: never access other chats or contact people without explicit consent.
