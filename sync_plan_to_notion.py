#!/usr/bin/env python3
"""
Sync IMPLEMENTATION_PLAN.md to Notion (markdown block) under OpenClaw parent page.
"""

import os, json, httpx, datetime

# Config
PLAN_PATH = "/root/.openclaw/workspace/IMPLEMENTATION_PLAN.md"
NOTION_KEY = open(os.path.expanduser("~/.config/notion/api_key")).read().strip()
NOTION_VERSION = "2022-06-28"
OPENCLAW_PARENT_ID = "19231104-e27a-4ea3-888f-ae449d2076ae"

def read_plan():
    with open(PLAN_PATH, 'r') as f:
        return f.read()

def create_notion_page(title, content_markdown):
    headers = {
        "Authorization": f"Bearer {NOTION_KEY}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
    }

    # Create empty page first
    page_data = {
        "parent": {"page_id": OPENCLAW_PARENT_ID},
        "properties": {"title": {"title": [{"text": {"content": title}}]}}
    }
    url = "https://api.notion.com/v1/pages"
    resp = httpx.post(url, json=page_data, headers=headers, timeout=60)
    if resp.status_code != 200:
        print("Notion error (create page):", resp.status_code, resp.text)
        resp.raise_for_status()
    page = resp.json()
    page_id = page["id"]
    print(f"Created Notion page ID: {page_id}")

    # Append content in chunks using PATCH (append children)
    chunk_size = 2000
    chunks = [content_markdown[i:i+chunk_size] for i in range(0, len(content_markdown), chunk_size)]
    append_url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    for i, chunk in enumerate(chunks):
        block = {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": chunk}}]
            }
        }
        # Insert divider before chunks after the first
        if i > 0:
            divider = {"object": "block", "type": "divider", "divider": {}}
            resp = httpx.patch(append_url, json={"children": [divider]}, headers=headers, timeout=60)
            if resp.status_code not in (200, 201):
                print(f"Notion error (divider {i}):", resp.status_code, resp.text)
        resp = httpx.patch(append_url, json={"children": [block]}, headers=headers, timeout=60)
        if resp.status_code not in (200, 201):
            print(f"Notion error (append block {i}):", resp.status_code, resp.text)
    return page_id

def main():
    content = read_plan()
    title = "Implementation Plan: AI Second Brain MVP"
    page_id = create_notion_page(title, content)
    print(f"✅ Implementation plan synced to Notion: https://www.notion.so/{page_id.replace('-','')}")

if __name__ == "__main__":
    main()
