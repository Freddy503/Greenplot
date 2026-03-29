#!/usr/bin/env python3
"""
knowledge_audit.py
Weekly check: ensure Notion data is fully represented in Weaviate.
"""

import os, sys, json, urllib.request, datetime

NOTION_KEY = open(os.path.expanduser("~/.config/notion/api_key")).read().strip()
WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://localhost:8080")
NOTION_VERSION = "2022-06-28"

# DB IDs
IDEA_GARDEN_DB = "331fbc8d-40a5-816b-80e0-ea68ff4ba64d"
PARKING_LOT_DB = "331fbc8d-40a5-8119-bff8-fa81e339ed97"
JOURNAL_DB = "3866fe8b-57e0-4629-afc5-11776e8960dc"

def notion_count(db_id):
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    headers = {
        "Authorization": f"Bearer {NOTION_KEY}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
    }
    # paginate to get total
    all_pages = []
    next_cursor = None
    while True:
        data = {"page_size": 100}
        if next_cursor:
            data["start_cursor"] = next_cursor
        req = urllib.request.Request(url, data=json.dumps(data).encode(), headers=headers)
        with urllib.request.urlopen(req) as r:
            res = json.loads(r.read())
        all_pages.extend(res.get("results", []))
        next_cursor = res.get("next_cursor")
        if not res.get("has_more"):
            break
    return len(all_pages)

def weaviate_count():
    gql = {"query": "{ Get { IdeaSeed { meta { id } } } }"}
    req = urllib.request.Request(
        f"{WEAVIATE_URL}/v1/graphql",
        data=json.dumps(gql).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        res = json.loads(r.read())
    return len(res.get("data", {}).get("Get", {}).get("IdeaSeed", []))

def main():
    print("=== Knowledge Audit ===")
    notion_ig = notion_count(IDEA_GARDEN_DB)
    notion_pl = notion_count(PARKING_LOT_DB)
    notion_jr = notion_count(JOURNAL_DB)
    notion_total = notion_ig + notion_pl + notion_jr
    
    weaviate_total = weaviate_count()
    
    print(f"Notion: IdeaGarden={notion_ig}, ParkingLot={notion_pl}, Journal={notion_jr} → total {notion_total}")
    print(f"Weaviate: {weaviate_total} objects")
    
    if weaviate_total < notion_total * 0.9:  # allow chunking multiplicity
        print("WARNING: Weaviate seems to be missing data. Consider re-sync.")
        sys.exit(1)
    else:
        print("✓ Weaviate coverage looks good.")
        sys.exit(0)

if __name__ == "__main__":
    main()
