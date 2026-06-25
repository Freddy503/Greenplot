# Greenplot — Your Living Laboratory

> Product and public repository: **Greenplot** ([greenplot.ink](https://www.greenplot.ink)) · Internal lineage: **Seedify**

Greenplot is an AI-powered second brain that closes the loop from *thought* to *shipped*. Capture ideas through chat, voice, notes, **PDFs, or any link** — they're enriched, connected, and indexed into your **Garden**. A **thinking partner** chat (Brainstorm · Pressure-test · Devil's advocate · Spec · **Deep Research**) reasons from what you already know — grounded, with **citations** back to your own seeds. Long-running **Deep Research agents** fan out across your garden + arXiv, OpenAlex, Hacker News, GitHub, RSS and Exa, **read the best sources in full** through a 1M-context model, and email you a **cited brief with the relevant papers attached** — fired automatically the moment you finish onboarding, so your garden is alive on day one. The **Workflows** page turns the garden into an operating system: Research Inbox triage, relationship suggestions, wiki drafting, project spaces, insight timelines, and a Seed → Brief → Spec → Shipped pipeline. The **Studio** turns threads (or a research gap) into structured **PRDs** you can hand to a coding agent and track from Design → Doing → Built. A daily **Research Digest** connects fresh multi-source research to your Garden and can auto-draft PRDs. And the whole garden — including the **full machine-readable text** of every paper — is available to **Claude Code / Cursor / Claude Desktop via an MCP server**.

> **Vision:** Greenplot explores how personal knowledge, research, product thinking, and build work can become one living context graph. Inspired by Karpathy's LLM Wikis, Foundation Capital's decision lineage, and OriginTrail DKG.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Next.js PWA (Vercel)                             │
│  Chat · Garden · Workflows · Sources · Wiki · Onboarding · Push       │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Chat v2  │  │  Garden   │  │Workflows│  │ Wiki     │  │ API    │  │
│  │ + Tools  │  │ + Intel   │  │ + Inbox │  │ + Maps   │  │ Routes │  │
│  │ + Source │  │ + Decay   │  │          │  │ + Images │  │ (30+)  │  │
│  │ Surfacing│  │ + Revisit │  │          │  │ TOC      │  │        │  │
│  │ + History│  │ + Viz Tool│  │ + Spaces│  │ Compile  │  │        │  │
│  └──────────┘  └───────────┘  └──────────┘  └──────────┘  └────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Service Worker (sw.js) ← Web Push ← VAPID                      │  │
│  │  Activity Summary ("What's New") — shown on every login          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │ Authorization: Bearer JWT
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (Docker, port 8001)                   │
│  JWT Auth · Tool Calling · Session Mgmt · Activity Feed · Wiki          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐       │
│  │  Chat v1/v2  │  │  Enricher v2 │  │  Tool Executor (15)    │       │
│  │  (streaming) │  │  URL detect  │  │  search_seeds          │       │
│  │  + source    │  │  + Exa fetch │  │  search_sources        │       │
│  │    surfacing │  │  + domain/   │  │  create_seed           │       │
│  │  + sessions  │  │  energy infer│  │  read_source            │       │
│  └──────────────┘  └──────┬───────┘  │  web_search            │       │
│                            │        │  get_daily_briefing    │       │
│  ┌──────────────┐         │        │  get_garden_intel      │       │
│  │  Wiki Engine │◄────────┘        │  get_knowledge_digest  │       │
│  │  Auto-compile│                 │  get_activity_feed     │       │
│  │  + Re-synth  │  ┌──────────┐  │  rate_seed             │       │
│  └──────┬───────┘  │ Briefings│  │  get_seed_detail       │       │
│         │          │ + Email  │  │  search_seeds_filtered │       │
│         ▼          │ (Resend) │  │  visualize_garden      │       │
│  ┌──────────────┐  └──────────┘  └────────────────────────┘       │
│  │  Redis Queue │                                                 │
│  │  (pub/sub)   │                                                 │
│  └──────┬───────┘                                                 │
│         │                                                          │
│         ▼                                                          │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │ Enrichment Worker│  │ Redis Cache  │  │  Web Push (VAPID)│     │
│  │ (separate proc)  │  │ (seed lookup)│  │  pywebpush        │     │
│  └──────────────────┘  └──────────────┘  └──────────────────┘     │
└──────┬───────────────┬──────────────────┬──────────────────────────┘
       │               │                  │
       ▼               ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│  PostgreSQL  │ │   Weaviate   │ │      Redis       │
│  (port 5432) │ │  (port 8080) │ │    (port 6379)   │
│              │ │              │ │                  │
│  users       │ │  IdeaSeed    │ │  enrichment queue│
│  seeds*      │ │  Link        │ │  activity feed   │
│  ratings     │ │  WikiArticle │ │  cache layer     │
│  sessions    │ │  230+ items  │ │  task status     │
│  push_subs   │ │  BM25 + vec  │ │  push notifs     │
└──────────────┘ └──────────────┘ └──────────────────┘

* seeds table includes: last_visited, visit_count (for decay scoring)
```




## Core Concepts

### Seed → Outcome Pipeline

Greenplot is not only a memory store; it is a workflow system for moving ideas toward artifacts:

```
Seed ──→ Research Brief ──→ Spec / PRD ──→ Build Task ──→ Shipped
  │             │                 │              │             │
  │             │                 │              │             └── learning folded back into Wiki
  │             │                 │              └── PR / implementation progress
  │             │                 └── Studio artifact + coding-agent handoff
  │             └── cited evidence from Garden + web + papers
  └── raw idea, note, link, paper, or voice capture
```

The Workflows page makes that path explicit and adds operational surfaces for review: Research Inbox, relationship suggestions, wiki candidates, product/project spaces, and an insight timeline.

### Sources → Seeds → Wiki (The Full Pipeline)

The pipeline flows in one direction, with each stage adding value:

```
Sources (collect) ──→ Seeds (develop) ──→ Wiki (synthesize)
       │                    │                    │
       │  Enriched with     │  Connected, rated, │  Wikipedia-style
       │  title, summary,   │  decay-scored,     │  articles with
       │  entities, tags    │  visit-tracked     │  citations + maps
       │                    │                    │
       └──── Auto-bridge ───┴──── Auto-compile ──┘
       (Sources → Seeds      (Seeds/Links → Wiki)
        when no related
        seeds exist)
```

### Seeds vs Sources

Two distinct entities with a clear bridge:

| | **Sources (Links)** | **Seeds (Garden)** |
|---|---|---|
| **What** | External URLs, references, articles | Personal ideas, insights, thoughts |
| **Flow** | Inbound (collect & browse) | Outbound (develop & connect) |
| **Value** | "Is this reference useful?" | "Is this idea worth pursuing?" |
| **Lifecycle** | Enriched once (metadata) | Full pipeline (enrich, connect, rate, decay) |
| **Bridge** | → "Create Seed from Source" | ← Shows source origins |

### Decay Scoring

Seeds lose relevance over time. The Garden Intelligence uses a decay formula:

```
relevance = e^(-0.05 × age_days) × (1 + visit_count × 0.5)
```

- **14-day half-life** — seeds naturally decay
- **Visits boost** — viewed seeds stay relevant longer
- **"Needs revisiting"** — seeds not viewed in 30+ days
- **"Stale"** — low relevance + unrated + 7+ days old

## Features

### 💬 Chat — thinking partner
The chat is the primary interface to the entire knowledge base. It runs as a tool-calling agent grounded in your Garden, with **corrective retrieval** (it judges each result's relevance and re-queries before answering) and **citations** — the "Grounded in your garden" chip expands to the exact seeds that shaped the answer, each linking back.

**Thinking-partner modes** (chips above the composer): **Brainstorm**, **Pressure-test**, **Devil's advocate**, **Spec it** (→ writes a full PRD to the Studio), and **Deep Research** (multi-step Garden + web investigation → a cited Research Brief).

**Capture from anywhere — in the composer:** the **"+"** button adds a **PDF** or any **link** (article, paper, or **YouTube**) straight to your Garden; drop a PDF onto the input, or paste a URL and hit *Add to garden*. Each is fetched, chunked, indexed, and given an executive summary connected to your existing seeds.

Core tools:

| Tool | Description |
|------|------------|
| `search_seeds` | Semantic search over Garden seeds |
| `search_sources` | Search saved source links |
| `create_seed` | Create a new idea seed |
| `create_seed_from_source` | Bridge: create seed from a source |
| `read_source` | Fetch and read full source content |
| `web_search` | Search web (auto-saves to Sources) |
| `get_daily_briefing` | Actionable morning digest (includes missed connections) |
| `get_garden_intelligence` | Trending, stale, decay, revisit suggestions |
| `get_seed_detail` | Full seed with enrichment + auto visit tracking |
| `get_knowledge_digest` | Recent seeds + sources + connections |
| `get_activity_feed` | What the system has been doing |
| `rate_seed` | Rate seeds 1-5 stars |
| `list_recent_seeds` | Browse recent seeds |
| `search_seeds_filtered` | Search by domain/tag/energy |
| `visualize_garden` | Interactive D3 force graph of all seeds by domain + tag |

**Source Surfacing:** When relevant, the chat automatically surfaces saved sources that match the conversation topic. The LLM sees: *"📎 Relevant sources: Forward-Deployed Engineer (sundeepteki.org)"* and can reference them.

**Persistent Chat History:** Conversations are saved as `ChatSession` records in Postgres. The frontend stores session IDs in `localStorage` and restores full history on revisit.

**Missed Connections:** The daily briefing finds unlinked seed pairs with shared tags:
```
🔍 Connections you missed:
  • "AI Agents" ↔ "MCP Protocol" (shared: architecture)
```

### 🎨 Studio — think → spec → ship
The Studio turns thinking into shippable specs:
- **Thinking partner modes** drive a thread, then **Spec it** synthesizes a complete **PRD** (gstack structure) saved to the Studio.
- **Build pipeline:** drag PRDs across **Design → Doing → Built**; connected coding agents (via the MCP server / GitHub sync) report progress and PRs back.
- **Product view:** one screen anchoring every PRD to the problem it serves, with an auto-refreshed **Design Vision** when canvas PRDs change.
- **Drop a PDF** onto the canvas to ingest it; **PRD comments**; and **Canvas sharing** — invite collaborators by email (view-only in v1) with a cross-tenant access gate (`resolve_canvas_access`).

### 🧭 Workflows — turn garden material into outcomes
The Workflows page is the command center for moving raw material toward concrete decisions:

- **Seed To Outcome Pipeline:** every seed is placed on a path from Seed → Research Brief → Spec/PRD → Build Task → Shipped, with next actions and history.
- **Research Inbox:** pending thoughts, links, cached sources, and papers land in one review queue before entering the garden. Each item shows classification, suggested tags, duplicate signals, likely connections, and decision buttons: Keep, Connect, Seed, Wiki, Project, Discard.
- **Relationship Suggestions:** AI-assisted "these belong together" recommendations across seeds, links, papers, wiki articles, and products, with actionable verbs like merge, link, cite, expand, archive.
- **Wiki From Garden:** pick a topic, assemble supporting seeds/links, preview a cited article draft, then approve it into the wiki.
- **Product/Project Spaces:** product seeds gather related specs, build work, shipped artifacts, and orphan PRDs into context-specific spaces without losing global search.
- **Insight Timeline:** chronological signals for meaningful garden movement: research runs, shipped work, wiki candidates, connections, and rising topics.

Review decisions are persisted through the existing `UserEvent` ledger, so the inbox can hide resolved items without adding a migration. Source data stays intact unless the action has a safe, explicit model change, such as marking a thought processed or archiving a discarded paper seed.

### 🔭 Deep Research agents (long-running, multi-source, durable)
A background research system that connects the dots across your garden and the live literature, then hands you a cited brief — spec: [`docs/specs/deep-research-agents.md`](openclaw-api/docs/specs/deep-research-agents.md).

- **Fan-out scouts** across 7 sources — **your garden · Exa web · arXiv · OpenAlex (journals incl. Nature/Science) · GitHub · Hacker News · RSS (Nature feeds, lab blogs)** — each finding persisted (durable + resumable).
- **Reads sources in full:** the top findings are pulled as full machine-readable text (Exa `/contents`, arXiv/journal HTML, GitHub READMEs) and reasoned over together by a **1M-context model** (`DEEP_RESEARCH_MODEL`, default `minimax/minimax-m3`) — a two-pass *decompose → synthesize* flow with a **critique-and-revise** edit.
- **Output:** a structured, inline-cited (`[S#]`) **Research Brief** seed (renders like the email), with the **most relevant papers embedded** (saved as connected garden seeds) and **emailed with their PDFs attached** + a push notification.
- **Trigger it anywhere:** a "Go deep" launcher in the Garden (Deep / Lite mode), a follow-up **"Go deeper on this gap"** from any brief, a **"Draft a PRD from this gap"** button that closes the research→build loop, an autonomous **weekly run** (opt-in), and the **onboarding kick-off** (see below).
- **Live agent feed:** a real-time view of the agents lighting up across sources with per-source counts → synthesis shimmer → the brief card — the onboarding "wow".
- **Harness:** Phase 1 runs on the Redis worker; Phase 2 is **self-hosted Temporal** (`docker-compose.temporal.yml`, EU-resident) with parallel per-scout durable activities — flip `RESEARCH_ENGINE=temporal`. Cost-guarded by `RESEARCH_DAILY_CAP`.

### 🚀 Onboarding cold-start
Finishing onboarding (interests + a free-text **"what's on your mind?"** focus) fires **one Deep Research run automatically** — so a brand-new user lands with a garden already filling with relevant-paper seeds and a brief in their inbox, instead of a blank slate. The done screen shows the agents working **live**.

### 🔬 Research Digest & Paper Pipeline
- **Daily Research Digest** (07:00 & 18:00 CET): fresh research matched to your Garden + Wiki → TL;DR, per-paper synthesis, a challenging take, an actionable move, and a solution-design seed. English-enforced, with a garden-tailored summary.
- **Multi-source discovery** ([`docs/specs/research-sources.md`](openclaw-api/docs/specs/research-sources.md)): beyond arXiv, the digest pulls **OpenAlex** (published research incl. journals), **Hacker News** (industry pulse), **GitHub** (what's being built) and curated **RSS** feeds — all keyless candidate generators feeding the same pipeline.
- **Full-text paper pipeline:** papers (and your uploaded PDFs / links) are fetched → section-aware chunked → embedded into a `PaperChunk` index → reasoning-friendly doc tree (tree retrieval), and **compiled to whole machine-readable markdown** so agents read them end-to-end. Specs cite what papers actually *say*, not just abstracts.
- **Autopilot PRDs:** a relevance-gated, daily-capped pass drafts a PRD from a strongly-relevant digest paper on its own — you shape the vision, the system drafts.

### 🔌 MCP Server (connect your garden to coding agents)
A built-in **MCP server** (`/mcp`, Streamable HTTP, per-user API keys — plus a stdio server) makes your Garden available to **Claude Code, Claude Desktop, and Cursor** — search seeds, **list & read research papers in full** (`list_papers`, `get_paper_fulltext`), search paper content, write specs, all from your editor. Mint a key in **Settings → Coding agents · MCP** and paste the config.

### 📖 Wiki (Wikipedia/GrokPedia-style)
Auto-generated articles that synthesize your sources and seeds into encyclopedic entries:

- **Structure:** Bold lead definition → Table of Contents → Overview → Key Insights → Applications → Connections → Critical Analysis → See Also → Sources
- **Citations:** Inline `[1]`, `[2]` references linking back to original sources
- **Analysis sections:** 💭 AI-generated observations and synthesis markers
- **"What to explore next"** — actionable suggestions at article end
- **BFL hero images** — generated concept art for each article
- **D3 concept maps** — force-directed connection visualizations
- **Auto-compile:** Groups enriched content by domain/tag, runs LLM synthesis
- **Seed-cluster compilation:** Compiles uncovered seeds even without link matches
- **Manual compile button:** UI button triggers `/api/v1/wiki/auto-compile` via user Bearer auth
- **Quality:** 1,300–1,800 word articles (vs. previous 200–300 word dumps)
- **Model:** deepseek/deepseek-v3.2 via OpenRouter

### 🔔 Push Notifications (Web Push)
True push notifications via VAPID + Service Worker:
- Works even when PWA is closed/backgrounded
- Cron jobs trigger pushes (daily briefing, idea spark, etc.)
- Subscribe via Settings → Push Notifications toggle
- Auto-removes expired subscriptions (404/410 only)
- Idempotent service worker registration with error detail

### 🌱 Garden
- Semantic search via Weaviate (BM25 + vector)
- Knowledge graph with seed connections (click to open detail)
- **Garden Intelligence API:** trending seeds, stale (decay), needs revisiting, health score
- **Interactive visualization:** `visualize_garden` tool renders inline D3 force graph via chat, grouped by domain + tag proximity
- Star ratings for seed quality
- Visit tracking: `last_visited`, `visit_count`
- URL detection in seeds: Exa full-page fetch for web-sourced thoughts; LLM-inferred `domain` and `energy` fields

### 📎 Sources
- Auto-enriched on add (title, summary, domain, favicon, OG image)
- Auto-connected to related seeds (tag/domain/title scoring)
- Auto-populated from web searches (both chat and enrichment pipeline)
- "Create Seed from Source" button (Sources → Garden bridge)
- Shows spawned seeds for each source
- Auto-bridge: Sources → Seeds created automatically when no related seeds exist

### 📬 Email Digests (Resend)
Personalized daily emails grounded in your Garden and Wiki:

| Digest | Time | Content |
|--------|------|---------|
| Enterprise Digest | 09:30 CET | Daily briefing — seeds to review, missed connections, sources |
| Academic + Research Digest | 07:00 CET | Top arXiv papers for your themes → connected to your Garden seeds and Wiki articles → actionable move + solution design seed. arXiv PDFs attached. |
| Weekly Content Eval | Sunday 18:00 CET | Rated seeds review, enrichment quality summary |

Requires `RESEND_API_KEY` in `.env`. Free tier (3,000 emails/month) covers all jobs.

### 📊 Activity Summary ("What's New")
Shown on every PWA login (empty state + with messages):
- Total seeds, sources, and articles at a glance
- Recent activity items with icons
- Dismissable per session (4-hour cooldown)
- Live stats bar

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
- **Push Notifications:** Queued for polling fallback

**Activity Feed:**
Tracks system events: seed creation, source discovery, enrichment completion, ratings. Available via API and chat tool.

### 🧠 Multi-Layer Memory (MLMA)
Based on [arxiv.org/abs/2603.29194](https://arxiv.org/abs/2603.29194):
- **Working Memory** — bounded dialogue window
- **Episodic Memory** — recursive session summaries with decay
- **Semantic Memory** — entity-event graphs with stability scores

### 🎙️ Voice Memos
Record → Whisper transcription → message → optional seed creation

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
- **Redis** (port 6379) — queue, cache, activity feed, push

### Frontend (Vercel)
```bash
npm install
npm run dev
```

### Environment Variables
```bash
# Backend (.env)
OPENROUTER_API_KEY=<OPENROUTER_API_KEY>
WEAVIATE_URL=http://weaviate:8080
REDIS_URL=redis://redis:6379/0
VAPID_PRIVATE_KEY_PATH=/app/.vapid_private.pem
RESEND_API_KEY=<RESEND_API_KEY>              # Email digests (optional — disables email if unset)
EMAIL_FROM=Greenplot <digest@greenplot.ink>   # Verified Resend sender (SPF/DKIM/DMARC)
EXA_API_KEY=...                    # Web search + full-page contents (Deep Research / digest)
GITHUB_TOKEN=<GITHUB_TOKEN>        # GitHub research source (higher rate limit; also Spec→Issue)
DEEP_RESEARCH_MODEL=minimax/minimax-m3   # ≥1M-context synthesis model (override as needed)
RESEARCH_DAILY_CAP=5               # Per-user deep-research runs/day (cost guard)
RESEARCH_ENGINE=worker             # 'worker' (Redis) | 'temporal' (self-hosted, Phase 2)

# Frontend (.env.local)
NEXT_PUBLIC_VAPID_KEY=<NEXT_PUBLIC_VAPID_KEY>
NEXT_PUBLIC_API_URL=https://api.greenplot.ink
```

## Project Structure
```
├── src/                        # Next.js frontend
│   ├── app/
│   │   ├── chat/               # Chat page with source surfacing + activity summary
│   │   ├── garden/             # Garden grid/list + intelligence + graph
│   │   ├── workflows/          # Seed→Outcome, Research Inbox, relationships, wiki, spaces
│   │   ├── links/              # Sources page + create seed bridge
│   │   ├── settings/           # Push notifications, calendar, profile
│   │   ├── wiki/               # Wiki browser + article view + concept maps
│   │   ├── onboarding/         # 8-step onboarding (interests + focus → fires a Deep Research run)
│   │   └── api/
│   │       ├── chat/           # AI streaming proxy (v1/v2)
│   │       ├── seeds/          # Seed CRUD + search + graph + garden intel
│   │       ├── research/inbox/ # Workflow inbox proxy + review actions
│   │       ├── outcomes/       # Seed→Outcome workflow proxy
│   │       ├── relationships/  # Relationship suggestion proxy
│   │       ├── spaces/         # Product/project spaces proxy
│   │       ├── insights/       # Insight timeline proxy
│   │       ├── links/          # Source CRUD + enrichment
│   │       ├── wiki/           # Wiki CRUD + auto-compile + image gen + concept maps
│   │       ├── push/           # Web Push subscribe/send/notifications
│   │       ├── profile/        # Profile update proxy (city, nickname)
│   │       └── activity/       # Activity summary for login screen
│   ├── components/
│   │   ├── ai-elements/        # AI SDK UI (Conversation, Message, Tool, Sources)
│   │   ├── activity-summary.tsx# "What's New" card for login
│   │   ├── links/              # Link detail sheet + seed bridge
│   │   ├── seeds/              # Seed detail + knowledge graph (D3)
│   │   └── ui/                 # shadcn/ui components
│   └── hooks/
│       ├── use-voice-recorder.ts
│       └── use-push-notifications.ts  # VAPID subscribe + poll (improved error handling)
├── openclaw-api/               # FastAPI backend
│   ├── app/
│   │   ├── main.py             # API routes (50+), Web Push, migrations, cron jobs
│   │   ├── weaviate_client.py  # Weaviate client (IdeaSeed + Link + WikiArticle)
│   │   ├── tool_executor.py    # 25+ LLM tool handlers + decay scoring + write_spec + visualize_garden
│   │   ├── tools.py            # Tool definitions (OpenAI format)
│   │   ├── enricher.py         # URL detection + Exa full-page fetch + LLM seed gen
│   │   ├── enricher_v2.py      # Seed enrichment pipeline (URL-aware)
│   │   ├── briefings.py        # Daily/academic digest builders + garden/wiki context
│   │   ├── email_sender.py     # Resend API email dispatch + arXiv PDF attachments
│   │   ├── entity_extractor.py # LLM topic/entity extraction
│   │   ├── backlinker.py       # Auto-link related seeds
│   │   ├── wiki.py             # Wiki engine (auto-compile, synthesis, images, maps)
│   │   ├── task_broker.py      # Redis queue (publish/consume)
│   │   ├── task_worker.py      # Standalone enrichment worker
│   │   ├── cache.py            # Redis cache layer
│   │   ├── activity.py         # Activity feed (Redis sorted set)
│   │   ├── links.py            # Source link CRUD + enrichment
│   │   ├── workflows.py        # Outcome pipeline, inbox, relationships, wiki, spaces, timeline
│   │   ├── database.py         # SQLAlchemy + PostgreSQL
│   │   ├── models.py           # Seed, User, ChatSession, etc.
│   │   ├── garden_health.py    # Decay scoring + health monitoring
│   │   ├── deep_research/       # Deep Research agents: orchestrator (scope→scout→synthesize),
│   │   │                        #   brief→PRD actions, self-hosted Temporal worker (Phase 2)
│   │   ├── sources/             # Research source generators (openalex, hackernews, rss, github)
│   │   └── agent/              # Chat agent architecture
│   ├── .vapid_private.pem      # VAPID private key for Web Push
│   └── docker-compose.yml      # Full stack orchestration
├── skills/idea-garden-rag/     # Notion pipeline
│   ├── enrich_and_plant.py     # Web search + Nemotron synthesis
│   ├── garden_orchestrator.py  # Pipeline entry point
│   ├── sync_and_fetch_weaviate.py  # Notion ↔ Weaviate sync
│   └── multi_layer_memory.py   # MLMA implementation
├── docs/                       # Specifications & docs
│   ├── wiki-prompts.md         # Wiki synthesis prompt engineering
│   └── wiki-structure-spec.md  # Article structure specification
└── memory/                     # Session logs
```

## Cron Jobs
Notifications are **artifacts, not prompts** — each delivers something you can read or act on, grounded in your Garden. Delivery is per-user and gated by the onboarding cadence (`digest_frequency`).

| Job | Schedule | Push | Email | Description |
|---|---|---|---|---|
| **Research Digest** | 07:00 & 18:00 CET | ✓ | ✓ + PDFs | Multi-source research (arXiv · OpenAlex · HN · GitHub · RSS) × your Garden + Wiki → TL;DR, synthesis, actionable move, solution-design seed (evening edition = twice-daily tier) |
| **Weekly Deep Research** | Monday 07:30 CET | ✓ | ✓ + PDFs | Opt-in (Settings): one autonomous Deep Research run on your top theme → a cited brief with relevant papers, in your inbox |
| **Today's Thread** | 08:30 CET | ✓ | — | One real seed from your Garden + a provocation + a concrete 10-min move (fires on once-daily too) |
| **Loose Threads** | 16:00 CET | ✓ | — | Your captured-but-undeveloped seeds, surfaced to tend (twice-daily tier) |
| **Garden Signals** | Every 3h | ✓ | — | Connection alerts on strong new SeedLinks + theme-emergence when a seed becomes a hub |
| **Garden Story** | Sunday 10:00 CET | ✓ | — | A narrated weekly recap: what grew, the strongest new connection, the emerging theme |
| Weekly Content Eval | Sunday 18:00 CET | ✓ | ✓ | Review rated seeds, enrichment quality |
| Biweekly Challenge | 1st & 15th 10:00 CET | ✓ | — | Cross-domain synthesis prompt |
| Coherence Report | Weekly | ✓ | — | Generates a Library article on contradictions/gaps across your Garden |
| Design Vision Refresh | Every 5 min | — | — | Debounced regen of a product's Design Vision after its PRDs change |
| Wiki Auto-Compile | Every 3h | — | — | Compile new seeds/links into wiki articles |
| Auto-seed Enrichment | Every 30 min | — | — | Enrich new seeds with tags, domain, energy, connections + backlinks |

> Killed/merged in the notifications redesign: **Daily Briefing** (merged into the Research Digest) and **Weekly Garden Digest** (replaced by Garden Story).

## Tech Stack
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, AI SDK v5, D3.js
- **Backend:** FastAPI, Python 3.12, SQLAlchemy, JWT + per-user API keys, pywebpush, APScheduler; **MCP** server (Streamable HTTP)
- **Database:** PostgreSQL 15, Weaviate 1.36 (BM25 + vector; `PaperChunk` full-text index), Redis 7
- **AI:** OpenRouter (tiered — chat `tencent/hy3-preview`, briefings/wiki `xiaomi/mimo-v2.5`, premium `mimo-v2.5-pro`, **deep research 1M-context `minimax/minimax-m3`**, fallback `minimax-m2.7`), OpenAI Whisper, image ingest, Exa Search
- **Research sources (keyless candidate generators):** arXiv, **OpenAlex**, **Hacker News** (Algolia), **GitHub** Search, **RSS** (`feedparser`), Exa — see [`docs/specs/research-sources.md`](openclaw-api/docs/specs/research-sources.md)
- **Background harness:** Redis worker (Phase 1) + optional **self-hosted Temporal** (Phase 2, EU-resident) for durable, long-running, parallel research agents
- **Ingestion:** `pymupdf` (PDF parse), `youtube-transcript-api`, Exa contents — upload a PDF or paste any link → chunk → index → garden-tailored summary
- **Email:** Resend API (transactional email + arXiv PDF attachments; SPF/DKIM/DMARC)
- **Push:** Web Push via VAPID (pywebpush + Service Worker), auto-prunes dead subscriptions on 404/410
- **Hosting:** Hetzner (Frankfurt, EU) via Cloudflare named tunnel; Docker Compose; Vercel (frontend)

## License

Greenplot is open source under the [MIT License](LICENSE).

This repository contains the application source code. Do not commit private
deployment secrets, user data, garden exports, generated memory/wiki content,
database dumps, or production backups. Use `.env.example` for placeholders and
keep real runtime configuration in your deployment environment.

## Design System
- **Colors:** Warm off-white `#fafaf8` background, green `#16a34a` primary, gold `#d97706` secondary, white cards with subtle borders
- **Font:** Plus Jakarta Sans (headings) + Be Vietnam Pro (body)
- **Corners:** rounded-2xl (1rem) for cards, rounded-full (9999px) for pills/badges
- **Shadows:** soft green glow on focus, subtle elevation on hover
- **Dark mode:** opt-in toggle via `.dark` class

## Status
🟢 **Working:** Chat thinking partner (modes, corrective retrieval, citations, persistent history), **Workflows** (Seed→Outcome pipeline, Research Inbox review queue, relationship suggestions, Wiki From Garden, product/project spaces, insight timeline), **Deep Research agents** (7-source fan-out, full-text reading, 1M-context synthesis, cited briefs with embedded + PDF-attached papers, Garden launcher + Deep/Lite modes + brief→PRD + go-deeper + weekly opt-in + onboarding kick-off + live agent feed), Capture from anywhere (PDF drop + link/YouTube ingest in chat & Studio), Studio (Spec → PRD → Build pipeline, Product view, Design Vision, PRD comments), Canvas sharing (view-only), Multi-source Research Digest + full-text paper pipeline + Autopilot PRDs, MCP server (per-user keys, full-text paper reads), Garden + Intelligence + Knowledge graph + Visualization, Notifications suite (Today's Thread, Loose Threads, Garden Signals, Garden Story), Wiki (auto-compile, D3 maps), Web Push (+ auto-prune), Email (Resend, DMARC), invite links, password reset, GitHub repo sync, Calendar, Voice memos
🟡 **Partial:** Canvas **editor** role (write access) — view-only shipped; **Deep Research Phase 2** (self-hosted Temporal) scaffolded + built behind `RESEARCH_ENGINE=temporal`, Phase 1 (Redis worker) is the default; YouTube without captions falls back to thin Exa text
