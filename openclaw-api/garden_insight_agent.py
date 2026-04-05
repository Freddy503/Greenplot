#!/usr/bin/env python3
"""
Garden Insight Agent - runs 4 discovery agents against Weaviate garden.
Usage: python3 skills/idea-garden-rag/garden_insight_agent.py
Must run inside the API container where Weaviate is accessible at weaviate:8080.
"""
import sys, os, json
sys.path.insert(0, '/app')
os.chdir('/app')

from app.weaviate_client import weaviate_client
from collections import Counter

TENANT_ID = '87959b2e-5443-4c50-9336-2da01af82c14'


def save_insight(title, content, tags, domain='agent-insight'):
    prop = {
        'title': title, 'content': content, 'tags': tags,
        'domain': domain, 'status': 'Planted', 'tenant_id': TENANT_ID
    }
    try:
        weaviate_client.client.data_object.create(data_object=prop, class_name='IdeaSeed')
        print(f'  Saved: {title[:60]}')
    except Exception as e:
        print(f'  Error: {e}')


def pattern_agent(seeds):
    print('\nPattern Agent: Finding cross-domain tag patterns...')
    tag_map = {}
    for s in seeds:
        tags = s.get('tags', '') or ''
        domain = s.get('domain', 'untagged')
        for tag in (tags.split(',') if ',' in tags else [tags]):
            t = tag.strip().lower()
            if t and t not in ('untitled', 'stub', 'none', ''):
                tag_map.setdefault(t, set()).add(domain)
    connections = [{'tag': tag, 'domains': sorted(domains)}
                   for tag, domains in tag_map.items() if len(domains) > 1]
    connections.sort(key=lambda x: len(x['domains']), reverse=True)
    for c in connections[:8]:
        print(f'  "{c["tag"]}" spans {len(c["domains"])} domains: {", ".join(c["domains"])}')
    if connections:
        rpt = '# Pattern Discovery Report\n\n'
        rpt += 'Found %d tags spanning multiple domains:\n\n' % len(connections)
        for c in connections[:10]:
            rpt += '- **%s** connects: %s\n' % (c['tag'], ', '.join(c['domains']))
        save_insight('Pattern: "%s" spans %d domains' % (connections[0]['tag'], len(connections[0]['domains'])),
                    rpt, 'agent-insight, pattern-discovery')
    return connections


def gap_agent(seeds, wiki):
    print('\nGap Agent: Checking for missing wiki coverage...')
    domain_counts = Counter(s.get('domain', '') for s in seeds
                          if s.get('domain') not in ('', 'None', 'General', 'untagged'))
    wiki_domains = set((a.get('category', '') or '').lower() for a in wiki)
    gaps = [{'domain': d, 'count': c} for d, c in domain_counts.most_common()
            if d.lower() not in wiki_domains and c >= 3]
    for g in gaps:
        print(f'  {g["domain"]}: {g["count"]} seeds, no wiki')
    if gaps:
        rpt = '# Knowledge Gap Report\n\n'
        rpt += 'Found %d domains with 3+ seeds but no wiki article:\n\n' % len(gaps)
        for g in gaps:
            rpt += '- **%s**: %d seeds\n' % (g['domain'], g['count'])
        save_insight('Gaps: %d domains missing wiki' % len(gaps), rpt, 'agent-insight, knowledge-gap')
    return gaps


def quality_agent(seeds):
    print('\nQuality Agent: Checking seed health...')
    issues = {'untitled': 0, 'no-tags': 0, 'low-content': 0, 'no-domain': 0}
    for s in seeds:
        t = (s.get('title') or '').strip()
        tags = s.get('tags') or ''
        content = s.get('content') or ''
        if t.lower() in ('untitled', ''): issues['untitled'] += 1
        if not tags or tags.strip() in ('', 'untitled', 'stub'): issues['no-tags'] += 1
        if len(content.strip()) < 50: issues['low-content'] += 1
        if not s.get('domain'): issues['no-domain'] += 1
    total = sum(issues.values())
    for k, v in issues.items():
        if v > 0: print(f'  {k}: {v}')
    if total > 0:
        rpt = '# Quality Report\n\n'
        rpt += 'Found %d quality issues:\n\n' % total
        for k, v in issues.items():
            if v > 0: rpt += '- **%s**: %d\n' % (k.replace('-', ' ').title(), v)
        save_insight('Quality: %d issues found' % total, rpt, 'agent-insight, quality-audit')
    return issues


def run_all():
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=TENANT_ID, limit=500)
    wiki = weaviate_client.get_wiki_articles(tenant_id=TENANT_ID, limit=100)
    print(f'Seeds: {len(seeds)}, Wiki: {len(wiki)}')
    pattern_agent(seeds)
    gap_agent(seeds, wiki)
    quality_agent(seeds)
    print('\nAll insights saved as agent-insight seeds.')


if __name__ == '__main__':
    run_all()
