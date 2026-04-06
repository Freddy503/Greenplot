#!/usr/bin/env python3
"""
wiki_health_check.py
Monthly health check for the Seedify knowledge base.

Reads all wiki articles + planted seeds and flags:
1. Contradictions between articles
2. Orphaned topics (mentioned but never explained)
3. Claims without source backing
4. Gaps (topics that should have articles but don't)

Usage:
  python3 wiki_health_check.py

Run monthly via cron:
  0 10 1 * * python3 /root/.openclaw/workspace/scripts/wiki_health_check.py >> /root/.openclaw/logs/wiki_health.log 2>&1
"""

import os
import sys
import json
import re
import urllib.request
import datetime

WIKI_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'wiki')
NOTION_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
NOTION_VERSION = '2022-06-28'
WIKI_DB = '331fbc8d-40a5-816b-80e0-ea68ff4ba64d'
SEEDS_DB = '331fbc8d-40a5-8119-bff8-fa81e339ed97'
NVIDIA_API_KEY = os.environ.get('NVIDIA_API_KEY', '')
NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'

def notion_post(path, data):
    req = urllib.request.Request(f'https://api.notion.com/v1{path}',
        data=json.dumps(data).encode(),
        headers={'Authorization': f'Bearer {NOTION_KEY}',
                 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def notion_get(path):
    req = urllib.request.Request(f'https://api.notion.com/v1{path}',
        headers={'Authorization': f'Bearer {NOTION_KEY}',
                 'Notion-Version': NOTION_VERSION})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def load_wiki_articles():
    """Load all wiki articles from local markdown files."""
    import glob
    md_files = glob.glob(os.path.join(WIKI_DIR, '*.md'))
    md_files = [f for f in md_files if os.path.basename(f) != 'INDEX.md']
    articles = []
    for fp in sorted(md_files):
        with open(fp, 'r', encoding='utf-8') as f:
            content = f.read()
        title = os.path.splitext(os.path.basename(fp))[0].replace('-', ' ').title()
        # Check for YAML frontmatter
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                fm_text = parts[1]
                body = parts[2].strip()
                # Extract title from frontmatter
                for line in fm_text.split('\n'):
                    if line.startswith('title:'):
                        title = line.split(':', 1)[1].strip().strip('"')
            else:
                body = content
        else:
            body = content
        articles.append({'id': fp, 'title': title, 'source': '', 'body': body})
    return articles


def find_wikilinks(articles):
    """Find all [[wikilink]] references across articles."""
    all_titles = set(a['title'].lower() for a in articles)
    found_links = set()
    orphaned = set()

    for article in articles:
        links = re.findall(r'\[\[([^\]]+)\]\]', article['body'])
        for link in links:
            link_lower = link.lower()
            found_links.add(link)
            if link_lower not in all_titles and link_lower not in (a['title'].lower() for a in articles):
                orphaned.add(link)

    return found_links, orphaned


def find_claims_without_sources(articles):
    """Find factual claims (sentences with numbers, dates, percentages) that lack source citations."""
    claims_without_sources = []
    for article in articles:
        # Look for sentences with specific data points
        sentences = re.split(r'[.!?]+', article['body'])
        for sent in sentences:
            sent = sent.strip()
            # Skip headings, short sentences
            if len(sent) < 30 or sent.startswith('#'):
                continue
            # Contains specific data
            has_data = bool(re.search(r'(\d+%|\d{4}|\$[\d.]+|[A-Z][a-z]+ [A-Z][a-z]+|CEO|CTO|launched|founded)', sent))
            if has_data:
                # Check if it has citation [1] or source reference
                has_citation = bool(re.search(r'\[\d+\]|source:|according to|from ', sent, re.IGNORECASE))
                if not has_citation:
                    claims_without_sources.append({
                        'article': article['title'],
                        'claim': sent[:150]
                    })
    return claims_without_sources


def llm_health_check(articles_text):
    """Use Nemotron to do deeper analysis: contradictions, gaps, suggestions."""
    if not NVIDIA_API_KEY:
        return {"error": "NVIDIA_API_KEY not set"}

    system_prompt = """You are a knowledge base health checker. Given a set of wiki articles, analyze for:
1. CONTRADICTIONS: Facts or claims that directly conflict between articles
2. GAPS: Topics that are central to the domain but have no dedicated article
3. SUGGESTED_ARTICLES: 3 new articles that would most improve the knowledge base
4. DRIFT: Articles that seem outdated or no longer aligned with recent captures

Output JSON only: {"contradictions": [...], "gaps": [...], "suggested_articles": [...], "drift": [...]}"""

    payload = {
        'model': 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': articles_text[:15000]}
        ],
        'temperature': 0.2,
        'max_tokens': 800
    }
    req = urllib.request.Request(f'{NVIDIA_BASE_URL}/chat/completions',
        data=json.dumps(payload).encode(),
        headers={'Authorization': f'Bearer {NVIDIA_API_KEY}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=90) as r:
        res = json.loads(r.read())
    raw = (res['choices'][0]['message'].get('content') or '').strip()
    # Parse JSON from response
    if raw.startswith('```'):
        raw = raw.split('```')[1]
        if raw.startswith('json'):
            raw = raw[4:]
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError as e:
        return {"error": f"LLM returned non-JSON: {e}", "raw_preview": raw[:500]}


def generate_report(articles, orphaned, claims, llm_result):
    """Generate the health check report."""
    now = datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d')
    report = []
    report.append(f'# Wiki Health Check — {now}\n')
    report.append(f'**{len(articles)}** wiki articles analyzed\n')

    # Wikilink issues
    if orphaned:
        report.append(f'\n## 🔗 Orphaned Links ({len(orphaned)})')
        report.append('These topics are referenced but have no dedicated article:')
        for link in sorted(orphaned):
            report.append(f'- [[{link}]]')
    else:
        report.append('\n## ✅ Wikilinks: No orphaned topics')

    # Source backing issues
    if claims:
        report.append(f'\n## ⚠️ Claims Without Sources ({len(claims)})')
        for c in claims[:10]:
            report.append(f'- **{c["article"]}**: "{c["claim"]}..."')
        if len(claims) > 10:
            report.append(f'- ... and {len(claims)-10} more')
    else:
        report.append('\n## ✅ All claims have source backing')

    # LLM analysis
    if isinstance(llm_result, dict) and not llm_result.get('error'):
        contradictions = llm_result.get('contradictions', [])
        if contradictions:
            report.append(f'\n## 🚨 Contradictions Found ({len(contradictions)})')
            for c in contradictions:
                report.append(f'- {c}')

        gaps = llm_result.get('gaps', [])
        if gaps:
            report.append(f'\n## 📋 Knowledge Gaps ({len(gaps)})')
            for g in gaps:
                report.append(f'- {g}')

        suggestions = llm_result.get('suggested_articles', [])
        if suggestions:
            report.append(f'\n## 💡 Suggested New Articles ({len(suggestions)})')
            for s in suggestions:
                report.append(f'- {s}')

        drift = llm_result.get('drift', [])
        if drift:
            report.append(f'\n## ⏰ Potential Drift ({len(drift)})')
            for d in drift:
                report.append(f'- {d}')
    else:
        report.append('\n## ⚠️ LLM analysis skipped')

    report_text = '\n'.join(report)

    # Save to outputs/
    outputs_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'outputs')
    os.makedirs(outputs_dir, exist_ok=True)
    filename = f'health-check-{now}.md'
    filepath = os.path.join(outputs_dir, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(report_text)

    return report_text


def main():
    print(f'Wiki Health Check — {datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M")} UTC')
    print('Loading articles...')
    articles = load_wiki_articles()
    print(f'  {len(articles)} articles loaded')

    if not articles:
        print('No articles to check.')
        return

    print('Checking wikilinks...')
    _, orphaned = find_wikilinks(articles)

    print('Checking claim backing...')
    claims = find_claims_without_sources(articles)

    print('Running LLM analysis...')
    articles_text = '\n\n---\n\n'.join(f'# {a["title"]}\n\n{a["body"]}' for a in articles)
    llm_result = llm_health_check(articles_text)

    print('Generating report...')
    report = generate_report(articles, orphaned, claims, llm_result)

    print(f'\nHealth check complete. Report saved to outputs/health-check-{datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d")}.md')
    print('\n' + '='*60)
    print(report)


if __name__ == '__main__':
    main()
