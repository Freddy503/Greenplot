#!/bin/bash
# Queue push notification for PWA (dual delivery: Next.js + Backend)
# Usage: ./push_notify.sh "Title" "Body" "/url"

TITLE="${1:-Greenplot}"
BODY="${2:-You have a new notification}"
URL="${3:-/chat}"

# 1. Queue to Next.js frontend (in-memory, fast)
curl -s -X POST 'https://seedify-six.vercel.app/api/push/notifications' \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"$TITLE\",\"body\":\"$BODY\",\"url\":\"$URL\"}" \
  --max-time 5 2>/dev/null &

# 2. Queue to backend (persistent, polled by PWA)
curl -s -X POST 'https://api.greenplot.ink/api/v1/push/send' \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"$TITLE\",\"body\":\"$BODY\",\"url\":\"$URL\"}" \
  --max-time 5 2>/dev/null &

wait
exit 0
