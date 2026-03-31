#!/usr/bin/env python3
"""
enrich_and_plant.py
Full pipeline for one Seeds entry:
1. Web search for 2-3 relevant sources (via Brave/Exa if available, else DuckDuckGo)
2. Weaviate query for existing Garden connections
3. Nemotron synthesis: raw thought + web sources + Garden connections
4. Create enriched seed in Idea Garden DB
5. Mark Seeds entry as "Planted 🌱"
6. Re-sync Weaviate with new seed
7. Return structured output for Telegram delivery

Usage:
  python3 enrich_and_plant.py --entry-id <notion_page_id>
  python3 enrich_and_plant.py --entry-json '<json>'
"""

import os, sys, json, argparse, urllib.request, urllib.error, urllib.parse
import subprocess, datetime

NOTION_API_KEY  = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION  = '2022-06-28'
NVIDIA_API_KEY  = os.environ.get('NVIDIA_API_KEY', '')
EXA_API_KEY     = os.environ.get('EXA_API_KEY', '9c091493-cae9-458e-91e6-018ede5b3b79')
BFL_API_KEY     = open(os.path.expanduser('~/.config/bfl/api_key')).read().strip()

SEEDS_DB  = '331fbc8d-40a5-8119-bff8-fa81e339ed97'
IDEA_GARDEN_DB  = '331fbc8d-40a5-816b-80e0-ea68ff4ba64d'
WEAVIATE_URL    = os.environ.get('WEAVIATE_URL', 'http://localhost:8080')
NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'
NEMOTRON_MODEL  = 'nvidia/llama-3.1-nemotron-ultra-253b-v1'
SYNC_SCRIPT     = os.path.join(os.path.dirname(__file__), 'sync_and_fetch_weaviate.py')

SKILL_DIR = os.path.dirname(__file__)


# ── Notion helpers ────────────────────────────────────────────────────────────
def npost(path, data):
    req = urllib.request.Request(
        f'https://api.notion.com/v1{path}',
        data=json.dumps(data).encode(),
        headers={'Authorization': f'Bearer {NOTION_API_KEY}',
                 'Notion-Version': NOTION_VERSION,
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def npatch(path, data):
    req = urllib.request.Request(
        f'https://api.notion.com/v1{path}',
        data=json.dumps(data).encode(),
        headers={'Authorization': f'Bearer {NOTION_API_KEY}',
                 'Notion-Version': NOTION_VERSION,
                 'Content-Type': 'application/json'},
        method='PATCH')
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def nget(path):
    req = urllib.request.Request(
        f'https://api.notion.com/v1{path}',
        headers={'Authorization': f'Bearer {NOTION_API_KEY}',
                 'Notion-Version': NOTION_VERSION})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def extract_page_text(page_id):
    res = nget(f'/blocks/{page_id}/children?page_size=100')
    lines = []
    for block in res.get('results', []):
        btype = block['type']
        rt = block.get(btype, {}).get('rich_text', [])
        text = ''.join(x.get('plain_text', '') for x in rt)
        if text.strip():
            lines.append(text.strip())
    return '\n'.join(lines)


# ── Web search via Exa ────────────────────────────────────────────────────────
def web_search(query, num_results=3):
    """Search via Exa neural search API."""
    results = []
    try:
        payload = {
            'query': query,
            'numResults': num_results,
            'type': 'auto',
            'contents': {
                'text': {'maxCharacters': 400},
            }
        }
        req = urllib.request.Request(
            'https://api.exa.ai/search',
            data=json.dumps(payload).encode(),
            headers={
                'x-api-key': EXA_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'OpenClaw-IdeaGarden/1.0'
            })
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
        for item in data.get('results', [])[:num_results]:
            text = item.get('text', '') or ''
            results.append({
                'title': item.get('title', ''),
                'url': item.get('url', ''),
                'snippet': text[:400]
            })
    except Exception as e:
        print(f'  Exa search error: {e}', file=sys.stderr)
    return results


# ── Weaviate query ────────────────────────────────────────────────────────────
def query_weaviate(query_text, top_k=4):
    """Get related Garden seeds from Weaviate."""
    result = subprocess.run(
        [sys.executable, SYNC_SCRIPT, '--query', query_text, '--top-k', str(top_k)],
        capture_output=True, text=True, timeout=60
    )
    output = result.stdout
    if '=== JSON OUTPUT ===' in output:
        json_part = output.split('=== JSON OUTPUT ===')[1].strip()
        data = json.loads(json_part)
        return [r for r in data.get('results', []) if r.get('score', 0) >= 0.45]
    return []


# ── Nemotron synthesis ────────────────────────────────────────────────────────
def synthesize(entry, web_results, garden_connections):
    """Call Nemotron to synthesize a rich seed from raw thought + web + garden."""

    web_text = ''
    for i, r in enumerate(web_results, 1):
        web_text += f'\n{i}. {r["title"]}\n   {r["snippet"]}\n   Source: {r["url"]}\n'

    garden_text = ''
    for r in garden_connections[:3]:
        garden_text += f'\n- [{r["title"]}]({r["url"]}) (score: {r["score"]})\n  {r["excerpt"][:200]}\n'

    system_prompt = """You are Woody, Freddy's personal AI assistant building his growing brain.

Your task: Take a raw thought from the Seeds and transform it into a rich, enriched Idea Garden seed.

Output must be valid JSON with exactly these fields:
{
  "seed_title": "concise, memorable title (max 8 words)",
  "summary": "2-3 sentence synthesis of the core idea, enriched with context",
  "why_it_matters": "1-2 sentences on why this matters for Freddy specifically (FDE career, agentic systems, SAP context)",
  "web_insights": "2-3 bullet points from web sources, each with source citation",
  "garden_connections": "1-2 sentences on how this connects to existing Garden seeds",
  "next_action": "one concrete thing Freddy could do in the next 7 days to grow this seed",
  "domain_tags": ["tag1", "tag2"],
  "energy": "one of: 💡 Spark | 🔥 Hot | 🌊 Flow | ❄️ Cool",
  "status": "one of: Seedling 🌱 | Growing 🌿"
}

Rules:
- Be specific, not generic. Reference actual content from the inputs.
- No XML tags. No markdown headers. Pure JSON only.
- Keep total output under 600 words."""

    user_msg = f"""Raw Seeds entry:
Title: {entry['title']}
Context: {entry.get('context', '')}
Key takeaway: {entry.get('key_takeaway', '')}
Body: {entry.get('body', '')[:800]}

Web sources found:
{web_text or '(no web results)'}

Existing Garden connections:
{garden_text or '(no existing connections yet — this is a fresh seed)'}

Transform this into an enriched Idea Garden seed. Output JSON only."""

    payload = {
        'model': NEMOTRON_MODEL,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user',   'content': user_msg}
        ],
        'temperature': 0.35,
        'max_tokens': 700
    }
    req = urllib.request.Request(
        f'{NVIDIA_BASE_URL}/chat/completions',
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Bearer {NVIDIA_API_KEY}',
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=90) as r:
        res = json.loads(r.read())
    msg = res['choices'][0]['message']
    # Nemotron Ultra returns output in reasoning_content when content is null
    raw = (msg.get('content') or msg.get('reasoning_content') or '').strip()

    # Parse JSON — strip markdown fences if present
    if raw.startswith('```'):
        raw = raw.split('```')[1]
        if raw.startswith('json'):
            raw = raw[4:]
    return json.loads(raw.strip())


# ── Plant seed in Idea Garden ─────────────────────────────────────────────────
def plant_seed(synthesis, entry, web_results, image_url=None):
    today = datetime.date.today().isoformat()

    # Map domain tags to valid options
    valid_domains = {'Agentic AI', 'Career', 'Enterprise', 'Creativity', 'Systems', 'Learning'}
    domains = [d for d in synthesis.get('domain_tags', []) if d in valid_domains]
    if not domains:
        domains = ['Agentic AI']

    # Build source string
    source = f"Seeds: {entry['title']}"
    if web_results:
        source += ' + ' + ', '.join(r['url'][:50] for r in web_results[:2])

    # Web insights as bullet blocks
    children = []
    children.append({
        'object': 'block', 'type': 'callout', 'callout': {
            'icon': {'type': 'emoji', 'emoji': '🌱'},
            'rich_text': [{'type': 'text', 'text': {'content':
                f"Auto-planted from Seeds: \"{entry['title']}\" on {today}"
            }}]
        }
    })
    # Add BFL concept image if available
    if image_url:
        children.append({
            'object': 'block', 'type': 'image', 'image': {
                'type': 'external', 'external': {'url': image_url}
            }
        })

    children.append({
        'object': 'block', 'type': 'heading_2', 'heading_2': {
            'rich_text': [{'type': 'text', 'text': {'content': '💡 Core Idea'}}]
        }
    })
    children.append({
        'object': 'block', 'type': 'paragraph', 'paragraph': {
            'rich_text': [{'type': 'text', 'text': {'content': synthesis.get('summary', '')}}]
        }
    })
    children.append({
        'object': 'block', 'type': 'heading_2', 'heading_2': {
            'rich_text': [{'type': 'text', 'text': {'content': '🎯 Why It Matters For You'}}]
        }
    })
    children.append({
        'object': 'block', 'type': 'paragraph', 'paragraph': {
            'rich_text': [{'type': 'text', 'text': {'content': synthesis.get('why_it_matters', '')}}]
        }
    })
    if web_results:
        children.append({
            'object': 'block', 'type': 'heading_2', 'heading_2': {
                'rich_text': [{'type': 'text', 'text': {'content': '🌐 Web Insights'}}]
            }
        })
        # web_insights may be a list or a string
        wi = synthesis.get('web_insights', '')
        wi_text = '\n'.join(wi) if isinstance(wi, list) else wi
        children.append({
            'object': 'block', 'type': 'paragraph', 'paragraph': {
                'rich_text': [{'type': 'text', 'text': {'content': wi_text[:2000]}}]
            }
        })
        for wr in web_results:
            if wr.get('url'):
                children.append({
                    'object': 'block', 'type': 'bookmark', 'bookmark': {
                        'url': wr['url']
                    }
                })
    children.append({
        'object': 'block', 'type': 'heading_2', 'heading_2': {
            'rich_text': [{'type': 'text', 'text': {'content': '🔗 Garden Connections'}}]
        }
    })
    children.append({
        'object': 'block', 'type': 'paragraph', 'paragraph': {
            'rich_text': [{'type': 'text', 'text': {'content': synthesis.get('garden_connections', 'First seed — connections will grow.')}}]
        }
    })
    children.append({
        'object': 'block', 'type': 'heading_2', 'heading_2': {
            'rich_text': [{'type': 'text', 'text': {'content': '🚀 Next Action (this week)'}}]
        }
    })
    children.append({
        'object': 'block', 'type': 'to_do', 'to_do': {
            'checked': False,
            'rich_text': [{'type': 'text', 'text': {'content': synthesis.get('next_action', '')}}]
        }
    })

    page = npost('/pages', {
        'parent': {'type': 'database_id', 'database_id': IDEA_GARDEN_DB},
        'icon': {'type': 'emoji', 'emoji': '🌱'},
        'properties': {
            'Seed':        {'title': [{'type': 'text', 'text': {'content': synthesis['seed_title']}}]},
            'Status':      {'select': {'name': synthesis.get('status', 'Seedling 🌱')}},
            'Domain':      {'multi_select': [{'name': d} for d in domains]},
            'Energy':      {'select': {'name': synthesis.get('energy', '💡 Spark')}},
            'Planted':     {'date': {'start': today}},
            'Source':      {'rich_text': [{'type': 'text', 'text': {'content': source[:500]}}]},
            'Connections': {'rich_text': [{'type': 'text', 'text': {'content': synthesis.get('garden_connections', '')[:500]}}]},
            'Rating':      {'select': {'name': '⭐⭐⭐'}}
        },
        'children': children
    })

    return 'https://www.notion.so/' + page['id'].replace('-', '')


# ── Enrich Weaviate metadata ──────────────────────────────────────────────────
def enrich_weaviate_metadata(entry, synthesis, garden_connections):
    """
    Bridge: write enrichment metadata back to Weaviate objects after planting.
    Updates all chunks for this seed with: summary, tags, entities, backlinks, domain, energy.
    """
    import time
    time.sleep(3)  # Wait for sync to index new objects

    notion_id = entry['id']

    # Build enrichment properties
    tags = synthesis.get('domain_tags', [])
    domains = [d for d in tags if d in {'Agentic AI', 'Career', 'Enterprise', 'Creativity', 'Systems', 'Learning'}]
    kebab_tags = [d.lower().replace(' ', '-') for d in (domains or ['agentic-ai'])]

    entities = []
    for conn in garden_connections[:3]:
        entities.append({
            'name': conn.get('title', ''),
            'type': 'concept',
            'score': conn.get('score', 0)
        })

    backlinks = []
    for conn in garden_connections[:5]:
        backlinks.append({
            'notion_id': conn.get('notion_id', ''),
            'title': conn.get('title', ''),
            'score': conn.get('score', 0),
            'reason': 'Garden connection from enrichment'
        })

    enrichment = {
        'summary': synthesis.get('summary', '')[:300],
        'tags': ', '.join(kebab_tags),
        'entities': json.dumps(entities),
        'backlinks': json.dumps(backlinks),
        'energy': synthesis.get('energy', '💡 Spark').split(' ')[-1] if synthesis.get('energy') else 'Spark',
        'status': 'Growing',
        'enrichment_version': 1,
        'parent_id': notion_id,
        'domain': kebab_tags[0] if kebab_tags else 'agentic-ai',
        'tenant_id': os.environ.get('DEFAULT_TENANT_ID', ''),
    }

    # Find and update all Weaviate objects for this notion_id
    gql = '{ Get { IdeaSeed(where: { operator: Equal path: ["notion_id"] valueText: "%s" } limit: 20) { _additional { id } } } }' % notion_id
    req = urllib.request.Request(
        f'{WEAVIATE_URL}/v1/graphql',
        data=json.dumps({'query': gql}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        res = json.loads(r.read())

    hits = res.get('data', {}).get('Get', {}).get('IdeaSeed', [])
    updated = 0
    for hit in hits:
        obj_id = hit.get('_additional', {}).get('id')
        if not obj_id:
            continue
        try:
            patch_req = urllib.request.Request(
                f'{WEAVIATE_URL}/v1/objects/{obj_id}',
                data=json.dumps({'properties': enrichment}).encode(),
                headers={'Content-Type': 'application/json'},
                method='PATCH'
            )
            urllib.request.urlopen(patch_req, timeout=10)
            updated += 1
        except Exception as e:
            print(f'    Patch {obj_id} failed: {e}', file=sys.stderr)

    print(f'  Enriched {updated}/{len(hits)} Weaviate chunks', file=sys.stderr)


# ── Mark Seeds entry as Planted ────────────────────────────────────────
def mark_planted(entry_id, seed_url):
    npatch(f'/pages/{entry_id}', {
        'properties': {
            'State': {'select': {'name': 'Planted 🌱'}}
        }
    })


# ── Black Forest Labs image generation ───────────────────────────────────────
def generate_architecture_image(seed_title, summary, connections):
    """Generate a concept map / architecture image via BFL FLUX.1-dev."""
    node_labels = ', '.join(f'"{c}"' for c in connections[:3]) if connections else '"Agentic AI", "Career", "Deployment"'
    prompt = (
        f"Minimalist knowledge graph diagram. Nodes: {node_labels}, \"{seed_title}\". "
        f"Clean white background, thin pastel-colored connector lines, small circular nodes, "
        f"sans-serif labels, professional tech style. No text clutter, no gradients."
    )
    import time
    try:
        # Submit
        req = urllib.request.Request(
            'https://api.bfl.ai/v1/flux-dev',
            data=json.dumps({'prompt': prompt, 'width': 1024, 'height': 576}).encode(),
            headers={'x-key': BFL_API_KEY, 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=20) as r:
            res = json.loads(r.read())
        polling_url = res.get('polling_url')  # regional URL e.g. https://api.eu1.bfl.ai/...
        if not polling_url:
            return None

        # Poll using the regional polling_url from the response
        for _ in range(20):
            time.sleep(5)
            poll_req = urllib.request.Request(polling_url,
                headers={'x-key': BFL_API_KEY, 'Accept': 'application/json'})
            with urllib.request.urlopen(poll_req, timeout=15) as r:
                poll = json.loads(r.read())
            status = poll.get('status', '')
            if status == 'Ready':
                return poll.get('result', {}).get('sample')
            elif status in ('Error', 'Failed', 'Request Moderated', 'Content Moderated'):
                print(f'  BFL generation failed: {status}', file=sys.stderr)
                return None
        print('  BFL timeout', file=sys.stderr)
        return None
    except Exception as e:
        print(f'  BFL error: {e}', file=sys.stderr)
        return None


# ── Main ──────────────────────────────────────────────────────────────────────
def process_entry(entry):
    print(f'Processing: {entry["title"]}', file=sys.stderr)

    # 1. Web search
    search_query = f'{entry["title"]} {entry.get("context", "")} agentic AI enterprise deployment'
    print(f'  Searching web: {search_query[:80]}...', file=sys.stderr)
    web_results = web_search(search_query, num_results=3)
    print(f'  Found {len(web_results)} web results', file=sys.stderr)

    # 2. Weaviate query
    query_text = f'{entry["title"]} {entry.get("key_takeaway", "")} {entry.get("body", "")}'[:600]
    print(f'  Querying Weaviate...', file=sys.stderr)
    garden_connections = query_weaviate(query_text, top_k=4)
    print(f'  Found {len(garden_connections)} garden connections', file=sys.stderr)

    # 3. Nemotron synthesis
    print(f'  Synthesizing with Nemotron...', file=sys.stderr)
    synthesis = synthesize(entry, web_results, garden_connections)
    print(f'  Synthesis done: {synthesis.get("seed_title")}', file=sys.stderr)

    image_url = None  # BFL images only generated on explicit request

    # 5. Plant in Garden
    print(f'  Planting in Idea Garden...', file=sys.stderr)
    seed_url = plant_seed(synthesis, entry, web_results, image_url=image_url)
    print(f'  Planted: {seed_url}', file=sys.stderr)

    # 6. Mark parking lot entry as Planted
    mark_planted(entry['id'], seed_url)
    print(f'  Marked as Planted 🌱', file=sys.stderr)

    # 7. Re-sync Weaviate
    subprocess.Popen([sys.executable, SYNC_SCRIPT, '--sync'],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 8. Enrich Weaviate metadata (tags, entities, backlinks, domain)
    try:
        enrich_weaviate_metadata(entry, synthesis, garden_connections)
    except Exception as e:
        print(f'  Weaviate enrichment (non-blocking): {e}', file=sys.stderr)

    return {
        'seed_title': synthesis['seed_title'],
        'seed_url': seed_url,
        'seeds_entry': entry['title'],
        'seeds_url': entry['url'],
        'web_sources': len(web_results),
        'garden_connections': len(garden_connections),
        'why_it_matters': synthesis.get('why_it_matters', ''),
        'next_action': synthesis.get('next_action', ''),
        'summary': synthesis.get('summary', ''),
        'image_url': image_url
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--entry-id', help='Notion page ID of the parking lot entry')
    parser.add_argument('--entry-json', help='JSON string of entry (from detect_new_entries.py)')
    args = parser.parse_args()

    if args.entry_json:
        entry = json.loads(args.entry_json)
    elif args.entry_id:
        # Fetch from Notion
        res = nget(f'/pages/{args.entry_id}')
        props = res['properties']
        entry = {
            'id': res['id'],
            'title': ''.join(x['plain_text'] for x in props.get('Thought', {}).get('title', [])),
            'context': ''.join(x['plain_text'] for x in props.get('Context', {}).get('rich_text', [])),
            'key_takeaway': ''.join(x['plain_text'] for x in props.get('Key Takeaway', {}).get('rich_text', [])),
            'tags': [o['name'] for o in props.get('Tags', {}).get('multi_select', [])],
            'body': extract_page_text(res['id']),
            'url': f'https://www.notion.so/{res["id"].replace("-","")}'
        }
    else:
        parser.print_help()
        sys.exit(1)

    result = process_entry(entry)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
