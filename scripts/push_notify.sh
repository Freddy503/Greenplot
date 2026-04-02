#!/bin/bash
# Queue push notification for PWA
# Usage: ./push_notify.sh "Title" "Body" "/url"

TITLE="${1:-Greenplot}"
BODY="${2:-You have a new notification}"
URL="${3:-/chat}"

# Queue notification via API
curl -s -X POST 'https://seedify-six.vercel.app/api/push/notifications' \
  -H 'Content-Type: application/json' \
  -d "{\"title\":\"$TITLE\",\"body\":\"$BODY\",\"url\":\"$URL\"}" \
  --max-time 5 2>/dev/null &

exit 0
