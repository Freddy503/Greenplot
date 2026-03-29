#!/usr/bin/env python3
import os, json, urllib.request

NOTION_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
OPENCLAW_PARENT_ID = '19231104-e27a-4ea3-888f-ae449d2076ae'

# Read the full content (shortened for Notion)
full_content = open('/root/.openclaw/workspace/strategy_differentiation_2026-03-29.md').read()
short_content = full_content[:1500] + "\n\n[... truncated. Full analysis stored locally at /root/.openclaw/workspace/strategy_differentiation_2026-03-29.md]"

page_data = {
    'parent': {'page_id': OPENCLAW_PARENT_ID},
    'properties': {
        'title': {'title': [{'text': {'content': 'Competitive Differentiation & Moat (Summary)'}}]}
    },
    'children': [
        {
            'object': 'block',
            'type': 'paragraph',
            'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': 'Analysis of how OpenClaw Brain differs from ChatGPT/Claude and what the sustainable competitive advantage could be.'}}]}
        },
        {
            'object': 'block',
            'type': 'heading_2',
            'heading_2': {'rich_text': [{'type': 'text', 'text': {'content': 'Key Points'}}]}
        },
        {
            'object': 'block',
            'type': 'paragraph',
            'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': short_content}}]}
        },
        {
            'object': 'block',
            'type': 'callout',
            'callout': {
                'icon': {'type': 'emoji', 'emoji': 'ℹ️'},
                'rich_text': [{'type': 'text', 'text': {'content': 'Full text saved locally. Weaviate sync pending API key configuration.'}}]
            }
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
print(f"Notion page created: https://www.notion.so/{page_id.replace('-','')}")
print("Content saved locally. Weaviate sync will happen after API keys are set.")
