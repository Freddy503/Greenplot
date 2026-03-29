#!/usr/bin/env python3
"""
voice_to_seeds.py
Watches ~/.openclaw/media/inbound/ for new audio transcription files (.txt)
that haven't been processed yet. For each new one, creates a Seeds DB entry
(State: Raw) so the garden pipeline picks it up automatically.

State tracked in: skills/idea-garden-rag/voice_state.json
{"processed": ["filename1.txt", "filename2.txt"]}

Usage:
  python3 voice_to_seeds.py           # check once
  python3 voice_to_seeds.py --watch   # loop (for testing)
"""

import os, sys, json, urllib.request, datetime, argparse, glob, time

NOTION_API_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
SEEDS_DB       = '331fbc8d-40a5-8119-bff8-fa81e339ed97'
INBOUND_DIR    = os.path.expanduser('~/.openclaw/media/inbound')
STATE_FILE     = os.path.join(os.path.dirname(__file__), 'voice_state.json')


def load_state():
    if os.path.exists(STATE_FILE):
        return json.load(open(STATE_FILE))
    return {'processed': []}


def save_state(state):
    json.dump(state, open(STATE_FILE, 'w'), indent=2)


def npost(path, data):
    req = urllib.request.Request(f'https://api.notion.com/v1{path}',
        data=json.dumps(data).encode(),
        headers={'Authorization': f'Bearer {NOTION_API_KEY}',
                 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def create_seed_entry(title, transcription, filename):
    """Create a Raw Seeds entry from a voice memo transcription."""
    now = datetime.datetime.utcnow().isoformat() + 'Z'
    # Truncate for property field
    key_preview = transcription[:500].strip()

    page = npost('/pages', {
        'parent': {'type': 'database_id', 'database_id': SEEDS_DB},
        'icon': {'type': 'emoji', 'emoji': '🎙️'},
        'properties': {
            'Thought':     {'title': [{'type': 'text', 'text': {'content': title}}]},
            'Captured':    {'date': {'start': now}},
            'State':       {'select': {'name': 'Raw 🌀'}},
            'Context':     {'rich_text': [{'type': 'text', 'text': {'content': f'Auto-captured from voice memo: {filename}'}}]},
            'Energy':      {'select': {'name': 'Medium ☀️'}},
            'Tags':        {'multi_select': [{'name': 'voice-memo'}, {'name': 'seed'}]},
            'Key Takeaway': {'rich_text': [{'type': 'text', 'text': {'content': key_preview}}]}
        },
        'children': [
            {'object': 'block', 'type': 'callout', 'callout': {
                'icon': {'type': 'emoji', 'emoji': '🎙️'},
                'rich_text': [{'type': 'text', 'text': {'content': f'Auto-captured from: {filename}'}}]
            }},
            {'object': 'block', 'type': 'heading_2', 'heading_2': {
                'rich_text': [{'type': 'text', 'text': {'content': 'Transcription'}}]
            }},
            {'object': 'block', 'type': 'paragraph', 'paragraph': {
                'rich_text': [{'type': 'text', 'text': {'content': transcription[:2000]}}]
            }},
        ] + ([
            {'object': 'block', 'type': 'paragraph', 'paragraph': {
                'rich_text': [{'type': 'text', 'text': {'content': transcription[2000:4000]}}]
            }}
        ] if len(transcription) > 2000 else [])
    })
    return 'https://www.notion.so/' + page['id'].replace('-', '')


def extract_title(transcription, filename):
    """Generate a title from the first ~10 words of the transcription."""
    words = transcription.strip().split()[:10]
    title = ' '.join(words)
    if len(title) > 80:
        title = title[:77] + '...'
    return f"🎙️ {title}" if title else f"🎙️ Voice memo {filename[:20]}"


def process_new_files():
    state = load_state()
    processed = set(state.get('processed', []))

    # Find all .txt files in inbound that look like audio transcriptions
    pattern = os.path.join(INBOUND_DIR, 'AUDIO-*.txt')
    files = sorted(glob.glob(pattern))

    new_count = 0
    for fpath in files:
        fname = os.path.basename(fpath)
        if fname in processed:
            continue

        try:
            with open(fpath) as f:
                transcription = f.read().strip()
            if not transcription or len(transcription) < 20:
                processed.add(fname)
                continue

            title = extract_title(transcription, fname)
            url = create_seed_entry(title, transcription, fname)
            print(f'Created Seeds entry: {title[:60]} → {url}')
            processed.add(fname)
            new_count += 1
        except Exception as e:
            print(f'Error processing {fname}: {e}', file=sys.stderr)

    state['processed'] = list(processed)
    save_state(state)
    return new_count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--watch', action='store_true', help='Loop every 60s')
    args = parser.parse_args()

    if args.watch:
        while True:
            n = process_new_files()
            if n:
                print(f'Processed {n} new voice memo(s)')
            time.sleep(60)
    else:
        n = process_new_files()
        print(f'Processed {n} new voice memo(s)')


if __name__ == '__main__':
    main()
