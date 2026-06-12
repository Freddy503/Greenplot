#!/usr/bin/env bash
# backup.sh — nightly Greenplot backup. Run ON THE SERVER (where Docker runs).
#
# Captures everything stateful:
#   • Postgres (full pg_dump)          — users, seeds, specs, connections, usage
#   • Weaviate volume (tar)            — embeddings, wiki articles, paper chunks
#   • Data files                       — push subscriptions, /root/.openclaw/wiki
#   • openclaw-api/.env                — secrets (the backup dir must stay private)
#
# Keeps the last 14 archives locally; if an rclone remote named "gp-backup"
# exists, also syncs off-site (B2/S3/Drive — `rclone config` once).
#
# Install (on the server):
#   chmod +x /root/.openclaw/workspace/scripts/backup.sh
#   crontab -e →  30 3 * * * /root/.openclaw/workspace/scripts/backup.sh >> /var/log/gp-backup.log 2>&1
#
# Restore notes at the bottom of this file.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
WORKSPACE="${WORKSPACE:-/root/.openclaw/workspace}"
STAMP="$(date +%Y%m%d-%H%M)"
WORK="$BACKUP_DIR/gp-$STAMP"
KEEP=14

mkdir -p "$WORK"
echo "[backup] $STAMP starting → $WORK"

# 1. Postgres — full dump through the running container
docker exec openclaw-db pg_dump -U postgres openclaw | gzip > "$WORK/postgres.sql.gz"
echo "[backup] postgres: $(du -h "$WORK/postgres.sql.gz" | cut -f1)"

# 2. Weaviate — tar the named volume (consistent enough for nightly cold copy)
WEAVIATE_VOLUME="$(docker inspect openclaw-weaviate --format '{{ range .Mounts }}{{ if eq .Destination "/var/lib/weaviate" }}{{ .Name }}{{ end }}{{ end }}' 2>/dev/null || true)"
if [ -n "$WEAVIATE_VOLUME" ]; then
  docker run --rm -v "$WEAVIATE_VOLUME":/data -v "$WORK":/backup alpine \
    tar czf /backup/weaviate.tar.gz -C /data .
  echo "[backup] weaviate: $(du -h "$WORK/weaviate.tar.gz" | cut -f1)"
else
  echo "[backup] WARNING: weaviate volume not found — skipped"
fi

# 3. Data files: push subscriptions + wiki markdown
[ -d "$WORKSPACE/openclaw-api/data" ] && tar czf "$WORK/api-data.tar.gz" -C "$WORKSPACE/openclaw-api" data || true
[ -d /root/.openclaw/wiki ] && tar czf "$WORK/wiki.tar.gz" -C /root/.openclaw wiki || true

# 4. Secrets (env) — backup dir must be root-only
[ -f "$WORKSPACE/openclaw-api/.env" ] && cp "$WORKSPACE/openclaw-api/.env" "$WORK/env.backup" && chmod 600 "$WORK/env.backup"

# 5. Single archive + rotation
tar czf "$BACKUP_DIR/greenplot-$STAMP.tar.gz" -C "$WORK" .
rm -rf "$WORK"
chmod 600 "$BACKUP_DIR/greenplot-$STAMP.tar.gz"
ls -1t "$BACKUP_DIR"/greenplot-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "[backup] archive: $BACKUP_DIR/greenplot-$STAMP.tar.gz ($(du -h "$BACKUP_DIR/greenplot-$STAMP.tar.gz" | cut -f1)), keeping last $KEEP"

# 6. Off-site (optional): any rclone remote named gp-backup
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -q '^gp-backup:'; then
  rclone copy "$BACKUP_DIR/greenplot-$STAMP.tar.gz" gp-backup:greenplot-backups/ --quiet
  echo "[backup] synced off-site (gp-backup:greenplot-backups/)"
else
  echo "[backup] no rclone remote 'gp-backup' — local only (configure one for off-site safety!)"
fi

echo "[backup] done"

# ── Restore ───────────────────────────────────────────────────────────────────
# tar xzf greenplot-<stamp>.tar.gz -C /tmp/restore
# Postgres:  zcat /tmp/restore/postgres.sql.gz | docker exec -i openclaw-db psql -U postgres openclaw
# Weaviate:  docker compose stop weaviate
#            docker run --rm -v <volume>:/data -v /tmp/restore:/backup alpine \
#              sh -c "rm -rf /data/* && tar xzf /backup/weaviate.tar.gz -C /data"
#            docker compose start weaviate
# Data:      tar xzf /tmp/restore/api-data.tar.gz -C /root/.openclaw/workspace/openclaw-api
#            tar xzf /tmp/restore/wiki.tar.gz -C /root/.openclaw
# Env:       cp /tmp/restore/env.backup /root/.openclaw/workspace/openclaw-api/.env
# Then:      cd /root/.openclaw/workspace/openclaw-api && docker compose up -d --build
