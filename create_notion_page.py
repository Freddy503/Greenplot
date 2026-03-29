#!/usr/bin/env python3
import os, json, urllib.request

NOTION_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
OPENCLAW_PARENT_ID = '19231104-e27a-4ea3-888f-ae449d2076ae'

# Create page
page_data = {
    'parent': {'page_id': OPENCLAW_PARENT_ID},
    'properties': {
        'title': {'title': [{'text': {'content': 'enterprise software Agents vs OpenClaw Skills & Odoo Integration'}}]}
    }
}
req = urllib.request.Request(
    'https://api.notion.com/v1/pages',
    data=json.dumps(page_data).encode(),
    headers={'Authorization': f'Bearer {NOTION_KEY}',
             'Notion-Version': NOTION_VERSION,
             'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as r:
    page = json.loads(r.read())
page_id = page['id']
page_url = f"https://www.notion.so/{page_id.replace('-', '')}"

# Build content blocks
blocks = []

# Callout
blocks.append({
    'object': 'block', 'type': 'callout', 'callout': {
        'icon': {'type': 'emoji', 'emoji': '🔄'},
        'rich_text': [{'type': 'text', 'text': {'content': 'Auto-created from conversation on 2026-03-29'}}]
    }
})

# Summary
blocks.append({'object': 'block', 'type': 'heading_2', 'heading_2': {'rich_text': [{'type': 'text', 'text': {'content': 'Summary'}}]}})
blocks.append({'object': 'block', 'type': 'paragraph', 'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': 'Discussion about how enterprise software\'s "agents" map to OpenClaw\'s skills and architecture for integrating Odoo CRM into the Second Brain project.'}}]}})

# Mapping table (as code block to preserve formatting)
blocks.append({'object': 'block', 'type': 'heading_2', 'heading_2': {'rich_text': [{'type': 'text', 'text': {'content': 'enterprise software Agents vs OpenClaw Skills'}}]}})
table_md = """| enterprise software Concept | OpenClaw Equivalent | How They Fit |
|------------|-------------------|--------------|
| enterprise software AI Core Agents (document-extraction, product-recommendation) | External Services (API endpoints) | Capabilities that OpenClaw skills can call. Not skills themselves. |
| enterprise software Build Process Automation (workflow bots) | Multi-step OpenClaw skills | Can be orchestrated by OpenClaw agent or wrapped as a skill if API exposed. |
| enterprise software Joule (copilot) | Native LLM integration (Claude, GPT, etc.) | Joule is enterprise software's branded assistant. Your OpenClaw agent is your generic assistant. You replicate Joule-like functionality using your own LLM + skills. |
| enterprise software HANA AI/ML (in-database algorithms) | Specialized tools (Python scripts, vector DB queries) | Backend capabilities; skill would call HANA procedures or expose results via service. |
| enterprise software Graph (unified API layer) | Unified OData/REST wrapper | Canonical API your skill uses to interact with multiple enterprise software modules, similar to Odoo\'s XML-RPC. |
"""
blocks.append({'object': 'block', 'type': 'code', 'code': {
    'language': 'markdown',
    'rich_text': [{'type': 'text', 'text': {'content': table_md}}]
}})

# Architecture pattern
blocks.append({'object': 'block', 'type': 'heading_2', 'heading_2': {'rich_text': [{'type': 'text', 'text': {'content': 'Your System Architecture Pattern'}}]}})
arch = """User (Telegram/WhatsApp)
    ↓
OpenClaw Agent (LLM-powered)
    ↓
Skills (modular scripts with tools)
    ↓
Backend APIs (Odoo, Notion, enterprise software, etc.)
    ↓
Databases / Enterprise Systems

**Skills are the "glue"** that translate natural language intents into API calls, handle auth, format results, and maintain conversation state. They are not the AI itself—they are tool definitions the agent can use.
"""
blocks.append({'object': 'block', 'type': 'paragraph', 'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': arch}}]}})

# Incorporating enterprise software AI
blocks.append({'object': 'block', 'type': 'heading_2', 'heading_2': {'rich_text': [{'type': 'text', 'text': {'content': 'Incorporating enterprise software AI Offerings'}}]}})
incorporate = """If you have access to enterprise software systems (enterprise software BTP, S/4HANA, AI Core), the integration steps:

1. **Inventory enterprise software services** (API-accessible vs embedded Joule)
2. **Build enterprise software skill(s)** analogous to `odoo_lead_ingest.py`:
   - Example: enterprise software AI Core skill for document classification
3. **Choose integration depth** (read-only, write, AI capabilities, Joule-like)
4. **Authentication patterns** (OAuth2, SAML, API key depending on enterprise software system)
"""
blocks.append({'object': 'block', 'type': 'paragraph', 'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': incorporate}}]}})

# Practical first step
blocks.append({'object': 'block', 'type': 'heading_2', 'heading_2': {'rich_text': [{'type': 'text', 'text': {'content': 'Practical First Step'}}]}})
first_step = """Check access to:
- enterprise software BTP subaccount with AI services
- S/4HANA (cloud/on-prem) with OData/enterprise software Graph endpoints
- enterprise software AI Core or Joule APIs

If yes, create `enterprise software_GRAPH_SETUP.md` and build a minimal enterprise software skill (e.g., "list recent sales orders"), then extend to AI capabilities.
"""
blocks.append({'object': 'block', 'type': 'paragraph', 'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': first_step}}]}})

# Odoo diagram note
blocks.append({'object': 'block', 'type': 'heading_2', 'heading_2': {'rich_text': [{'type': 'text', 'text': {'content': 'Odoo Architecture Diagram'}}]}})
blocks.append({'object': 'block', 'type': 'paragraph', 'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': 'Generated Odoo PoC architecture saved to workspace media: media/odoo_architecture_bfl.jpg'}}]}})

# Append all blocks to the page
url = f'https://api.notion.com/v1/blocks/{page_id}/children'
req = urllib.request.Request(
    url,
    data=json.dumps({'children': blocks}).encode(),
    headers={'Authorization': f'Bearer {NOTION_KEY}',
             'Notion-Version': NOTION_VERSION,
             'Content-Type': 'application/json'},
    method='PATCH')
with urllib.request.urlopen(req) as r:
    result = json.loads(r.read())

print(f"Created page: {page_url}")