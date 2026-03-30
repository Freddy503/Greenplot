#!/usr/bin/env python3
"""
sync_and_fetch_weaviate.py
Syncs the Notion Idea Garden + Parking Lot into Weaviate,
generates embeddings via OpenRouter (Nemotron/nv-embedqa),
and returns related seeds for a given query text.

Usage:
  # Sync Idea Garden into Weaviate:
  python3 sync_and_fetch_weaviate.py --sync

  # Query: find seeds related to a piece of text:
  python3 sync_and_fetch_weaviate.py --query "Forward Deployed Engineering deployment strategist"

  # Both at once:
  python3 sync_and_fetch_weaviate.py --sync --query "..."
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.error
import datetime

# ── Config ──────────────────────────────────────────────────────────────────
NOTION_API_KEY   = open(os.path.expanduser("~/.config/notion/api_key")).read().strip()
NOTION_VERSION   = "2022-06-28"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

WEAVIATE_URL     = os.environ.get("WEAVIATE_URL", "http://localhost:8080")
EMBED_MODEL      = "openai/text-embedding-ada-002"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

IDEA_GARDEN_DB_ID    = "331fbc8d-40a5-816b-80e0-ea68ff4ba64d"  # Idea Garden tabular DB
SEEDS_DB_ID          = "331fbc8d-40a5-8119-bff8-fa81e339ed97"  # Seeds DB (raw entries, formerly Parking Lot)
CRON_LOGS_DB_ID      = "332fbc8d-40a5-81a8-aad8-d452ba30d931"  # CronJob Knowledge Base
LINK_TREE_DB_ID      = "332fbc8d-40a5-811f-8fd0-cdc86f8f8eab"  # Link Tree
LLM_PATTERNS_PAGE_ID = "331fbc8d-40a5-81cb-ad04-c9f93fd40614"  # LLM System Patterns 2026
WEAVIATE_CLASS   = "IdeaSeed"
CHUNK_SIZE       = 800   # characters per chunk


# ── Notion helpers ───────────────────────────────────────────────────────────
def notion_get(path):
    req = urllib.request.Request(
        f"https://api.notion.com/v1{path}",
        headers={"Authorization": f"Bearer {NOTION_API_KEY}",
                 "Notion-Version": NOTION_VERSION}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def notion_post(path, data):
    req = urllib.request.Request(
        f"https://api.notion.com/v1{path}",
        data=json.dumps(data).encode(),
        headers={"Authorization": f"Bearer {NOTION_API_KEY}",
                 "Notion-Version": NOTION_VERSION,
                 "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def extract_text_from_blocks(page_id, depth=0):
    """Recursively extract plain text from Notion blocks."""
    if depth > 3:
        return ""
    res = notion_get(f"/blocks/{page_id}/children?page_size=100")
    lines = []
    for block in res.get("results", []):
        btype = block["type"]
        content = block.get(btype, {})
        rt = content.get("rich_text", [])
        text = "".join(x.get("plain_text", "") for x in rt)
        title = content.get("title", "")
        line = text or title
        if line:
            lines.append(line)
        # Recurse into child blocks
        if block.get("has_children"):
            lines.append(extract_text_from_blocks(block["id"], depth + 1))
    return "\n".join(filter(None, lines))


def fetch_idea_garden_seeds():
    """Fetch all rows from the Idea Garden tabular DB."""
    res = notion_post(f"/databases/{IDEA_GARDEN_DB_ID}/query", {
        "sorts": [{"timestamp": "created_time", "direction": "descending"}]
    })
    seeds = []
    for page in res.get("results", []):
        pid = page["id"]
        title_prop = page["properties"].get("Seed", {}).get("title", [])
        title = "".join(x["plain_text"] for x in title_prop) or "Untitled"
        created = page.get("created_time", "")[:10]
        # Collect property text
        prop_text = []
        for pname, pval in page["properties"].items():
            if pname == "Seed":
                continue
            ptype = pval.get("type")
            if ptype == "rich_text":
                t = "".join(x["plain_text"] for x in pval.get("rich_text", []))
                if t: prop_text.append(f"{pname}: {t}")
            elif ptype == "select" and pval.get("select"):
                prop_text.append(f"{pname}: {pval['select']['name']}")
            elif ptype == "multi_select":
                opts = ", ".join(o["name"] for o in pval.get("multi_select", []))
                if opts: prop_text.append(f"{pname}: {opts}")
        body_text = extract_text_from_blocks(pid)
        full_text = f"{title}\n" + "\n".join(prop_text) + "\n\n" + body_text
        seeds.append({
            "id": pid, "title": title, "text": full_text,
            "source": "idea_garden", "created": created,
            "url": f"https://www.notion.so/{pid.replace('-','')}"
        })
    return seeds


def fetch_llm_patterns():
    """Fetch the LLM System Patterns 2026 page as a seed."""
    text = extract_text_from_blocks(LLM_PATTERNS_PAGE_ID)
    return [{"id": LLM_PATTERNS_PAGE_ID, "title": "LLM System Patterns for 2026",
             "text": text, "source": "reference",
             "url": f"https://www.notion.so/{LLM_PATTERNS_PAGE_ID.replace('-','')}"}]


def fetch_parking_lot_entries():
    """Fetch all entries from the Parking Lot Notion DB."""
    res = notion_post(f"/databases/{SEEDS_DB_ID}/query", {
        "sorts": [{"timestamp": "created_time", "direction": "descending"}]
    })
    seeds = []
    for page in res.get("results", []):
        pid = page["id"]
        name_prop = page["properties"].get("Name", {}).get("title", [])
        title = "".join(x["plain_text"] for x in name_prop) or "Untitled"
        created = page.get("created_time", "")[:10]
        text = extract_text_from_blocks(pid)
        seeds.append({
            "id": pid, "title": title, "text": text,
            "source": "parking_lot", "created": created,
            "url": f"https://www.notion.so/{pid.replace('-','')}"
        })
    return seeds


# ── Chunking ────────────────────────────────────────────────────────────────
def chunk_text(text, size=CHUNK_SIZE):
    """Split text into overlapping chunks."""
    chunks = []
    for i in range(0, max(1, len(text)), size):
        chunk = text[i:i + size].strip()
        if chunk:
            chunks.append(chunk)
    return chunks or ["(empty)"]


# ── Embeddings via OpenRouter ────────────────────────────────────────────────
def embed(texts):
    """Generate embeddings for a list of texts via OpenRouter."""
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    payload = {
        "input": texts,
        "model": EMBED_MODEL,
        
        "truncate": "END"
    }
    req = urllib.request.Request(
        f"{OPENROUTER_BASE_URL}/embeddings",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}",
                 "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
    return [item["embedding"] for item in res["data"]]


def embed_query(text):
    """Embed a single query string."""
    payload = {
        "input": [text],
        "model": EMBED_MODEL,
        
        "truncate": "END"
    }
    req = urllib.request.Request(
        f"{OPENROUTER_BASE_URL}/embeddings",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}",
                 "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
    return res["data"][0]["embedding"]


# ── Weaviate helpers ─────────────────────────────────────────────────────────
def weaviate_request(method, path, data=None):
    url = f"{WEAVIATE_URL}/v1{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read()) if r.length != 0 else {}
    except urllib.error.HTTPError as e:
        body = e.read()
        raise RuntimeError(f"Weaviate {method} {path} -> {e.code}: {body}")


def ensure_schema():
    """Create the IdeaSeed class if it doesn't exist."""
    try:
        schema = weaviate_request("GET", "/schema")
        existing = [c["class"] for c in schema.get("classes", [])]
        if WEAVIATE_CLASS in existing:
            print(f"  Schema class '{WEAVIATE_CLASS}' already exists.")
            return
    except Exception as e:
        print(f"  Warning checking schema: {e}")

    class_def = {
        "class": WEAVIATE_CLASS,
        "description": "A seed from Freddy's Idea Garden or Parking Lot",
        "vectorizer": "none",
        "properties": [
            {"name": "notion_id",  "dataType": ["text"]},
            {"name": "title",      "dataType": ["text"]},
            {"name": "text",       "dataType": ["text"]},
            {"name": "chunk_idx",  "dataType": ["int"]},
            {"name": "source",     "dataType": ["text"]},
            {"name": "created",    "dataType": ["text"]},
            {"name": "url",        "dataType": ["text"]},
        ]
    }
    weaviate_request("POST", "/schema", class_def)  # Weaviate 1.24: POST single class object
    print(f"  Created schema class '{WEAVIATE_CLASS}'.")


def delete_by_notion_id(notion_id):
    """Remove all chunks for a given Notion page ID."""
    try:
        weaviate_request("POST", f"/batch/objects/delete", {
            "match": {
                "class": WEAVIATE_CLASS,
                "where": {
                    "operator": "Equal",
                    "path": ["notion_id"],
                    "valueText": notion_id
                }
            }
        })
    except Exception:
        pass  # ok if none exist yet


def upsert_seed(seed):
    """Chunk, embed, and upsert a seed into Weaviate."""
    chunks = chunk_text(seed["text"])
    print(f"  Embedding '{seed['title']}' ({len(chunks)} chunks)...")

    # Batch embed
    vectors = embed(chunks)

    # Delete old chunks first
    delete_by_notion_id(seed["id"])

    # Batch insert
    objects = []
    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        objects.append({
            "class": WEAVIATE_CLASS,
            "properties": {
                "notion_id": seed["id"],
                "title": seed["title"],
                "text": chunk,
                "chunk_idx": i,
                "source": seed.get("source", "unknown"),
                "created": seed.get("created", ""),
                "url": seed.get("url", ""),
            },
            "vector": vector
        })

    weaviate_request("POST", "/batch/objects", {"objects": objects})
    print(f"    ✓ Upserted {len(objects)} chunks.")


# ── Query ────────────────────────────────────────────────────────────────────
def query_related(query_text, top_k=5):
    """Find the top-k most related seeds for a query string."""
    vector = embed_query(query_text)
    gql = {
        "query": f"""
        {{
          Get {{
            {WEAVIATE_CLASS}(
              nearVector: {{ vector: {json.dumps(vector)} }}
              limit: {top_k}
            ) {{
              notion_id
              title
              text
              source
              created
              url
              _additional {{ distance }}
            }}
          }}
        }}
        """
    }
    result = weaviate_request("POST", "/graphql", gql)
    hits = result.get("data", {}).get("Get", {}).get(WEAVIATE_CLASS, [])
    return hits


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Weaviate <-> Notion Idea Garden sync")
    parser.add_argument("--sync",  action="store_true", help="Sync Notion into Weaviate")
    parser.add_argument("--query", type=str, help="Query text to find related seeds")
    parser.add_argument("--top-k", type=int, default=5, help="Number of results to return")
    args = parser.parse_args()

    if not args.sync and not args.query:
        parser.print_help()
        sys.exit(0)

    if args.sync:
        print("=== Syncing Notion -> Weaviate ===")
        ensure_schema()

        print("\n[1] Fetching Idea Garden...")
        idea_seeds = fetch_idea_garden_seeds()
        for seed in idea_seeds:
            upsert_seed(seed)

        print("\n[2] Fetching Parking Lot entries...")
        lot_seeds = fetch_parking_lot_entries()
        for seed in lot_seeds:
            upsert_seed(seed)

        print("\n[3] Fetching LLM System Patterns 2026...")
        pattern_seeds = fetch_llm_patterns()
        for seed in pattern_seeds:
            upsert_seed(seed)

        print("\n[4] Fetching Enterprise AI Digests...")
        digest_seeds = fetch_enterprise_digests(max_entries=10)
        for seed in digest_seeds:
            upsert_seed(seed)
        print(f"  ✓ {len(digest_seeds)} digest entries processed.")

        print("\n[5] Fetching Linke Tree entries...")
        linke_seeds = fetch_linke_tree()
        for seed in linke_seeds:
            upsert_seed(seed)
        print(f"  ✓ {len(linke_seeds)} linke tree entries processed.")

        print("\n[6] Fetching CronJob Logs...")
        cron_seeds = fetch_cron_logs()
        for seed in cron_seeds:
            upsert_seed(seed)
        print(f"  ✓ {len(cron_seeds)} cron log entries processed.")

        total = (len(idea_seeds) + len(lot_seeds) + len(pattern_seeds) +
                 len(digest_seeds) + len(linke_seeds) + len(cron_seeds))
        print(f"\n✓ Sync complete. {total} documents processed.")

    if args.query:
        print(f"\n=== Querying: '{args.query[:80]}' ===")
        hits = query_related(args.query, top_k=args.top_k)
        if not hits:
            print("No related seeds found.")
            return

        results = []
        for i, hit in enumerate(hits, 1):
            dist = hit.get("_additional", {}).get("distance", 0)
            score = round(1 - dist, 3)
            entry = {
                "rank": i,
                "title": hit["title"],
                "source": hit["source"],
                "created": hit.get("created", ""),
                "url": hit["url"],
                "score": score,
                "excerpt": hit["text"][:300]
            }
            results.append(entry)
            print(f"\n#{i} [{score:.3f}] {hit['title']} ({hit['source']})")
            print(f"     {hit['text'][:200]}...")
            print(f"     {hit['url']}")

        # Also emit clean JSON for skill consumption
        print("\n\n=== JSON OUTPUT ===")
        print(json.dumps({"query": args.query, "results": results}, indent=2, ensure_ascii=False))



def fetch_enterprise_digests(max_entries=10):
    """Fetch recent Enterprise AI Digest entries from Notion."""
    # Find the digest DB
    req = urllib.request.Request(
        'https://api.notion.com/v1/search',
        data=json.dumps({'query': 'Enterprise AI Research Logs', 'page_size': 5}).encode(),
        headers={'Authorization': f'Bearer {NOTION_API_KEY}', 'Notion-Version': NOTION_VERSION,
                 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
    db_id = None
    for item in res.get('results', []):
        if item.get('object') == 'database':
            db_id = item['id']
            break
    if not db_id:
        return []

    # Query recent entries
    res2 = notion_post(f'/databases/{db_id}/query', {
        'sorts': [{'timestamp': 'created_time', 'direction': 'descending'}],
        'page_size': max_entries
    })
    seeds = []
    for page in res2.get('results', []):
        pid = page['id']
        title_prop = page['properties'].get('Name', {}).get('title', [])
        title = ''.join(x['plain_text'] for x in title_prop) or 'Untitled Digest'
        created = page.get('created_time', '')[:10]
        text = extract_text_from_blocks(pid)
        if text.strip():
            seeds.append({
                'id': pid, 'title': title, 'text': text,
                'source': 'enterprise_digest', 'created': created,
                'url': f'https://www.notion.so/{pid.replace("-","")}'
            })
    return seeds

def fetch_cron_logs():
    """Fetch entries from the CronJob Knowledge Base."""
    res = notion_post(f"/databases/{CRON_LOGS_DB_ID}/query", {
        "sorts": [{"timestamp": "created_time", "direction": "descending"}],
        "page_size": 50
    })
    logs = []
    for page in res.get("results", []):
        pid = page["id"]
        # Job Name is title property
        title_prop = page["properties"].get("Job Name", {}).get("title", [])
        job_name = "".join(x["plain_text"] for x in title_prop) or "Untitled Job"
        created = page.get("created_time", "")[:10]
        # Output rich_text
        output_prop = page["properties"].get("Output", {})
        output_text = ""
        if output_prop.get("type") == "rich_text":
            output_text = "".join(x.get("plain_text", "") for x in output_prop.get("rich_text", []))
        # Combine into seed-like structure
        title = f"Cron: {job_name}"
        full_text = f"Job: {job_name}\nOutput:\n{output_text}"
        logs.append({
            "id": pid,
            "title": title,
            "text": full_text,
            "source": "cron_log",
            "created": created,
            "url": f"https://www.notion.so/{pid.replace('-','')}"
        })
    return logs


def fetch_linke_tree():
    """Fetch entries from the Linke Tree database."""
    res = notion_post(f"/databases/{LINK_TREE_DB_ID}/query", {
        "sorts": [{"property": "Date Added", "direction": "descending"}],
        "page_size": 20
    })
    items = []
    for page in res.get("results", []):
        pid = page["id"]
        # Title is title property
        title_prop = page["properties"].get("Title", {}).get("title", [])
        title = "".join(x["plain_text"] for x in title_prop) or "Untitled"
        created = page.get("created_time", "")[:10]
        # URL
        url_prop = page["properties"].get("URL", {})
        url = url_prop.get("url", "")
        # Key Insights
        insights_prop = page["properties"].get("Key Insights", {})
        insights = ""
        if insights_prop.get("type") == "rich_text":
            insights = "".join(x.get("plain_text", "") for x in insights_prop.get("rich_text", []))
        full_text = f"Title: {title}\nURL: {url}\nInsights:\n{insights}"
        items.append({
            "id": pid,
            "title": f"Link: {title}",
            "text": full_text,
            "source": "linke_tree",
            "created": created,
            "url": url or f"https://www.notion.so/{pid.replace('-','')}"
        })
    return items


if __name__ == "__main__":
    main()
