#!/usr/bin/env python3
import os, json, time, urllib.request

BFL_API_KEY = open(os.path.expanduser('~/.config/bfl/api_key')).read().strip()

prompt = (
    "Technical architecture diagram, clean vector style, white background, rounded boxes with subtle shadows, connecting arrows, professional blues and greens, crisp typography. "
    "Second Brain system: User via Telegram -> OpenClaw Bot -> OpenClaw Agent (Skills) -> Cron workflows: Morning Spark, Daily Briefing, Weekly Eval, Biweekly Challenge, Backups, Health Check. "
    "Skills connect to: Notion (Parking Lot, Idea Garden, Journal, Linke Tree, Digests), Weaviate, NVIDIA NIM, Black Forest Labs, OpenRouter, optional Odoo CRM skill. "
    "Flat modern style, no gradients, enterprise diagram."
)
width = 1024
height = 768

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

img_req = urllib.request.Request(image_url)
with urllib.request.urlopen(img_req, timeout=30) as r:
    img_data = r.read()

out_path = '/root/.openclaw/workspace/media/second_brain_architecture_v1.jpg'
with open(out_path, 'wb') as f:
    f.write(img_data)
print(f"Saved to {out_path}")
