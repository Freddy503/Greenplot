#!/usr/bin/env python3
"""
intent_router.py
Reads recent Seeds + Garden activity and returns the dominant intent/theme.
Used by Morning Spark to personalise its content.

Output JSON:
{
  "theme": "Forward Deployed Engineering",
  "active_seeds": ["seed title 1", "seed title 2"],
  "spark_mode": "career | agentic | creative | enterprise | general",
  "context": "brief description of what Freddy has been exploring"
}
"""

import os, sys, json, urllib.request, datetime

NOTION_API_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
SEEDS_DB       = '331fbc8d-40a5-8119-bff8-fa81e339ed97'
GARDEN_DB      = '331fbc8d-40a5-816b-80e0-ea68ff4ba64d'
NVIDIA_API_KEY = os.environ.get('NVIDIA_API_KEY', '')
NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'


def npost(path, data):
    req = urllib.request.Request(f'https://api.notion.com/v1{path}',
        data=json.dumps(data).encode(),
        headers={'Authorization': f'Bearer {NOTION_API_KEY}',
                 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def get_recent_seeds(days=7):
    """Get Seeds entries from last N days."""
    cutoff = (datetime.datetime.utcnow() - datetime.timedelta(days=days)).isoformat() + 'Z'
    res = npost(f'/databases/{SEEDS_DB}/query', {
        'filter': {'property': 'Captured', 'date': {'on_or_after': cutoff[:10]}},
        'sorts': [{'timestamp': 'created_time', 'direction': 'descending'}],
        'page_size': 10
    })
    titles = []
    for p in res.get('results', []):
        t = ''.join(x['plain_text'] for x in p['properties'].get('Thought', {}).get('title', []))
        if t: titles.append(t)
    return titles


def get_active_garden_seeds():
    """Get most recently edited Garden seeds."""
    res = npost(f'/databases/{GARDEN_DB}/query', {
        'filter': {'or': [
            {'property': 'Status', 'select': {'equals': 'Seedling 🌱'}},
            {'property': 'Status', 'select': {'equals': 'Growing 🌿'}}
        ]},
        'sorts': [{'timestamp': 'last_edited_time', 'direction': 'descending'}],
        'page_size': 5
    })
    seeds = []
    for p in res.get('results', []):
        t = ''.join(x['plain_text'] for x in p['properties'].get('Seed', {}).get('title', []))
        domains = [o['name'] for o in p['properties'].get('Domain', {}).get('multi_select', [])]
        if t: seeds.append({'title': t, 'domains': domains})
    return seeds


def classify_intent(recent_seeds, active_garden):
    """Use a tiny Nemotron call to classify the dominant theme — or do it deterministically."""
    # Deterministic classification based on keywords — zero LLM cost
    all_text = ' '.join(recent_seeds + [s['title'] for s in active_garden]).lower()
    all_domains = [d for s in active_garden for d in s.get('domains', [])]

    scores = {
        'career': sum(1 for w in ['fde', 'forward deployed', 'career', 'sap', 'academy', 'role', 'job'] if w in all_text),
        'agentic': sum(1 for w in ['agentic', 'agent', 'nemocore', 'opencore', 'weaviate', 'pipeline', 'llm', 'nemotron'] if w in all_text),
        'enterprise': sum(1 for w in ['enterprise', 'deployment', 'customer', 'use case', 'saas', 'odoo'] if w in all_text),
        'creative': sum(1 for w in ['creative', 'idea', 'spark', 'garden', 'flywheel', 'project'] if w in all_text),
    }
    # Domain boost
    for d in all_domains:
        if 'Career' in d: scores['career'] += 2
        if 'Agentic' in d: scores['agentic'] += 2
        if 'Enterprise' in d: scores['enterprise'] += 2
        if 'Creativity' in d: scores['creative'] += 2

    spark_mode = max(scores, key=scores.get) if any(scores.values()) else 'general'
    theme = {
        'career': 'Forward Deployed Engineering & Career',
        'agentic': 'Agentic Systems & NemoCore',
        'enterprise': 'Enterprise AI Deployment',
        'creative': 'Creative Projects & Idea Garden',
        'general': 'General Exploration'
    }[spark_mode]

    return {
        'theme': theme,
        'active_seeds': [s['title'] for s in active_garden[:3]],
        'spark_mode': spark_mode,
        'context': f"Recent activity: {', '.join(recent_seeds[:3]) or 'none'}. Active garden seeds: {', '.join([s['title'] for s in active_garden[:2]]) or 'none'}."
    }


def main():
    recent = get_recent_seeds(days=7)
    active = get_active_garden_seeds()
    result = classify_intent(recent, active)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
