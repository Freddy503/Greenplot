#!/usr/bin/env python3
"""
sync_wiki_markdown.py
Fetches all wiki articles from Weaviate and saves them as markdown files.
Also generates a consolidated index for quick search by the chat agent.

Usage:
  python3 /root/.openclaw/workspace/scripts/sync_wiki_markdown.py

Files:
  /root/.openclaw/workspace/wiki/
    ├── index.json          — article index (title, summary, tags, file path)
    ├── article-slug.md     — one file per wiki article
    └── index.txt           — flat search corpus (title + content snippets)

This enables the chat agent to "read" wiki articles as context for substantial questions.
"""

import os
import sys
import json
import re
import urllib.request

WIKI_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'wiki')
TENANT_ID = '87959b2e-5443-4c50-9336-7da01af82c14'
WEAVIATE_URL = os.environ.get('WEAVIATE_URL', 'http://localhost:8080')


def slugify(text):
    """Convert title to safe filename."""
    s = text.lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = re.sub(r'-+', '-', s).strip('-')
    return s or 'untitled'


def fetch_wiki_articles(tenant_id, limit=100):
    """Get wiki articles from Weaviate."""
    gql = '''
    {
      Get {
        WikiArticle(
          where: {
            operator: Equal
            path: ["tenant_id"]
            valueText: "%s"
          }
          limit: %d
        ) {
          title
          category
          summary
          content
          source_seed_ids
          source_link_ids
          backlinks
          status
          health_score
          created_at
          updated_at
        }
      }
    }
    ''' % (tenant_id, limit)

    req = urllib.request.Request(
        f'{WEAVIATE_URL}/v1/graphql',
        data=json.dumps({'query': gql}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        res = json.loads(r.read())

    return res.get('data', {}).get('Get', {}).get('WikiArticle', [])


def article_to_markdown(article):
    """Convert a wiki article dict to markdown with metadata header."""
    lines = []
    lines.append(f'---')
    lines.append(f'title: "{article.get("title", "Untitled")}"')
    lines.append(f'category: {article.get("category", "")}')
    if article.get('summary'):
        lines.append(f'summary: "{article.get("summary", "")}"')
    if article.get('status'):
        lines.append(f'status: {article.get("status", "")}')
    if article.get('health_score'):
        lines.append(f'health_score: {article.get("health_score", 0)}')
    if article.get('source_seed_ids'):
        lines.append(f'seed_ids: {article.get("source_seed_ids", "")}')
    if article.get('source_link_ids'):
        lines.append(f'link_ids: {article.get("source_link_ids", "")}')
    if article.get('backlinks'):
        lines.append(f'backlinks: {article.get("backlinks", "")}')
    if article.get('created_at'):
        lines.append(f'created: {article.get("created_at", "")}')
    if article.get('updated_at'):
        lines.append(f'updated: {article.get("updated_at", "")}')
    lines.append(f'---')
    lines.append('')

    content = article.get('content', '')
    if content:
        lines.append(content)
    else:
        lines.append('*No content yet*')

    return '\n'.join(lines)


def build_search_corpus(articles):
    """Build a flat text corpus for keyword search by the chat agent."""
    lines = []
    for a in articles:
        title = a.get('title', '')
        summary = a.get('summary', '')
        content = a.get('content', '')[:3000]  # limit for search
        # Create a clean text blob with clear boundaries
        lines.append(f'[[ARTICLE: {title}]]')
        lines.append(f'SUMMARY: {summary}')
        lines.append(content if content else '(no content)')
        lines.append('')
        lines.append('[[END]]')
        lines.append('')
    return '\n'.join(lines)


def sync():
    os.makedirs(WIKI_DIR, exist_ok=True)

    articles = fetch_wiki_articles(TENANT_ID)

    if not articles:
        print('No wiki articles found in Weaviate.')
        # Still create empty index
        with open(os.path.join(WIKI_DIR, 'index.json'), 'w') as f:
            json.dump([], f)
        with open(os.path.join(WIKI_DIR, 'index.txt'), 'w') as f:
            f.write('')
        return 0

    # Build index
    index = []
    for a in articles:
        title = a.get('title', 'Untitled')
        slug = slugify(title)
        filename = f'{slug}.md'

        md_content = article_to_markdown(a)
        filepath = os.path.join(WIKI_DIR, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(md_content)

        index.append({
            'title': title,
            'category': a.get('category', ''),
            'summary': a.get('summary', ''),
            'status': a.get('status', ''),
            'health_score': a.get('health_score', 0),
            'filename': filename,
            'created_at': a.get('created_at', ''),
            'updated_at': a.get('updated_at', ''),
        })

    # Write index
    with open(os.path.join(WIKI_DIR, 'index.json'), 'w') as f:
        json.dump(index, f, indent=2)

    # Write search corpus
    corpus = build_search_corpus(articles)
    with open(os.path.join(WIKI_DIR, 'index.txt'), 'w') as f:
        f.write(corpus)

    print(f'Synced {len(articles)} wiki articles to {WIKI_DIR}/')
    for i in index:
        print(f'  - {i["title"]} → {i["filename"]}')

    return len(articles)


if __name__ == '__main__':
    count = sync()
    print(f'\nDone: {count} articles.' if count else '\nNo articles to sync.')
