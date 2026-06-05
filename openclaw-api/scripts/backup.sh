#!/bin/bash
# Seedify daily backup — Postgres + Weaviate JSON export
# Runs via cron: 0 3 * * * /root/openclaw-api/scripts/backup.sh >> /var/log/seedify-backup.log 2>&1

set -e

BACKUP_DIR="/root/backups/seedify"
DATE=$(date +%Y-%m-%d)
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR/postgres" "$BACKUP_DIR/weaviate"

echo "[$(date)] Starting backup..."

# ── Postgres ──────────────────────────────────────────────────
PG_FILE="$BACKUP_DIR/postgres/openclaw-$DATE.sql.gz"
docker exec openclaw-db pg_dump -U postgres openclaw | gzip > "$PG_FILE"
echo "[$(date)] Postgres backup: $PG_FILE ($(du -sh "$PG_FILE" | cut -f1))"

# ── Weaviate JSON export ───────────────────────────────────────
WEAVIATE_FILE="$BACKUP_DIR/weaviate/weaviate-$DATE.json.gz"
docker exec openclaw-api python3 - << 'PYEOF' | gzip > "$WEAVIATE_FILE"
import json
from app.weaviate_client import weaviate_client

export = {}
for class_name in ["IdeaSeed", "Link", "WikiArticle", "GreenPlotNode"]:
    try:
        result = weaviate_client.client.query.get(
            class_name,
            ["tenant_id"]
        ).with_additional("id").with_limit(10000).do()
        objects = result.get("data", {}).get("Get", {}).get(class_name, []) or []
        export[class_name] = objects
        print(f"  {class_name}: {len(objects)} objects", flush=True)
    except Exception as e:
        print(f"  {class_name}: FAILED — {e}", flush=True)
        export[class_name] = []

print(json.dumps(export))
PYEOF
echo "[$(date)] Weaviate backup: $WEAVIATE_FILE ($(du -sh "$WEAVIATE_FILE" | cut -f1))"

# ── Redis RDB snapshot ────────────────────────────────────────
REDIS_FILE="$BACKUP_DIR/redis-$DATE.rdb"
docker exec openclaw-redis redis-cli BGSAVE
sleep 3
docker cp openclaw-redis:/data/dump.rdb "$REDIS_FILE" 2>/dev/null || true
echo "[$(date)] Redis snapshot: $REDIS_FILE"

# ── Prune old backups ─────────────────────────────────────────
find "$BACKUP_DIR" -name "*.gz" -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -name "*.rdb" -mtime +$KEEP_DAYS -delete
echo "[$(date)] Pruned backups older than $KEEP_DAYS days"

echo "[$(date)] Backup complete ✅"
PYEOF
