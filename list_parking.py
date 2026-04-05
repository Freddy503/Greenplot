import urllib.request, json, os
key = open('/root/.config/notion/api_key').read().strip()
parking_id = '331fbc8d-40a5-8119-bff8-fa81e339ed97'
url = f'https://api.notion.com/v1/databases/{parking_id}/query'
data = json.dumps({'page_size': 20}).encode()
req = urllib.request.Request(url, data=data, headers={
    'Authorization': f'Bearer {key}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
})
try:
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
        print(f"Total seeds in Parking Lot: {len(res.get('results', []))}")
        for p in res['results']:
            title = ''.join(x['plain_text'] for x in p['properties']['Thought']['title'])
            rating_prop = p['properties'].get('Seed Rating')
            rating = rating_prop.get('select', {}) if rating_prop and rating_prop.get('select') else {}
            feedback_prop = p['properties'].get('Feedback')
            feedback = ''.join(x['plain_text'] for x in feedback_prop.get('rich_text', [])) if feedback_prop and feedback_prop.get('rich_text') else ''
            rating_name = rating.get('name', 'No rating')
            print(f"{rating_name} | {title} | {feedback[:50]}")
except Exception as e:
    print("Error:", e)
    import traceback
    traceback.print_exc()