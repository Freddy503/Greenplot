import urllib.request, json, os
key = open('/root/.config/notion/api_key').read().strip()
req = urllib.request.Request('https://api.notion.com/v1/databases/331fbc8d-40a5-8119-bff8-fa81e339ed97/query',
  data=json.dumps({'filter': {'property': 'Seed Rating', 'select': {'is_not_empty': True}}, 'page_size': 20}).encode(),
  headers={'Authorization': f'Bearer {key}', 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as r:
  res = json.loads(r.read())
for p in res['results']:
  title = ''.join(x['plain_text'] for x in p['properties']['Thought']['title'])
  rating = p['properties'].get('Seed Rating', {}).get('select', {}) or {}
  feedback = ''.join(x['plain_text'] for x in p['properties'].get('Feedback', {}).get('rich_text', []))
  print(f"{rating.get('name','?')} | {title} | {feedback}")