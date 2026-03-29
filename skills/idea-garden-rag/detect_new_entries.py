#!/usr/bin/env python3
"""
detect_new_entries.py
Polls the Seeds DB for entries with State = "Raw 🌀" (unprocessed).
Outputs JSON list of new entries for the agent to enrich and plant.

Usage:
  python3 detect_new_entries.py
  → prints JSON: {"entries": [...]} or {"entries": []}
"""

import os, sys, json, urllib.request

NOTION_API_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
SEEDS_DB = '331fbc8d-40a5-8119-bff8-fa81e339ed97'


def notion_post(path, data):
    req = urllib.request.Request(
        f'https://api.notion.com/v1{path}',
        data=json.dumps(data).encode(),
        headers={'Authorization': f'Bearer {NOTION_API_KEY}',
                 'Notion-Version': NOTION_VERSION,
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def notion_get(path):
    req = urllib.request.Request(
        f'https://api.notion.com/v1{path}',
        headers={'Authorization': f'Bearer {NOTION_API_KEY}',
                 'Notion-Version': NOTION_VERSION})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def extract_page_text(page_id):
    res = notion_get(f'/blocks/{page_id}/children?page_size=100')
    lines = []
    for block in res.get('results', []):
        btype = block['type']
        rt = block.get(btype, {}).get('rich_text', [])
        text = ''.join(x.get('plain_text', '') for x in rt)
        if text.strip():
            lines.append(text.strip())
    return '\n'.join(lines)


def main():
    # Query for entries with State = "Raw 🌀" (unprocessed)
    res = notion_post(f'/databases/{SEEDS_DB}/query', {
        'filter': {
            'property': 'State',
            'select': {'equals': 'Raw 🌀'}
        },
        'sorts': [{'timestamp': 'created_time', 'direction': 'ascending'}],
        'page_size': 5
    })

    entries = []
    for page in res.get('results', []):
        pid = page['id']
        props = page['properties']

        title = ''.join(x['plain_text'] for x in props.get('Thought', {}).get('title', []))
        context = ''.join(x['plain_text'] for x in props.get('Context', {}).get('rich_text', []))
        key_takeaway = ''.join(x['plain_text'] for x in props.get('Key Takeaway', {}).get('rich_text', []))
        tags = [o['name'] for o in props.get('Tags', {}).get('multi_select', [])]
        captured = props.get('Captured', {}).get('date', {})
        captured_date = captured.get('start', '') if captured else ''

        body_text = extract_page_text(pid)

        entries.append({
            'id': pid,
            'title': title or 'Untitled',
            'context': context,
            'key_takeaway': key_takeaway,
            'tags': tags,
            'captured': captured_date,
            'body': body_text,
            'url': f'https://www.notion.so/{pid.replace("-","")}'
        })

    print(json.dumps({'entries': entries}, ensure_ascii=False))


if __name__ == '__main__':
    main()
