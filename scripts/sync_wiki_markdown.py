#!/usr/bin/env python3
"""
sync_wiki_markdown.py

wiki/*.md is the PRIMARY store. 
This script reads the markdown files and indexes them into Weaviate for vector search.

Direction:  wiki/*.md  →→ Weaviate  (NOT the other way)

Usage:
  python3 sync_wiki_markdown.py [--sync] [--query "search text"]
"""

import os
import sys
import json
import re
import urllib.request
import hashlib
import glob

WIKI_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'wiki')
TENANT_ID = '87959b2e-5443-4c50-9336-2da01af82c14'
WEAVIATE_URL = os.environ.get('WEAVIATE_URL', 'http://localhost:8080')

def slugify(text):
    s = text.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-') or 'untitled'


def parse_md_file(filepath):
    """Parse a wiki markdown file, returning title + content."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check for YAML frontmatter
    title = os.path.splitext(os.path.basename(filepath))[0].replace('-', ' ').title()
    body = content
    
    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            fm_text = parts[1]
            body = parts[2].strip()
            # Extract title from frontmatter
            for line in fm_text.split('\n'):
                if line.startswith('title:'):
                    title = line.split(':', 1)[1].strip().strip('"')
            if not title:
                title = os.path.splitext(os.path.basename(filepath))[0].replace('-', ' ').title()
    
    return title, body


def index_md_to_weaviate():
    """Read all wiki/*.md files and index them into Weaviate."""
    md_files = glob.glob(os.path.join(WIKI_DIR, '*.md'))
    if not md_files:
        print('No wiki markdown files found.')
        return 0
    
    indexed = 0
    for fp in sorted(md_files):
        if os.path.basename(fp) == 'INDEX.md':
            continue
        
        title, body = parse_md_file(fp)
        
        # Create/update WikiArticle in Weaviate
        from hashlib import sha256
        doc_hash = sha256(f'{title}{body[:500]}'.encode()).hexdigest()[:16]
        
        obj = {
            'tenant_id': TENANT_ID,
            'title': title,
            'content': body,
            'domain': 'wiki',
            'category': title.split('—')[0].strip() if '—' in title else 'General',
        }
        
        # Try to find existing article by title match
        gql = '''{
          Get { WikiArticle(
            where: { path: ["title"], operator: Equal, valueText: "%s" }
            limit: 1
          ) { title _additional { id } } } }''' % title.replace("'", "\\'")
        
        try:
            req = urllib.request.Request(
                f'{WEAVIATE_URL}/v1/graphql',
                data=json.dumps({'query': gql}).encode(),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                res = json.loads(r.read())
            existing = res.get('data', {}).get('Get', {}).get('WikiArticle', [])
            
            if existing:
                oid = existing[0].get('_additional', {}).get('id')
                if oid:
                    # Update existing
                    patch_req = urllib.request.Request(
                        f'{WEAVIATE_URL}/v1/objects/WikiArticle/{oid}',
                        data=json.dumps({'properties': obj}).encode(),
                        headers={'Content-Type': 'application/json'},
                        method='PATCH'
                    )
                    urllib.request.urlopen(patch_req, timeout=10)
                    print(f'  Updated: {title}')
                    indexed += 1
                    continue
        except Exception as e:
            print(f'  Query error for {title}: {e}')
        
        # Create new
        try:
            req = urllib.request.Request(
                f'{WEAVIATE_URL}/v1/objects',
                data=json.dumps({'class': 'WikiArticle', 'properties': obj}).encode(),
                headers={'Content-Type': 'application/json'}
            )
            urllib.request.urlopen(req, timeout=10)
            print(f'  Indexed: {title}')
            indexed += 1
        except Exception as e:
            print(f'  Error: {e}')
    
    print(f'\nIndexed {indexed} wiki articles to Weaviate')
    return indexed


# Legacy fallback: pull from Weaviate to markdown (only if no local files exist)
def sync_from_weaviate():
    """Fallback: sync from Weaviate to markdown files (only if wiki/ is empty)."""
    from sync_wiki_markdown_legacy import sync
    return sync()


def main():
    if not os.path.exists(WIKI_DIR):
        os.makedirs(WIKI_DIR, exist_ok=True)
    
    md_files = glob.glob(os.path.join(WIKI_DIR, '*.md'))
    md_files = [f for f in md_files if os.path.basename(f) != 'INDEX.md']
    
    if not md_files:
        # No local files — sync from Weaviate as fallback
        print('No local wiki files found — syncing from Weaviate...')
        try:
            from sync_wiki_markdown_legacy import sync
            count = sync()
            print(f'Synced {count} articles from Weaviate')
        except ImportError:
            print('No legacy sync module found. Please add wiki/*.md files manually.')
        return
    
    # Index markdown files into Weaviate
    print(f'Found {len(md_files)} wiki markdown files — indexing to Weaviate...')
    indexed = index_md_to_weaviate()
    
    # Also update local index.json
    index = []
    for fp in sorted(glob.glob(os.path.join(WIKI_DIR, '*.md'))):
        if os.path.basename(fp) == 'INDEX.md':
            continue
        title, body = parse_md_file(fp)
        slug = slugify(title)
        index.append({
            'title': title,
            'category': title.split('—')[0].strip() if '—' in title else 'General',
            'summary': body[:200].split('\n')[0] if body else '',
            'status': 'published',
            'health_score': 50,
            'filename': f'{slug}.md',
        })
    
    with open(os.path.join(WIKI_DIR, 'index.json'), 'w') as f:
        json.dump(index, f, indent=2)
    print(f'Updated index.json with {len(index)} articles')


if __name__ == '__main__':
    main()
