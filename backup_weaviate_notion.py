#!/usr/bin/env python3
"""
backup_weaviate_notion.py
Daily backups: Weaviate objects + Notion export.
Add to cron: 0 2 * * * /usr/bin/python3 /root/.openclaw/workspace/backup_weaviate_notion.py
"""

import os, sys, json, datetime, subprocess, urllib.request

BACKUP_DIR = "/root/.openclaw/workspace/backups"
WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://localhost:8080")
NOTION_KEY = open(os.path.expanduser("~/.config/notion/api_key")).read().strip()
NOTION_VERSION = "2022-06-28"

os.makedirs(BACKUP_DIR, exist_ok=True)
today = datetime.date.today().isoformat()

def backup_weaviate():
    out_path = os.path.join(BACKUP_DIR, f"weaviate_{today}.json")
    if os.path.exists(out_path):
        print(f"Weaviate backup {out_path} exists, skipping...")
        return
    
    print(f"Backing up Weaviate to {out_path}...")
    # Fetch all IdeaSeed objects with pagination (including enrichment fields)
    all_objects = []
    offset = 0
    limit = 1000
    while True:
        gql = {
            "query": f"""{{
              Get {{
                IdeaSeed(
                  limit: {limit}
                  offset: {offset}
                ) {{
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
                }}
              }}
            }}"""
        }
        try:
            req = urllib.request.Request(
                f"{WEAVIATE_URL}/v1/graphql",
                data=json.dumps(gql).encode(),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                res = json.loads(r.read())
            batch = res.get("data", {}).get("Get", {}).get("IdeaSeed", [])
            if not batch:
                break
            all_objects.extend(batch)
            if len(batch) < limit:
                break
            offset += limit
        except Exception as e:
            print(f"Error fetching Weaviate data: {e}")
            return
    
    with open(out_path, "w") as f:
        json.dump({
            "backup_date": today,
            "object_count": len(all_objects),
            "objects": all_objects
        }, f, indent=2)
    print(f"✓ Weaviate backup complete: {len(all_objects)} objects")

def backup_notion():
    # We already have Notion data via API; just export DB lists as JSON manifests
    # This is lightweight; full export would be heavy. Instead, we note that Notion is source-of-truth
    manifest_path = os.path.join(BACKUP_DIR, f"notion_manifest_{today}.txt")
    with open(manifest_path, "w") as f:
        f.write(f"Backup date: {today}\n")
        f.write("Notion remains source-of-truth. Backup strategy: rely on Notion's version history.\n")
        f.write("If needed, use Notion API to export specific DBs.\n")
    print(f"✓ Notion manifest written to {manifest_path}")

def backup_usage():
    """Backup ApiCall usage data."""
    out_path = os.path.join(BACKUP_DIR, f"usage_{today}.json")
    if os.path.exists(out_path):
        print(f"Usage backup {out_path} exists, skipping...")
        return

    gql = {
        "query": """{
          Get {
            ApiCall(limit: 10000) {
              user_id tenant_id model endpoint tokens_in tokens_out cost_usd latency_ms status timestamp source
            }
          }
        }"""
    }
    try:
        req = urllib.request.Request(
            f"{WEAVIATE_URL}/v1/graphql",
            data=json.dumps(gql).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.loads(r.read())
        calls = res.get("data", {}).get("Get", {}).get("ApiCall", [])
        with open(out_path, "w") as f:
            json.dump({"backup_date": today, "call_count": len(calls), "calls": calls}, f, indent=2)
        print(f"✓ Usage backup complete: {len(calls)} records")
    except Exception as e:
        print(f"Usage backup skipped: {e}")

def prune_old_backups(keep_days=30):
    cutoff = datetime.date.today() - datetime.timedelta(days=keep_days)
    for filename in os.listdir(BACKUP_DIR):
        if filename.startswith("weaviate_") and filename.endswith(".json"):
            file_date_str = filename.split("_")[1].split(".")[0]
            try:
                file_date = datetime.date.fromisoformat(file_date_str)
                if file_date < cutoff:
                    os.remove(os.path.join(BACKUP_DIR, filename))
                    print(f"Pruned old backup: {filename}")
            except:
                pass

def main():
    print(f"=== Backup {today} ===")
    backup_weaviate()
    backup_notion()
    backup_usage()
    prune_old_backups()
    print("Backup complete.")

if __name__ == "__main__":
    main()
