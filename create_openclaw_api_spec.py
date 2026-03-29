#!/usr/bin/env python3
import os, json, urllib.request

NOTION_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
OPENCLAW_PARENT_ID = '19231104-e27a-4ea3-888f-ae449d2076ae'

# Detailed content of the PWA project
content = """# OpenClaw API + PWA — Product Project Plan

**Date**: 2026-03-29  
**Status**: Planning → Development  
**Owner**: Freddy  
**Goal**: Build a multi-tenant SaaS version of the Second Brain MVP, delivered as a PWA, with a FastAPI backend and PostgreSQL + Weaviate storage.

---

## 1. Vision & Scope

### What We're Building
A web app (PWA) that gives users a personal AI Second Brain:
- Users can capture thoughts (text/voice) → automatically enriched into seeds with connections
- Daily morning spark and briefing
- Vector search over their knowledge base
- No Notion dependency (own database)
- Optional calendar integration (iOS PWA can access device calendar with permission)
- Subscription billing to cover LLM + infrastructure costs

### What It Is Not
- Not a replacement for Notion for general note-taking
- Not a consumer-scale competitor to Siri/Notion AI (niche product)
- Not a mobile-native app initially (PWA first, native later if needed)

---

## 2. Architecture

```
┌─────────────────┐
│   iOS Safari    │  ← PWA installed on home screen
└────────┬────────┘
         │ HTTPS (JWT auth)
┌────────▼────────┐
│  FastAPI Backend│  ──► PostgreSQL (users, thoughts, seeds, usage)
│  (OpenClaw)     │
└────────┬────────┘
         │
         ├─────────► Weaviate (vector search, multi-tenant)
         │
         ├─────────► OpenRouter (LLM: Nemotron Super)
         │
         ├─────────► NVIDIA NIM (embeddings)
         │
         └─────────► Black Forest Labs (images)
```

**Multi-tenancy**: Every data row/object has a `tenant_id` (UUID). All queries filter by it. One Weaviate class `AppSeed` holds all tenants' data.

---

## 3. Data Model (PostgreSQL)

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    tenant_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    stripe_customer_id TEXT,
    subscription_status TEXT
);

CREATE TABLE thoughts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    source TEXT,
    status TEXT DEFAULT 'pending',  -- pending, processing, processed, error
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE TABLE seeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    thought_id UUID REFERENCES thoughts(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding_ref TEXT,  -- Weaviate object ID
    image_url TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    date DATE NOT NULL,
    llm_tokens INT DEFAULT 0,
    embedding_tokens INT DEFAULT 0,
    images_generated INT DEFAULT 0,
    vector_operations INT DEFAULT 0,
    UNIQUE(tenant_id, date)
);
```

---

## 4. Weaviate Schema

Class: `AppSeed`

Properties:
- `tenant_id` (text) — required
- `user_id` (text) — internal
- `content` (text) — seed content
- `title` (text) — seed title
- `thought_id` (text) — link back to thought
- `created_at` (date)
- `metadata` (text, JSON string)

Vector: `embedding` (HNSW, 1024 dims, cosine)

**Index policy**: All queries *must* include `tenant_id` in `where` clause.

---

## 5. API Endpoints

### Authentication
- `POST /api/v1/register` — {email, password} → {api_key, tenant_id}
- `POST /api/v1/login` — {email, password} → {access_token, refresh_token}
- `POST /api/v1/refresh` — refresh JWT

All other endpoints require `Authorization: Bearer <token>`. The token payload includes `tenant_id`.

### Thoughts
- `POST /api/v1/thoughts` — Create a thought, returns `thought_id` and `status=pending`
- `GET /api/v1/thoughts?page=1&limit=20` — List user's thoughts

### Seeds
- `GET /api/v1/seeds?query=optional` — Vector search seeds for current user (if query omitted, recent seeds)
- `GET /api/v1/seeds/{id}` — Get seed details

### Daily Sparks & Briefing
- `POST /api/v1/spark` — Generate and return morning spark text (no storage)
- `POST /api/v1/briefing` — Generate daily briefing (text + image URL)

### Usage
- `GET /api/v1/usage/month` — Token usage for current month

### Admin (protected by admin token)
- `GET /api/v1/admin/health` — System health (Weaviate, Postgres, LLM API status)
- `GET /api/v1/admin/tenants` — List all tenants with usage

---

## 6. Enrichment Pipeline

When a thought is created:
1. Write to Postgres with `status=pending`
2. Enqueue job in Redis queue (background worker)
3. Worker:
   - Generate embedding via NVIDIA NIM
   - Create `AppSeed` object in Weaviate with `tenant_id`, `content`, `embedding`
   - Call Nemotron Super to synthesize seed (title + refined content)
   - Update `AppSeed` with title/content
   - Create seed record in Postgres
   - Generate optional BFL image (based on seed content)
   - Update thought to `status=processed`
   - Increment usage counters

If any step fails, thought status = `error` and error logged.

---

## 7. Background Workers

**Worker process** (run multiple instances for scaling):
- Listens to Redis queue `enrichment_jobs`
- Processes jobs serially (or parallel with careful rate limiting)
- On failure, retry up to 3 times with exponential backoff

**Alternative**: Use Celery if complexity grows. For MVP, a simple queue worker is fine.

---

## 8. Authentication & Security

- JWT tokens (HS256) with 24-hour expiry
- Refresh tokens stored in Postgres (hashed)
- Rate limiting per `tenant_id` (100 requests/minute)
- All API calls over HTTPS only
- Passwords hashed with bcrypt
- Tenant isolation enforced in all data access code

---

## 9. Cost Management

- **Per-user quotas**: Free tier = 50,000 LLM tokens/month, 100 images/month, 500 vector ops/month
- **Billing**: Stripe subscriptions ($15/user/month)
- **Metering**: Usage table updated on every LLM call, embedding, image, vector query
- **Alerts**: If user exceeds 80% of quota, send email (later)

---

## 10. PWA Frontend Specification

### Tech Stack
- Vanilla HTML/CSS/JS (no framework)
- Service Worker for offline cache
- Web Push notifications (via VAPID keys)
- Responsive mobile-first design

### Pages / Views
1. **Login / Register** — simple forms
2. **Dashboard** — main view:
   - "Add thought" textarea + button
   - Recent seeds feed (cards)
   - Pull-to-refresh
3. **Seed Detail** — tap a seed to see full content + connected seeds (query vectors with same tenant_id)
4. **Settings** — notifications toggle, usage stats, account deletion

### Assets to Package
- Icons (SVG/PNG) for home screen, splash, various densities
- Manifest (`manifest.json`) with `display: standalone`, `theme_color`, `background_color`
- Service worker to cache static assets and API responses (stale-while-revalidate)

### Deployment
- Serve static files from FastAPI (`StaticFiles`) or Nginx
- HTTPS required (use Let's Encrypt on Hetzner)
- Add to home screen: Safari "Add to Home Screen" shows our icon

---

## 11. Implementation Milestones

### Week 1: Backend Core
- [ ] PostgreSQL schema + migrations (Alembic)
- [ ] Weaviate class creation script
- [ ] FastAPI app: auth routes, middleware JWT, rate limiting
- [ ] Docker compose: api + postgres + weaviate + redis

### Week 2: Enrichment & Vector Search
- [ ] Background worker (queue + enrichment steps)
- [ ] `/thoughts` endpoint + queue integration
- [ ] `/seeds` vector search endpoint
- [ ] Multi-tenant filtering tests

### Week 3: Daily Spark & Briefing
- [ ] Implement `/spark` (intent router + Nemotron)
- [ ] Implement `/briefing` (weather + news + Linke Tree + image)
- [ ] Usage metering integration

### Week 4: PWA Frontend
- [ ] HTML/CSS mockups (mobile design)
- [ ] Service worker + manifest
- [ ] JS auth flow (login/register token storage)
- [ ] Dashboard: add thought, seed list, pull-to-refresh
- [ ] Settings page

### Week 5: Test & Harden
- [ ] End-to-end tests (Postman/Playwright)
- [ ] Cross-tenant security audit
- [ ] Load test: 10 concurrent users
- [ ] Error handling & retries

### Week 6: Beta Prep
- [ ] Stripe integration (trial subscriptions)
- [ ] Admin dashboard (view users, usage)
- [ ] Deploy to Hetzner production (separate subdomain)
- [ ] Invite first 5 beta testers

---

## 12. Open Questions & Decisions Needed

- **Image budget**: How many images per user per month? Include in free tier? (Suggest: 10 images/month free, then $5/10 images)
- **Voice input**: PWA can use Web Speech API for voice dictation. Do we support? (Yes, but quality varies by browser)
- **Calendar sync**: Two-way sync with Google Calendar / Apple Calendar? Start with read-only iOS calendar access via Web Calendar API (limited). Prioritize later.
- **Notifications**: Use Web Push for morning spark and seed ready alerts. Need VAPID keys and service worker registration.
- **Export**: Allow users to export all data (JSON) — good for lock-in avoidance.
- **Pricing**: $15/user/month? Need to validate with cost model.

---

## 13. Risks

- **LLM cost runaway**: One heavy user could burn tokens. Mitigation: strict per-user quotas, hard caps.
- **Weaviate multi-tenancy bugs**: Must thoroughly test isolation. Use staging with two test users.
- **PWA limitations**: Push notifications, calendar access, voice input are less capable than native. Acceptable for MVP.
- **Time**: 6 weeks is aggressive for a solo dev. Might need to cut features (e.g., skip images initially).

---

## Appendix: Code Structure

```
openclaw-api/
├── app/
│   ├── main.py              # FastAPI app, routes
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── auth.py              # JWT, password utils
│   ├── middleware.py        # tenant injection, rate limiting
│   ├── weaviate_client.py   # wrapper with tenant_id
│   ├── enricher.py          # enrichment logic (extracted from existing)
│   ├── workers.py           # background queue worker
│   └── config.py            # env vars
├── worker/
│   └── main.py              # separate process: redis queue consumer
├── static/                  # PWA frontend (index.html, app.js, style.css)
├── tests/
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── README.md
```

---

## Related References

- Current Second Brain design (Notion + Weaviate) in workspace
- Biweekly Challenge Agent design
- Enrichment pipeline: `skills/idea-garden-rag/enrich_and_plant.py`
- Sync script: `skills/idea-garden-rag/sync_and_fetch_weaviate.py`

---

**Next Action**: Start coding the API service. Set up new Git branch? Deploy to test subdomain?"""

# Create page in Notion
page_data = {
    'parent': {'page_id': OPENCLAW_PARENT_ID},
    'properties': {
        'title': {'title': [{'text': {'content': 'OpenClaw API + PWA — Product Project Plan'}}]}
    },
    'children': [
        {
            'object': 'block',
            'type': 'heading_2',
            'heading_2': {'rich_text': [{'type': 'text', 'text': {'content': 'Vision & Scope'}}]}
        },
        {
            'object': 'block',
            'type': 'paragraph',
            'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': 'A web app (PWA) that gives users a personal AI Second Brain. Users capture thoughts (text/voice) → automatically enriched into seeds with connections. Daily morning spark and briefing. Vector search over their knowledge base. No Notion dependency. Optional calendar integration. Subscription billing to cover LLM + infrastructure costs.'}}]}
        },
        # ... more blocks would be added here programmatically for full content
        # For brevity, I'll just create the page with a summary and full content in a code block
    ]
}

# Actually create page with full content in a code block for now
url = "https://api.notion.com/v1/pages"
headers = {
    "Authorization": f"Bearer {NOTION_KEY}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
}
req = urllib.request.Request(url, data=json.dumps(page_data).encode(), headers=headers)
with urllib.request.urlopen(req) as r:
    page = json.loads(r.read())
page_id = page['id']
print(f"Created page: https://www.notion.so/{page_id.replace('-','')}")

# Now add the full content as children (simplified - we'll add as a large code block)
full_content_blocks = [
    {
        'object': 'block',
        'type': 'code',
        'code': {
            'language': 'markdown',
            'rich_text': [{'type': 'text', 'text': {'content': content}}]
        }
    }
]
url2 = f"https://api.notion.com/v1/blocks/{page_id}/children"
req2 = urllib.request.Request(url2, data=json.dumps({'children': full_content_blocks}).encode(), headers=headers, method='PATCH')
with urllib.request.urlopen(req2) as r:
    result = json.loads(r.read())

print("Full specification added to page.")
