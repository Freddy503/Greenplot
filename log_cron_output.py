#!/usr/bin/env python3
"""Log CronJob output to Notion (CronJob Knowledge Base)."""

import argparse, os, json, urllib.request, datetime

NOTION_API_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
CRON_LOGS_DB = '332fbc8d-40a5-81a8-aad8-d452ba30d931'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--job_name', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    now = datetime.datetime.utcnow().isoformat() + 'Z'

    page = {
        'parent': {'type': 'database_id', 'database_id': CRON_LOGS_DB},
        'properties': {
            'Job Name': {'title': [{'text': {'content': args.job_name}}]},
            'Timestamp': {'date': {'start': now}},
            'Output': {'rich_text': [{'text': {'content': args.output[:2000]}}]},
        }
    }

    req = urllib.request.Request(
        'https://api.notion.com/v1/pages',
        data=json.dumps(page).encode(),
        headers={'Authorization': f'Bearer {NOTION_API_KEY}',
                 'Notion-Version': NOTION_VERSION,
                 'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        # Log error locally but don't fail the cron job
        print(f"Failed to log to Notion: {e}", file=sys.stderr)

if __name__ == '__main__':
    main()
