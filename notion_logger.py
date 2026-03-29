import urllib.request
import json
import os
import sys
import datetime

db_id = '06343f4ece81490abe61519095ee4d9e'
key_path = os.path.expanduser('~/.config/notion/api_key')

if not os.path.exists(key_path):
    print("No Notion key found.")
    sys.exit(1)

key = open(key_path).read().strip()
content = sys.stdin.read()

# Chunk text into blocks of 2000 chars (Notion text block limit)
def chunk_text(text, size=2000):
    return [text[i:i+size] for i in range(0, len(text), size)]

blocks = []
for chunk in chunk_text(content):
    blocks.append({
        'object': 'block',
        'type': 'paragraph',
        'paragraph': {
            'rich_text': [{'type': 'text', 'text': {'content': chunk}}]
        }
    })

today = datetime.date.today().isoformat()

data = {
    'parent': {'database_id': db_id},
    'properties': {
        'Name': {'title': [{'text': {'content': f'Enterprise AI Digest - {today}'}}]},
        'Date': {'date': {'start': today}}
    },
    'children': blocks[:100] # Max 100 blocks per request
}

req = urllib.request.Request('https://api.notion.com/v1/pages', data=json.dumps(data).encode(), headers={
    'Authorization': f'Bearer {key}',
    'Notion-Version': '2025-09-03',
    'Content-Type': 'application/json'
})

try:
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        print("Successfully logged to Notion:", res.get('url'))
except Exception as e:
    print('Error pushing to Notion:', e)
