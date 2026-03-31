#!/usr/bin/env python3
"""
pipeline.py — Main enrichment pipeline orchestrator.

Flow for each seed:
  1. Chunk text (paragraph-aware, not fixed-size)
  2. Extract entities + tags (KERNEL-style via LLM)
  3. Find backlinks (vector search + LLM relevance)
  4. Update Weaviate object with enriched metadata
  5. Re-index chunks with richer context

All data in Weaviate. No Postgres dependency.
"""

import json
import os
import sys
import urllib.request
import urllib.error
import datetime

# Local modules
sys.path.insert(0, os.path.dirname(__file__))
from chunker import chunk_text, format_chunks_for_embedding
from extractor import extract
from backlinker import find_backlinks

WEAVIATE_URL = os.environ.get("WEAVIATE_URL", "http://localhost:8080")
WEAVIATE_CLASS = "IdeaSeed"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE = "https://openrouter.ai/api/v1"
EMBED_MODEL = "openai/text-embedding-ada-002"
ENRICHMENT_VERSION = 1


def weaviate_request(method, path, data=None):
    url = f"{WEAVIATE_URL}/v1{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            if r.length == 0 or r.length is None:
                return {}
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        raise RuntimeError(f"Weaviate {method} {path} -> {e.code}: {error_body}")


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings via OpenRouter."""
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    payload = {
        "input": texts,
        "model": EMBED_MODEL,
        "truncate": "END"
    }
    req = urllib.request.Request(
        f"{OPENROUTER_BASE}/embeddings",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read())
    return [item["embedding"] for item in res["data"]]


def get_seed(notion_id: str) -> dict | None:
    """Fetch a seed from Weaviate by notion_id."""
    gql = """
    {
      Get {
        IdeaSeed(
          where: {
            operator: Equal
            path: ["notion_id"]
            valueText: "%s"
          }
          limit: 1
        ) {
          _additional { id }
          notion_id
          title
          text
          chunk_idx
          source
          created
          url
          summary
          tags
          entities
          backlinks
          domain
          energy
          status
          enrichment_version
          parent_id
          source_url
        }
      }
    }
    """ % notion_id

    try:
        req = urllib.request.Request(
            f"{WEAVIATE_URL}/v1/graphql",
            data=json.dumps({"query": gql}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            res = json.loads(r.read())
        hits = res.get("data", {}).get("Get", {}).get("IdeaSeed", [])
        return hits[0] if hits else None
    except Exception as e:
        print(f"  ⚠ Failed to fetch seed: {e}", file=sys.stderr)
        return None


def delete_seed_chunks(notion_id: str):
    """Delete all chunks for a seed (before re-indexing). Waits for completion."""
    import time
    try:
        weaviate_request("POST", "/batch/objects/delete", {
            "match": {
                "class": WEAVIATE_CLASS,
                "where": {
                    "operator": "Equal",
                    "path": ["notion_id"],
                    "valueText": notion_id
                }
            },
            "dryRun": False,
            "output": "verbose"
        })
        # Wait for delete to propagate
        time.sleep(1)
    except Exception:
        pass


def upsert_enriched_chunks(seed: dict, extraction: dict, backlinks: list[dict]):
    """
    Re-index the seed as enriched chunks in Weaviate.
    Each chunk gets the full enrichment metadata.
    """
    notion_id = seed["notion_id"]
    title = seed["title"]
    text = seed["text"]
    source = seed.get("source", "unknown")
    created = seed.get("created", "")
    url = seed.get("url", "")

    # Chunk with semantic splitter
    chunks = chunk_text(text, source_title=title)
    formatted = format_chunks_for_embedding(chunks)

    if not formatted:
        print("  ⚠ No chunks generated", file=sys.stderr)
        return

    # Embed all chunks
    try:
        vectors = embed_texts(formatted)
    except Exception as e:
        print(f"  ⚠ Embedding failed: {e}", file=sys.stderr)
        return

    # Delete old chunks
    delete_seed_chunks(notion_id)

    # Insert enriched chunks
    objects = []
    backlinks_json = json.dumps(backlinks)
    entities_json = json.dumps(extraction.get("entities", []))
    tags_str = ", ".join(extraction.get("tags", []))

    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        obj = {
            "class": WEAVIATE_CLASS,
            "properties": {
                "notion_id": notion_id,
                "title": title,
                "text": chunk.text,
                "chunk_idx": chunk.index,
                "source": source,
                "created": created,
                "url": url,
                # Enrichment properties
                "summary": extraction.get("summary", ""),
                "tags": tags_str,
                "entities": entities_json,
                "backlinks": backlinks_json,
                "energy": extraction.get("energy", "Spark"),
                "status": "Growing",
                "enrichment_version": ENRICHMENT_VERSION,
                "parent_id": notion_id,
                "domain": extraction.get("domain", "agentic-ai"),
                "source_url": url,
            },
            "vector": vector
        }
        objects.append(obj)

    # Batch insert
    try:
        weaviate_request("POST", "/batch/objects", {"objects": objects})
        print(f"  ✓ Upserted {len(objects)} enriched chunks")
    except Exception as e:
        print(f"  ⚠ Batch insert failed: {e}", file=sys.stderr)


def enrich_seed(notion_id: str, dry_run: bool = False) -> dict:
    """
    Main enrichment pipeline for a single seed.

    1. Fetch seed from Weaviate
    2. Chunk text (semantic)
    3. Extract entities + tags
    4. Find backlinks
    5. Re-index with enrichment

    Returns: {notion_id, title, chunks, tags, entities, backlinks, status}
    """
    print(f"\n{'='*60}")
    print(f"Enriching: {notion_id}")
    print(f"{'='*60}")

    # 1. Fetch
    seed = get_seed(notion_id)
    if not seed:
        print(f"  ✗ Seed not found: {notion_id}")
        return {"notion_id": notion_id, "status": "not_found"}

    title = seed.get("title", "Untitled")
    text = seed.get("text", "")
    print(f"  Title: {title}")
    print(f"  Text length: {len(text)} chars")

    # Skip if already enriched at current version
    current_version = seed.get("enrichment_version")
    if current_version and int(current_version) >= ENRICHMENT_VERSION:
        print(f"  ⊘ Already enriched (version {current_version}), skipping")
        return {"notion_id": notion_id, "title": title, "status": "already_enriched"}

    # 2. Chunk
    chunks = chunk_text(text, source_title=title)
    print(f"  Chunks: {len(chunks)} (semantic)")

    # 3. Extract (use first 2 chunks for context)
    full_text = " ".join(c.text for c in chunks[:3])
    extraction = extract(full_text[:2000])
    print(f"  Tags: {extraction.get('tags', [])}")
    print(f"  Domain: {extraction.get('domain', '?')}")
    print(f"  Entities: {len(extraction.get('entities', []))}")

    # 4. Backlink
    summary = extraction.get("summary", "")
    backlinks = find_backlinks(notion_id, title, summary, full_text)
    print(f"  Backlinks: {len(backlinks)}")

    if dry_run:
        print("  ⊘ Dry run — not writing to Weaviate")
        return {
            "notion_id": notion_id,
            "title": title,
            "chunks": len(chunks),
            "extraction": extraction,
            "backlinks": backlinks,
            "status": "dry_run"
        }

    # 5. Re-index
    upsert_enriched_chunks(seed, extraction, backlinks)

    result = {
        "notion_id": notion_id,
        "title": title,
        "chunks": len(chunks),
        "tags": extraction.get("tags", []),
        "entities": extraction.get("entities", []),
        "backlinks": len(backlinks),
        "domain": extraction.get("domain", ""),
        "status": "enriched"
    }
    print(f"\n  ✓ Done: {json.dumps(result, ensure_ascii=False)}")
    return result


def enrich_all(limit: int = 0, dry_run: bool = False) -> list[dict]:
    """
    Enrich all seeds in Weaviate that haven't been enriched yet.
    """
    # Fetch all unique seeds (grouped by notion_id)
    gql = """
    {
      Get {
        IdeaSeed {
          notion_id
          enrichment_version
          _additional { id }
        }
      }
    }
    """
    try:
        req = urllib.request.Request(
            f"{WEAVIATE_URL}/v1/graphql",
            data=json.dumps({"query": gql}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            res = json.loads(r.read())
        hits = res.get("data", {}).get("Get", {}).get("IdeaSeed", [])
    except Exception as e:
        print(f"Failed to fetch seeds: {e}", file=sys.stderr)
        return []

    # Deduplicate by notion_id
    seen = set()
    to_enrich = []
    for hit in hits:
        nid = hit.get("notion_id", "")
        if not nid or nid in seen:
            continue
        seen.add(nid)
        version = hit.get("enrichment_version")
        if version is None or int(version) < ENRICHMENT_VERSION:
            to_enrich.append(nid)

    print(f"Found {len(to_enrich)} seeds needing enrichment (out of {len(seen)} total)")

    if limit > 0:
        to_enrich = to_enrich[:limit]

    results = []
    for i, nid in enumerate(to_enrich, 1):
        print(f"\n[{i}/{len(to_enrich)}]", end="")
        try:
            result = enrich_seed(nid, dry_run=dry_run)
            results.append(result)
        except Exception as e:
            print(f"  ✗ Error enriching {nid}: {e}", file=sys.stderr)
            results.append({"notion_id": nid, "status": f"error: {e}"})

    # Summary
    enriched = sum(1 for r in results if r["status"] == "enriched")
    skipped = sum(1 for r in results if r["status"] == "already_enriched")
    errors = sum(1 for r in results if r["status"].startswith("error"))
    print(f"\n{'='*60}")
    print(f"Enrichment complete: {enriched} enriched, {skipped} skipped, {errors} errors")
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Idea Garden enrichment pipeline")
    parser.add_argument("--notion-id", help="Enrich a specific seed")
    parser.add_argument("--all", action="store_true", help="Enrich all unenriched seeds")
    parser.add_argument("--limit", type=int, default=0, help="Max seeds to process")
    parser.add_argument("--dry-run", action="store_true", help="Don't write to Weaviate")
    args = parser.parse_args()

    if args.notion_id:
        enrich_seed(args.notion_id, dry_run=args.dry_run)
    elif args.all:
        enrich_all(limit=args.limit, dry_run=args.dry_run)
    else:
        parser.print_help()
