#!/usr/bin/env python3
import os, json, urllib.request

NOTION_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
OPENCLAW_PARENT_ID = '19231104-e27a-4ea3-888f-ae449d2076ae'

content = """# Onboarding Flow Specification

**Date**: 2026-03-29  
**Goal**: Seamless, delightful, green‑themed creative onboarding

---

## Steps

1. **Greet**: "Welcome! What should we call you?" → nickname input
2. **City**: "Where are you based?" → text input (for local context/weather)
3. **Interests**: "What topics excite you?" → multi‑select tags + free text
4. **Calendar**: "Connect your Google Calendar to sync events" → OAuth button (optional, skip allowed)
5. **Reinforcement Learning**: "Help improve OpenClaw by sharing your feedback" → toggle ON/OFF with short explanation
6. **Product concept**: Brief animated carousel or tooltip explaining "Your personal AI agent in your pocket for creative thinking"
7. **Waitlist unlock**: "Enter your access token" → single‑line input (validated against server)
8. **Wait page**: Animated screen: "Setting up your individual environment…" (green palette, seed growth animation)
9. **Landing**: Main chat interface

---

## Technical Requirements

- **Waitlist token system**:
  - Each invited user gets a unique token
  - Registration endpoint validates token before allowing account creation
  - Store token used (for revocation/analytics)
- **Onboarding data** stored in user profile: `display_name`, `city`, `interests` (array)
- **RL consent** stored in `feedback.consent` (default false) and shown in settings later
- **Green theme**: Primary color #10B981 (emerald), gradients, seed/garden imagery
- **Animation**: Lottie or CSS keyframes for "environment setup" wait

---

## Open Questions
- How to generate/distribute waitlist tokens? (admin CLI to create tokens)
- Should interests influence initial spark/briefing? Yes — personalize first briefing based on interests.
- Should city be used? For weather and maybe local news in briefing.

---

**Status**: Approved. Implementation backlog after backend API is stable.

"""

# Create page
page_data = {
    'parent': {'page_id': OPENCLAW_PARENT_ID},
    'properties': {'title': {'title': [{'text': {'content': 'Onboarding Flow Specification'}}]}},
    'children': [{
        'object': 'block',
        'type': 'paragraph',
        'paragraph': {'rich_text': [{'type': 'text', 'text': {'content': 'Seamless, green‑themed, token‑gated onboarding with RL consent and interests capture.'}}]}
    }]
}
url = "https://api.notion.com/v1/pages"
headers = {"Authorization": f"Bearer {NOTION_KEY}", "Notion-Version": NOTION_VERSION, "Content-Type": "application/json"}
req = urllib.request.Request(url, data=json.dumps(page_data).encode(), headers=headers)
with urllib.request.urlopen(req) as r:
    page = json.loads(r.read())
page_id = page['id']
print(f"Notion page: https://www.notion.so/{page_id.replace('-','')}")

# Add full content
full_blocks = [{'object': 'block', 'type': 'code', 'code': {'language': 'markdown', 'rich_text': [{'type': 'text', 'text': {'content': content}}]}}]
url2 = f"https://api.notion.com/v1/blocks/{page_id}/children"
req2 = urllib.request.Request(url2, data=json.dumps({'children': full_blocks}).encode(), headers=headers, method='PATCH')
with urllib.request.urlopen(req2) as r:
    json.loads(r.read())

print("Onboarding spec saved to Notion.")
