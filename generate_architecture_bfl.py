#!/usr/bin/env python3
import os, json, time, urllib.request

BFL_API_KEY = open(os.path.expanduser('~/.config/bfl/api_key')).read().strip()

prompt = (
    "Technical architecture diagram for a Second Brain knowledge management system. "
    "Components: User messages via Telegram → OpenClaw Bot → OpenClaw Agent with skills layer → Cron jobs (Morning Spark, Daily Briefing, Weekly Review, Biweekly Challenge, Backups) → Skills that connect to: "
    "1) Notion databases (Parking Lot, Idea Garden, Journal, Linke Tree, Digests, CronJob KB), "
    "2) Weaviate vector database for semantic search, "
    "3) Black Forest Labs for image generation, "
    "4) NVIDIA NIM for embeddings. "
    "Also show Odoo CRM skill as optional connector. "
    "Use clean boxes and arrows, blue and green colors, modern tech style. Include labels for each component. Professional enterprise architecture."
)
width = 1024
height = 768

# Submit
req = urllib.request.Request(
    'https://api.bfl.ai/v1/flux-dev',
    data=json.dumps({'prompt': prompt, 'width': width, 'height': height}).encode(),
    headers={'x-key': BFL_API_KEY, 'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req, timeout=30) as r:
    res = json.loads(r.read())
polling_url = res.get('polling_url')
if not polling_url:
    raise Exception("No polling URL from BFL")

# Poll
image_url = None
for _ in range(30):
    time.sleep(3)
    poll_req = urllib.request.Request(polling_url, headers={'x-key': BFL_API_KEY})
    with urllib.request.urlopen(poll_req, timeout=30) as r:
        poll = json.loads(r.read())
    if poll.get('status') == 'Ready':
        image_url = poll.get('result', {}).get('sample')
        break
    elif poll.get('status') in ('Error', 'Failed', 'Request Moderated', 'Content Moderated'):
        raise Exception(f"BFL failed: {poll.get('status')}")

if not image_url:
    raise Exception("BFL timeout")

# Download
img_req = urllib.request.Request(image_url)
with urllib.request.urlopen(img_req, timeout=30) as r:
    img_data = r.read()

out_path = '/root/.openclaw/workspace/media/second_brain_architectu<RESEND_API_KEY>'
with open(out_path, 'wb') as f:
    f.write(img_data)
print(f"Saved to {out_path}")
