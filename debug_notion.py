import urllib.request, json, os
key = open('/root/.config/notion/api_key').read().strip()
print("Key:", key[:10] + "...")
url = 'https://api.notion.com/v1/databases/331fbc8d-40a5-8119-bff8-fa81e339ed97/query'
data = json.dumps({'filter': {'property': 'Seed Rating', 'select': {'is_not_empty': True}}, 'page_size': 20}).encode()
req = urllib.request.Request(url, data=data, headers={'Authorization': f'Bearer {key}', 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
        print("Success! Number of results:", len(res.get('results', [])))
        for p in res['results'][:3]:
            title = ''.join(x['plain_text'] for x in p['properties']['Thought']['title'])
            rating = p['properties'].get('Seed Rating', {}).get('select', {}) or {}
            feedback = ''.join(x['plain_text'] for x in p['properties'].get('Feedback', {}).get('rich_text', []))
            print(f"{rating.get('name','?')} | {title} | {feedback}")
except Exception as e:
    print("Error:", e)
    # Try to read response if available
    if hasattr(e, 'read'):
        try:
            body = e.read()
            print("Response body:", body)
        except:
            pass