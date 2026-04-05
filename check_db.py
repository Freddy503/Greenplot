import urllib.request, json, os
key = open('/root/.config/notion/api_key').read().strip()

# Check Parking Lot DB (from cron command)
parking_id = '331fbc8d-40a5-8119-bff8-fa81e339ed97'
url = f'https://api.notion.com/v1/databases/{parking_id}'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {key}', 'Notion-Version': '2022-06-28'})
try:
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
        print("Parking Lot DB properties:")
        for prop_name, prop_info in res.get('properties', {}).items():
            print(f"  {prop_name}: {prop_info.get('type', 'unknown')}")
except Exception as e:
    print("Error fetching Parking Lot DB:", e)

print()

# Check Idea Garden DB (from memory)
idea_id = '331fbc8d-40a5-816b-80e0-ea68ff4ba64d'
url = f'https://api.notion.com/v1/databases/{idea_id}'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {key}', 'Notion-Version': '2022-06-28'})
try:
    with urllib.request.urlopen(req) as r:
        res = json.loads(r.read())
        print("Idea Garden DB properties:")
        for prop_name, prop_info in res.get('properties', {}).items():
            print(f"  {prop_name}: {prop_info.get('type', 'unknown')}")
except Exception as e:
    print("Error fetching Idea Garden DB:", e)