"""
restore_weaviate.py — Restore Weaviate data from a JSON backup.

Usage:
    docker exec openclaw-api python3 /app/scripts/restore_weaviate.py /path/to/weaviate-YYYY-MM-DD.json

If restoring a .json.gz, decompress first:
    gunzip weaviate-2026-06-04.json.gz
    docker cp weaviate-2026-06-04.json openclaw-api:/tmp/
    docker exec openclaw-api python3 /app/scripts/restore_weaviate.py /tmp/weaviate-2026-06-04.json
"""
import sys
import json
from app.weaviate_client import weaviate_client

if len(sys.argv) < 2:
    print("Usage: restore_weaviate.py <backup.json>")
    sys.exit(1)

with open(sys.argv[1]) as f:
    data = json.load(f)

for class_name, objects in data.items():
    if not objects:
        print(f"{class_name}: empty, skipping")
        continue
    print(f"{class_name}: restoring {len(objects)} objects...")
    ok = err = 0
    for obj in objects:
        try:
            obj_id = obj.get("_additional", {}).get("id")
            payload = {k: v for k, v in obj.items() if k != "_additional"}
            weaviate_client.client.data_object.create(
                class_name=class_name,
                data_object=payload,
                uuid=obj_id,
            )
            ok += 1
        except Exception as e:
            err += 1
    print(f"  ✅ {ok} restored, ❌ {err} errors")

print("Restore complete.")
