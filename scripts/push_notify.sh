#!/bin/bash
# Send push notification to PWA
# Usage: ./push_notify.sh "Title" "Body" "/url"

TITLE="${1:-Greenplot}"
BODY="${2:-You have a new notification}"
URL="${3:-/chat}"

SUB_FILE="/root/.openclaw/workspace/data/push_subscription.json"
if [ ! -f "$SUB_FILE" ]; then
  exit 0
fi

SUB=$(cat "$SUB_FILE")
if [ -z "$SUB" ]; then
  exit 0
fi

curl -s -X POST 'https://seedify-six.vercel.app/api/push/send' \
  -H 'Content-Type: application/json' \
  -d "{\"subscription\":$SUB,\"title\":\"$TITLE\",\"body\":\"$BODY\",\"url\":\"$URL\"}" \
  --max-time 5 2>/dev/null &

exit 0
