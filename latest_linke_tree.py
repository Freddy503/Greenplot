#!/usr/bin/env python3
"""Return the latest Linke Tree entry as a formatted markdown line."""

import os, sys, json, urllib.request, datetime

NOTION_API_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
LINK_TREE_DB_ID = '332fbc8d-40a5-811f-8fd0-cdc86f8f8eab'  # Linke Tree DB

def notion_post(path, data):
    req = urllib.request.Request(
        f'https://api.notion.com/v1{path}',
        data=json.dumps(data).encode(),
        headers={'Authorization': f'Bearer {NOTION_API_KEY}',
                 'Notion-Version': NOTION_VERSION,
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def main():
    # Query most recent entry by Date Added descending
    res = notion_post(f'/databases/{LINK_TREE_DB_ID}/query', {
        'sorts': [{'property': 'Date Added', 'direction': 'descending'}],
        'page_size': 1
    })
    pages = res.get('results', [])
    if not pages:
        print("No Linke Tree entries yet.")
        return

    page = pages[0]
    # Title
    title_prop = page['properties'].get('Title', {}).get('title', [])
    title = ''.join(x['plain_text'] for x in title_prop) or 'Untitled'
    # URL
    url_prop = page['properties'].get('URL', {})
    url = url_prop.get('url', '')
    # Key Insights
    insights_prop = page['properties'].get('Key Insights', {})
    insights = ''
    if insights_prop.get('type') == 'rich_text':
        insights = ''.join(x.get('plain_text', '') for x in insights_prop.get('rich_text', []))
    # Truncate to a few sentences
    if insights:
        # take first 200 chars, break at sentence
        snippet = insights[:200]
        if len(insights) > 200:
            snippet = snippet.rsplit('.', 1)[0] + '.'
    else:
        snippet = ''

    # Format for inclusion
    line = f"🔗 *{title}* — {snippet} ({url})"
    print(line)

if __name__ == '__main__':
    main()
