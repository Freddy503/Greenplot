#!/usr/bin/env python3
"""
Sync IMPLEMENTATION_PLAN.md to Weaviate via REST API (/v1/objects).
Uses OpenAI embedding (1024 dim) compatible with IdeaSeed class.
"""

import os, json, httpx, datetime

WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://localhost:8080")
PLAN_PATH = "/root/.openclaw/workspace/IMPLEMENTATION_PLAN.md"

def get_embedding_openai(text):
    resp = httpx.post(
        "https://api.openai.com/v1/embeddings",
        json={
            "input": text,
            "model": "text-embedding-3-small",
            "dimensions": 1024
        },
        headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}"},
        timeout=60
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]

def main():
    # Read plan
    with open(PLAN_PATH, 'r') as f:
        content = f.read()

    # Generate embedding
    print("Generating embedding...")
    try:
        embedding = get_embedding_openai(content)
        print(f"Embedding generated, dim={len(embedding)}")
    except Exception as e:
        print(f"Failed to generate embedding: {e}")
        return

    # Prepare object
    obj = {
        "class": "IdeaSeed",
        "properties": {
            "title": "Implementation Plan: AI Second Brain MVP",
            "text": content,
            "source": "plan",
            "chunk_idx": 0,
            "created": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        },
        "vector": embedding
    }

    # Send to Weaviate
    resp = httpx.post(
        f"{WEAVIATE_URL}/v1/objects",
        json=obj,
        timeout=60
    )
    if resp.status_code not in (200, 201):
        print("Weaviate error:", resp.status_code, resp.text)
        resp.raise_for_status()
    result = resp.json()
    # Response includes id
    obj_id = result.get("id")
    print(f"✅ Implementation plan synced to Weaviate (ID: {obj_id})")

if __name__ == "__main__":
    main()
