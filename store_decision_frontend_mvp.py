#!/usr/bin/env python3
import os, json, urllib.request, datetime

NOTION_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
OPENCLAW_PARENT_ID = '19231104-e27a-4ea3-888f-ae449d2076ae'

content = """# Frontend MVP Stack Decision

**Date**: 2026-03-29  
**Decision**: Use Vercel AI SDK + React for the PWA frontend, with a minimal set of components.

---

## Approved Stack
- **Vercel AI SDK** (`useChat` hook) for streaming and message management
- **React** (no heavy framework, minimal setup)
- **Custom message rendering** with tool status display (e.g., "Checking knowledge base…")
- **Voice recording** via MediaRecorder API
- **File attachment** (simple text files initially)
- **Text-to-speech** toggle for assistant responses
- **Rating UI** (stars) with consent flag

---

## Implementation Order
1. Scaffold React app with Vercel AI SDK
2. Build chat interface: `useChat` + custom message bubbles + tool status
3. Add voice record button and file attachment
4. Add rating component and settings (consent toggle, explanation level)
5. Connect to OpenClaw API endpoints
6. Apply designs (expected end of week)

---

## Rationale
- `useChat` gives dynamic progress feeling out of the box
- Keeps frontend lightweight and focused
- Easy to extend with streaming and tool call visualization
- Decouples from backend; can swap OpenClaw → MCP later
- Fast to prototype; designs can be layered on top

---

## Rejected Alternatives
- Vanilla JS streaming: More manual work, but still viable later if needed
- Over‑engineered tool visualization: Keep it simple — just a status line during tool calls

---

**Status**: Approved and in progress. Backend API will provide necessary endpoints (thoughts, seeds, rating, spark, briefing). Frontend scaffolding starts immediately after backend sprint.

"""

# Notion page
page_data = {
    'parent': {'page_id': OPENCLAW_PARENT_ID},
    'properties': {'title': {'title': [{'text': {'content': 'Frontend MVP Stack Decision'}}]}},
    'children': [{
        'object': 'block',
        'type': 'paragraph',
        'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': 'Approved: Vercel AI SDK + React minimal chat with tool status, voice, file attach, rating, TTS.'}}]}
    }]
}
url = "https://api.notion.com/v1/pages"
headers = {"Authorization": f"Bearer {NOTION_KEY}", "Notion-Version": NOTION_VERSION, "Content-Type": "application/json"}
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

# Store in Weaviate tenant admin
from openclaw_api.app.weaviate_client import weaviate_client
from openclaw_api.app.enricher import embed_text
tenant_id = "08432316-9486-45f7-b418-3ae81deb90cd"
user_id = "00000000-0000-0000-0000-000000000000"
embedding = embed_text(content)
weaviate_id = weaviate_client.add_seed(
    tenant_id=tenant_id,
    user_id=user_id,
    thought_id="00000000-0000-0000-0000-000000000000",
    title="Frontend MVP Stack Decision",
    content=content[:10000],
    embedding=embedding,
    metadata={"source": "decision", "tags": ["frontend", "vercel", "react", "mvp"]},
    created_at=datetime.datetime.utcnow().isoformat()
)
print(f"Weaviate object created: {weaviate_id}")
print("Decision stored in Notion + Weaviate.")
