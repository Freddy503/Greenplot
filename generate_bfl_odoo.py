#!/usr/bin/env python3
import os, json, time, urllib.request, sys

BFL_API_KEY = open(os.path.expanduser('~/.config/bfl/api_key')).read().strip()

prompt = (
    "Technical architecture diagram, clean vector style. "
    "Components: Telegram/WhatsApp user messages -> OpenClaw Bot -> OpenClaw Agent with Skills layer -> "
    "Odoo CRM Skill (Python script) -> Odoo XML-RPC/JSON-RPC API -> Odoo Database (PostgreSQL). "
    "Also show Notion integration for logging, and Weaviate for semantic search. "
    "Use blue and green colors, clear labels, simple boxes and arrows. "
    "Minimalist, professional, enterprise architecture diagram."
)
width = 1024
height = 768

# Submit generation request
req = urllib.request.Request(
    'https://api.bfl.ai/v1/flux-dev',
    data=json.dumps({'prompt': prompt, 'width': width, 'height': height}).encode(),
    headers={'x-key': BFL_API_KEY, 'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req, timeout=30) as r:
    res = json.loads(r.read())
polling_url = res.get('polling_url')
if not polling_url:
    raise Exception("No polling URL returned from BFL")

print(f"Polling: {polling_url}", file=sys.stderr)

# Poll for result (up to 90 seconds)
image_url = None
for _ in range(30):
    time.sleep(3)
    try:
        poll_req = urllib.request.Request(
            polling_url,
            headers={'x-key': BFL_API_KEY, 'Accept': 'application/json'}
        )
        with urllib.request.urlopen(poll_req, timeout=30) as r:
            poll = json.loads(r.read())
        status = poll.get('status')
        print(f"Status: {status}", file=sys.stderr)
        if status == 'Ready':
            image_url = poll.get('result', {}).get('sample')
            break
        elif status in ('Error', 'Failed', 'Request Moderated', 'Content Moderated'):
            raise Exception(f"BFL generation failed: {status}")
    except Exception as e:
        print(f"Poll error: {e}", file=sys.stderr)
        continue

if not image_url:
    raise Exception("BFL image generation timeout or no result")

# Download image
print(f"Image URL: {image_url}", file=sys.stderr)
img_req = urllib.request.Request(image_url)
with urllib.request.urlopen(img_req, timeout=30) as r:
    img_data = r.read()

out_path = '/root/.openclaw/workspace/media/odoo_architecture_bfl.jpg'
with open(out_path, 'wb') as f:
    f.write(img_data)
print(f"Saved to {out_path}", file=sys.stderr)
print("DONE")
