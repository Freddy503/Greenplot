#!/usr/bin/env python3
"""
schema.py — Weaviate schema management for enrichment pipeline.

Adds enrichment properties to the existing IdeaSeed class:
  - summary: LLM-generated 2-sentence summary
  - tags: comma-separated categorical tags
  - entities: JSON array of extracted entities
  - backlinks: JSON array of related seed IDs with relevance scores
  - energy: energy classification (Spark/Hot/Flow/Cool)
  - status: lifecycle state (Seedling/Growing/Harvested)
  - enrichment_version: schema version for migration tracking
  - parent_id: notion_id of the parent seed (for chunks)
  - domain: primary domain classification
  - source_url: original source URL for citations
"""

import json
import urllib.request
import urllib.error
import os
import sys

WEAVIATE_URL = os.environ.get("WEAVIATE_URL", "http://localhost:8080")
WEAVIATE_CLASS = "IdeaSeed"

# New properties to add (only if missing)
ENRICHMENT_PROPERTIES = [
    {
        "name": "summary",
        "dataType": ["text"],
        "description": "LLM-generated 2-sentence summary of the seed",
        "indexSearchable": True,
        "indexFilterable": True,
        "tokenization": "word"
    },
    {
        "name": "tags",
        "dataType": ["text"],
        "description": "Comma-separated categorical tags (e.g. 'agentic-ai,rag,enterprise')",
        "indexSearchable": True,
        "indexFilterable": True,
        "tokenization": "word"
    },
    {
        "name": "entities",
        "dataType": ["text"],
        "description": "JSON array of extracted entities: [{name, type, confidence}]",
        "indexSearchable": True,
        "indexFilterable": False,
        "tokenization": "word"
    },
    {
        "name": "backlinks",
        "dataType": ["text"],
        "description": "JSON array of related seed IDs with relevance scores: [{notion_id, score, reason}]",
        "indexSearchable": False,
        "indexFilterable": False,
    },
    {
        "name": "energy",
        "dataType": ["text"],
        "description": "Energy classification: Spark, Hot, Flow, Cool",
        "indexSearchable": False,
        "indexFilterable": True,
        "tokenization": "field"
    },
    {
        "name": "status",
        "dataType": ["text"],
        "description": "Lifecycle state: Seedling, Growing, Harvested",
        "indexSearchable": False,
        "indexFilterable": True,
        "tokenization": "field"
    },
    {
        "name": "enrichment_version",
        "dataType": ["int"],
        "description": "Enrichment schema version (1 = initial enrichment)",
        "indexFilterable": True,
    },
    {
        "name": "parent_id",
        "dataType": ["text"],
        "description": "notion_id of the parent seed (for chunk linking)",
        "indexSearchable": False,
        "indexFilterable": True,
        "tokenization": "field"
    },
    {
        "name": "domain",
        "dataType": ["text"],
        "description": "Primary domain: agentic-ai, career, enterprise, systems, learning, creativity",
        "indexSearchable": True,
        "indexFilterable": True,
        "tokenization": "field"
    },
    {
        "name": "source_url",
        "dataType": ["text"],
        "description": "Original source URL for citations",
        "indexSearchable": False,
        "indexFilterable": True,
        "tokenization": "field"
    },
    {
        "name": "tenant_id",
        "dataType": ["text"],
        "description": "Owner tenant ID for multi-tenancy isolation",
        "indexSearchable": False,
        "indexFilterable": True,
        "tokenization": "field"
    },
]


def weaviate_request(method, path, data=None):
    """Make a request to the Weaviate REST API."""
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


def get_existing_properties():
    """Get current property names for the IdeaSeed class."""
    import time
    time.sleep(1)  # Weaviate may take a moment to register new properties
    schema = weaviate_request("GET", "/schema")
    for cls in schema.get("classes", []):
        if cls["class"] == WEAVIATE_CLASS:
            return {p["name"] for p in cls.get("properties", [])}
    return set()


def extend_schema():
    """Add missing enrichment properties to IdeaSeed class."""
    existing = get_existing_properties()
    added = 0

    for prop in ENRICHMENT_PROPERTIES:
        if prop["name"] in existing:
            print(f"  ✓ Property '{prop['name']}' already exists")
            continue

        # Weaviate 1.24: add property via PATCH /schema/{className}
        try:
            weaviate_request("POST", f"/schema/{WEAVIATE_CLASS}/properties", prop)
            print(f"  + Added property '{prop['name']}' ({prop['dataType'][0]})")
            added += 1
        except Exception as e:
            print(f"  ✗ Failed to add '{prop['name']}': {e}", file=sys.stderr)

    print(f"\nSchema update complete. {added} new properties added.")
    return added


def verify_schema():
    """Verify all enrichment properties exist."""
    existing = get_existing_properties()
    missing = []
    for prop in ENRICHMENT_PROPERTIES:
        if prop["name"] not in existing:
            missing.append(prop["name"])

    if missing:
        print(f"⚠ Missing properties: {', '.join(missing)}")
        return False

    print("✓ All enrichment properties present")
    return True


if __name__ == "__main__":
    print("=== Extending IdeaSeed schema ===")
    extend_schema()
    print("\n=== Verification ===")
    verify_schema()
