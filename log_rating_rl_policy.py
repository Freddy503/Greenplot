#!/usr/bin/env python3
import os, json, urllib.request, datetime

NOTION_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
OPENCLAW_PARENT_ID = '19231104-e27a-4ea3-888f-ae449d2076ae'

content = """# Rating, Feedback, and RL Policy

**Date**: 2026-03-29  
**Context**: Discussion about whether to use user ratings for reinforcement learning (RL) to improve the model.

---

## Decision

- **No RL by default** — User ratings are **not** used for automatic model training.
- **Opt‑in required** — Users must explicitly consent to contribute their ratings (and associated prompts/responses) to an improvement dataset.
- **Strict tenant isolation** — All data (including ratings) is never merged across users. Each user's data stays separate unless they opt‑in to contribute anonymized data to a global pool.

---

## Implementation

### Data Storage

Two tables:

1. **`seeds`** (existing) — add column `rating` (integer 1–5, nullable)
   - User rates a seed directly in the PWA
   - Rating is tied to `tenant_id` and `seed_id`

2. **`feedback`** (new) — stores detailed feedback and consent
   - `tenant_id`
   - `seed_id`
   - `rating` (1–5)
   - `consent` (boolean, default false) — "I agree to contribute this feedback to improve the system"
   - `timestamp`
   - Optional: free‑form `comments` (text)

### API Endpoints

- `POST /api/v1/seeds/{id}/rate` — body: `{ "rating": 4, "consent": false }`
- `GET /api/v1/feedback` — user can view their own feedback history (for transparency)

### PWA UI

- On seed detail page: 5‑star rating component (or thumbs up/down toggle)
- Settings page: "Help improve OpenClaw" toggle (off by default) — when off, ratings are stored but marked `consent=false`
- Show a small note: "Your ratings help us understand what content is useful. You can opt‑in to contribute to system improvements."

---

## Future RL Pipeline (if/when enough consented data)

1. **Export**: Periodically extract `feedback` rows where `consent=true` (anonymized, no tenant info)
2. **Fine‑tune**: Run DPO/PPO on a separate training server (not in production)
3. **Deploy**: New global model replaces the base model (or create per‑tenant custom models if desired)
4. **Governance**: Clear communication when a model update occurs, and ability to opt‑out of using the global improved model (fallback to base)

---

## Rationale

- **Privacy first**: No surprise training on user data.
- **Trust**: Users control their data and can see their feedback.
- **Flexibility**: Can still build a global improved model later with explicit consent.
- **Compliance**: GDPR‑friendly approach — consent is granular and revocable.

---

**Status**: To be implemented in OpenClaw API v0.2.0.

"""

# Create Notion page
page_data = {
    'parent': {'page_id': OPENCLAW_PARENT_ID},
    'properties': {
        'title': {'title': [{'text': {'content': 'Rating, Feedback, and RL Policy'}}]}
    },
    'children': [
        {
            'object': 'block',
            'type': 'paragraph',
            'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': 'Design decision: no RL by default, opt‑in consent required, strict tenant isolation.'}}]}
        }
    ]
}
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
print(f"Notion page: https://www.notion.so/{page_id.replace('-','')}")

# Add full content
full_blocks = [{'object': 'block', 'type': 'code', 'code': {'language': 'markdown', 'rich_text': [{'type': 'text', 'text': {'content': content}}]}}]
url2 = f"https://api.notion.com/v1/blocks/{page_id}/children"
req2 = urllib.request.Request(url2, data=json.dumps({'children': full_blocks}).encode(), headers=headers, method='PATCH')
with urllib.request.urlopen(req2) as r:
    json.loads(r.read())

print("Policy logged to Notion.")

# Also save locally
with open('/root/.openclaw/workspace/policy_rating_feedback_rl_2026-03-29.md', 'w') as f:
    f.write(content)
print("Local copy saved.")
