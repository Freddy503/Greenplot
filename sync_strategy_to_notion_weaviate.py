#!/usr/bin/env python3
import os, json, urllib.request, datetime, httpx

# Notion
NOTION_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
OPENCLAW_PARENT_ID = '19231104-e27a-4ea3-888f-ae449d2076ae'

# Weaviate & Embedding
WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://localhost:8081")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")

content = """# Competitive Differentiation & Moat

**Date**: 2026-03-29  
**Context**: Post-gym reflection on how OpenClaw Brain differs from ChatGPT/Claude and what the sustainable competitive advantage could be.

---

## How This Differs from Claude/ChatGPT

| Aspect | ChatGPT/Claude directly | OpenClaw Brain (your system) |
|--------|------------------------|-----------------------------|
| **Context** | Limited to recent conversation; each session isolated | Persistent knowledge graph (Parking Lot → Garden) that remembers forever |
| **Data ownership** | Your queries go to their servers; history in their cloud | Your data lives in *your* Weaviate/Postgres, on your server |
| **Automation** | You must manually prompt, copy, organize | System automatically enriches thoughts → creates seeds → finds connections |
| **Multi-modal** | Text mainly (plus file uploads) | Integrated vector + graph + scheduled prompts + images (BFL) |
| **Tool integration** | Can use browser/search, but no persistent connections to *your* Notion/Odoo/calendar | Skills that call *your* APIs directly, store results in your DB |
| **Cost** | Pay-per-token, can get expensive with heavy use | Fixed infrastructure cost (server) + API fees — potentially cheaper at your usage level |
| **Customization** | You can't change the prompts or workflows fundamentally | You own the code; the morning spark, enrichment pipeline, and triggers are *your* logic |

---

## What's Your Moat?

1. **Personal Knowledge Graph** — The accumulated, interconnected seeds are unique to you. No one else has your exact data and connection patterns. Classic "your data is your moat."

2. **Workflow Automation** — The cron-driven pipeline (voice → Parking Lot → enriched seed → BFL image → Telegram) is a tailored, frictionless loop that generic AI doesn't provide out of the box.

3. **Tone & Philosophy** — You're building it as a *creativity companion*, not a productivity robot. The prompts, the Receptive State Journal, the morning spark — these are *personal* and can't be replicated simply by Prompting 101.

4. **Privacy & Control** — Everything stays on your Hetzner server. No data leaves your control. For privacy‑conscious users, that's a selling point.

5. **Integration Depth** — If you connect it to your Odoo CRM, calendar, and other tools, you get a unified view that no single AI vendor can provide without building those integrations themselves.

6. **Cost Efficiency at Scale** — Once the infra is running, adding users has marginal cost. If you keep it small and hobbyist, you can operate at a loss or donation‑supported, which commercial products can't do.

---

## Competitive Positioning (Hobby Project)

You're **not** trying to beat ChatGPT. You're building a **Niche Knowledge Companion** for:

- People who want a personal, private, persistent brain
- Those who like to tinker and own their infrastructure
- Creative professionals who value *process* over *answers*
- Small communities where trust and data sovereignty matter

Your "moat" isn't technology — it's **authenticity and alignment**. You're building the tool *you* want to use, with your specific quirks (receptive state journal, Linke Tree insights, BFL images). That personal touch is hard to replicate at scale.

---

## Summary

- **Differentiator**: Permanent, personalized knowledge graph + automated enrichment + privacy
- **Moat**: Your data, your workflow, your tone
- **Not competing with**: ChatGPT as a chatbot; competing with *Notion + AI* but with a different philosophy (less corporate, more personal)

That's a perfectly valid space for a hobby project. The question "why would anyone use this instead of ChatGPT?" has a good answer: *Because it's yours, it remembers, and it respects your privacy.*"""

# 1. Create Notion page
page_data = {
    'parent': {'page_id': OPENCLAW_PARENT_ID},
    'properties': {'title': {'title': [{'text': {'content': 'Competitive Differentiation & Moat'}}]}},
    'children': [{
        'object': 'block',
        'type': 'paragraph',
        'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': 'How OpenClaw Brain differs from ChatGPT/Claude and what the sustainable competitive advantage could be.'}}]}
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
print("Notion content added.")

# 2. Sync to Weaviate
import weaviate
client = weaviate.Client(url=WEAVIATE_URL)

# Ensure class exists
class_name = "AppSeed"
try:
    client.schema.get(class_name)
except:
    client.schema.create_class({
        "class": class_name,
        "properties": [
            {"name": "tenant_id", "dataType": ["text"]},
            {"name": "user_id", "dataType": ["text"]},
            {"name": "thought_id", "dataType": ["text"]},
            {"name": "title", "dataType": ["text"]},
            {"name": "content", "dataType": ["text"]},
            {"name": "seed_metadata", "dataType": ["text"]},
            {"name": "image_url", "dataType": ["text"]},
            {"name": "created_at", "dataType": ["date"]}
        ],
        "vectorIndexConfig": {"vector": {"dimensions": 1024, "distance": "cosine"}}
    })

# Generate embedding
if not NVIDIA_API_KEY:
    print("Warning: NVIDIA_API_KEY not set, skipping Weaviate sync.")
else:
    emb_resp = httpx.post(
        "https://integrate.api.nvidia.com/v1/embeddings",
        json={"input": content, "model": "nvidia/nv-embedqa-e5-v5", "input_type": "passage", "encoding_format": "float"},
        headers={"Authorization": f"Bearer {NVIDIA_API_KEY}"},
        timeout=30
    )
    emb_resp.raise_for_status()
    embedding = emb_resp.json()["data"][0]["embedding"]

    tenant_id = "08432316-9486-45f7-b418-3ae81deb90cd"
    user_id = "00000000-0000-0000-0000-000000000000"
    thought_id = "00000000-0000-0000-0000-000000000000"

    obj_id = client.data.object.create(
        class_name=class_name,
        data_object={
            "tenant_id": tenant_id,
            "user_id": user_id,
            "thought_id": thought_id,
            "title": "Competitive Differentiation & Moat",
            "content": content[:10000],
            "seed_metadata": json.dumps({"source": "strategy", "tags": ["moat", "competition", "positioning"]}),
            "image_url": None,
            "created_at": datetime.datetime.utcnow().isoformat()
        },
        vector=embedding
    )
    print(f"Weaviate object created: {obj_id}")

print("Sync complete: Notion + Weaviate.")
