#!/usr/bin/env python3
import os, json, urllib.request, datetime

NOTION_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
JOURNAL_DB_ID = "3866fe8b-57e0-4629-afc5-11776e8960dc"

entry = {
    "parent": {"database_id": JOURNAL_DB_ID},
    "properties": {
        "Title": {"title": [{"text": {"content": "Reflection: MVP vs Enterprise Path — 2026-03-29"}}]},
        "Date": {"date": {"start": datetime.date.today().isoformat()}},
        "Energy": {"select": {"name": "🌊 Flow"}},
        "Tags": {"multi_select": [{"name": "strategy"}, {"name": "product"}, {"name": "career"}]}
    },
    "children": [
        {
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{
                    "type": "text",
                    "text": {"content": "Building this Second Brain MVP has been super motivating. Friends' feedback is positive — it's already a working product that provides nice insights. I could wrap this into an app and release it, but Notion, Siri, etc. are super competitive in this space. Alternatively, I could focus on Enterprise AI: apply these learnings to build something for ERP/CRM customers, leveraging my FDE role. I want to share this knowledge at work to position myself as a thought leader. Unsure whether to pursue the consumer app route (side project, lots of time) or double down on enterprise knowledge graphs and that kind of thing."}
                }]}
        }
    ]
}

url = "https://api.notion.com/v1/pages"
headers = {
    "Authorization": f"Bearer {NOTION_KEY}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}
req = urllib.request.Request(url, data=json.dumps(entry).encode(), headers=headers)
with urllib.request.urlopen(req) as r:
    page = json.loads(r.read())
print(f"Journal entry created: https://www.notion.so/{page['id'].replace('-','')}")
