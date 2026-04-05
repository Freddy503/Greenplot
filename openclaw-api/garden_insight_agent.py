#!/usr/bin/env python3
"""
Garden Insight Agent - Autonomous sub-agent that analyzes the user's Garden 
and generates insight reports. Can run as cron job or on-demand.

Types of insights:
- PATTERN: Find unexpected connections between seeds
- GAP: Identify topics with many seeds but no wiki article
- TREND: Analyze temporal patterns in seed creation
- QUALITY: Flag duplicates, stale content, missing tags
"""

import os
from app.weaviate_client import weaviate_client
import urllib.request
from collections import Counter
import json

TENANT_ID = '87959b2e-5443-4c50-9336-2da01af82c14'
USER_ID = 'b422838b-d5f7-455a-b966-511b08549ae7'

def get_seeds():
    return weaviate_client.get_seeds_by_tenant(tenant_id=TENANT_ID, limit=500)

def get_wiki_articles():
    return weaviate_client.get_wiki_articles(tenant_id=TENANT_ID, limit=100)

def _add_seed_fixed(title, content, tags, domain="agent-insight", status="Planted"):
    """Create a new seed in Weaviate"""
    try:
        result = _add_seed_fixed(
            tenant_id=TENANT_ID,
            user_id=USER_ID,
            title=title,
            content=content,
            source="agent-insight",
            tags=tags,
            domain=domain,
            status=status,
            energy="5"
        )
        return result
    except Exception as e:
        print(f"Error creating seed: {e}")
        return None

def pattern_agent(seeds, wiki_articles):
    """Find unexpected connections between seeds from different domains"""
    print(f"🔍 Pattern Agent: Analyzing {len(seeds)} seeds for patterns...")
    
    tag_to_seeds = {}
    for seed in seeds:
        tags = seed.get('tags', '') or ''
        domain = seed.get('domain', 'untagged')
        title = seed.get('title', '')
        for tag in tags.split(',') if ',' in tags else [tags]:
            tag = tag.strip().lower()
            if tag and tag not in ('untitled', 'stub', 'none', ''):
                if tag not in tag_to_seeds:
                    tag_to_seeds[tag] = []
                tag_to_seeds[tag].append({'title': title, 'domain': domain})
    
    connections = []
    for tag, items in sorted(tag_to_seeds.items(), key=lambda x: len(x[1]), reverse=True)[:20]:
        domains = set(item['domain'] for item in items)
        if len(domains) > 1 and len(items) >= 3:
            connections.append({
                'tag': tag,
                'domains': list(domains),
                'seeds': items[:4]
            })
    
    if connections:
        report = f"# Pattern Discovery Report\n\n"
        report += f"Found {len(connections)} cross-domain patterns in your Garden:\n\n"
        for i, conn in enumerate(connections[:5], 1):
            report += f"## {i}. \"{conn['tag']}\" connects {len(conn['domains'])} domains\n"
            report += f"Domains: {', '.join(conn['domains'])}\n"
            for seed in conn['seeds']:
                report += f"- {seed['title'][:50]} ({seed['domain']})\n"
            report += "\n"
        
        _add_seed_fixed(
            title=f"Pattern Insight: {connections[0]['tag']} connects {len(connections[0]['domains'])} domains",
            content=report,
            tags="agent-insight, pattern-discovery, cross-domain, " + connections[0]['tag'],
            domain="agent-insight"
        )
        print(f"✅ Saved pattern insight to Garden")
    else:
        print("ℹ️  No cross-domain patterns found")
    
    return connections

def gap_agent(seeds, wiki_articles):
    """Find topics with seeds but no wiki article"""
    print(f"🔍 Gap Agent: Checking for missing wiki coverage...")
    
    domain_counts = {}
    for seed in seeds:
        domain = seed.get('domain', 'untagged')
        if domain not in ('None', 'untagged', 'General', ''):
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
    
    wiki_domains = set()
    for article in wiki_articles:
        wiki_domains.add((article.get('category', '') or '').lower())
    
    gaps = []
    for domain, count in sorted(domain_counts.items(), key=lambda x: x[1], reverse=True):
        if domain.lower() not in wiki_domains and count >= 3:
            gaps.append({'domain': domain, 'count': count})
    
    if gaps:
        report = f"# Knowledge Gap Report\n\n"
        report += f"Found {len(gaps)} domains with seeds but no wiki article:\n\n"
        for gap in gaps:
            report += f"- **{gap['domain']}**: {gap['count']} seeds, no wiki article\n"
        
        _add_seed_fixed(
            title=f"Knowledge Gaps: {len(gaps)} domains missing wiki coverage",
            content=report,
            tags="agent-insight, knowledge-gap, missing-wiki",
            domain="agent-insight"
        )
        print(f"✅ Saved gap report to Garden ({len(gaps)} gaps)")
    else:
        print("ℹ️  No significant knowledge gaps found")
    
    return gaps

def trend_agent(seeds):
    """Analyze which domains and tags are growing fastest"""
    print(f"🔍 Trend Agent: Analyzing domain distribution...")
    
    domain_counts = Counter(s.get('domain', '') for s in seeds)
    all_tags = []
    for s in seeds:
        if s.get('tags'):
            all_tags.extend(t.strip().lower() for t in s['tags'].split(',') if t.strip() and t.strip() not in ('untitled', 'stub'))
    tag_counts = Counter(all_tags)
    
    report = f"# Garden Trend Report\n\n"
    report += f"Total seeds: {len(seeds)}\n\n"
    report += f"## Top Domains\n"
    for domain, count in domain_counts.most_common(10):
        if domain:
            report += f"- **{domain}**: {count} seeds\n"
    report += f"\n## Top Tags\n"
    for tag, count in tag_counts.most_common(15):
        report += f"- **{tag}**: {count} mentions\n"
    
    if tag_counts:
        top_tag = tag_counts.most_common(1)[0]
        _add_seed_fixed(
            title=f"Garden Trends: {top_tag[0]} is the top tag ({top_tag[1]} mentions)",
            content=report,
            tags="agent-insight, garden-trends, analytics, " + top_tag[0],
            domain="agent-insight"
        )
        print(f"✅ Saved trends to Garden")
    else:
        print("ℹ️  No trends to report")
    
    return tag_counts

def quality_agent(seeds):
    """Flag seeds that are untitled or have no tags"""
    print(f"🔍 Quality Agent: Checking seed quality...")
    
    issues = []
    for seed in seeds:
        title = (seed.get('title') or '').strip()
        tags = seed.get('tags') or ''
        content = seed.get('content') or ''
        domain = seed.get('domain') or ''
        
        if title.lower() in ('untitled', ''):
            issues.append({'type': 'untitled', 'id': seed.get('id', '')})
        if not tags or tags.strip() in ('', 'untitled', 'stub'):
            issues.append({'type': 'no-tags', 'id': seed.get('id', ''), 'title': title[:50]})
        if not content or len(content.strip()) < 50:
            issues.append({'type': 'low-content', 'id': seed.get('id', ''), 'title': title[:50]})
        if not domain or domain.strip() == '':
            issues.append({'type': 'no-domain', 'id': seed.get('id', ''), 'title': title[:50]})
    
    if issues:
        by_type = {}
        for issue in issues:
            t = issue['type']
            if t not in by_type:
                by_type[t] = []
            by_type[t].append(issue)
        
        report = f"# Quality Report\n\n"
        report += f"Found {len(issues)} quality issues across {len(set(i['id'] for i in issues))} seeds:\n\n"
        for issue_type, items in by_type.items():
            report += f"- **{issue_type.replace('-', ' ').title()}**: {len(items)} seeds\n"
        
        report += f"\n## Recommendations\n"
        if 'untitled' in by_type:
            report += f"- {len(by_type['untitled'])} seeds need titles\n"
        if 'no-tags' in by_type:
            report += f"- {len(by_type['no-tags'])} seeds need tags\n"
        if 'low-content' in by_type:
            report += f"- {len(by_type['low-content'])} seeds need more content\n"
        if 'no-domain' in by_type:
            report += f"- {len(by_type['no-domain'])} seeds need a domain assignment\n"
        
        _add_seed_fixed(
            title=f"Quality Audit: {len(issues)} issues found in {len(set(i['id'] for i in issues))} seeds",
            content=report,
            tags="agent-insight, quality-audit, garden-health",
            domain="agent-insight"
        )
        print(f"✅ Saved quality report ({len(issues)} issues)")
    else:
        print("ℹ️  No quality issues found")
    
    return issues

def run_all():
    """Run all insight agents"""
    print("=" * 60)
    print("🌱 Garden Insight Agent - Full Analysis")
    print("=" * 60)
    
    seeds = get_seeds()
    wiki_articles = get_wiki_articles()
    
    print(f"📊 Seeds: {len(seeds)}, Wiki articles: {len(wiki_articles)}\n")
    
    if len(seeds) == 0:
        print("❌ No seeds found. Check tenant ID.")
        return
    
    pattern_agent(seeds, wiki_articles)
    gap_agent(seeds, wiki_articles)
    trend_agent(seeds)
    quality_agent(seeds)
    
    print("\n✅ Garden Insight Agent complete!")
    print("Results saved as seeds with 'agent-insight' tag")

if __name__ == '__main__':
    run_all()

def _add_seed_fixed(title, content, tags, domain="agent-insight", status="Planned"):
    """Create a new seed in Weaviate using direct API"""
    seed = {
        "class": "IdeaSeed",
        "properties": {
            "title": title,
            "content": content,
            "tags": tags,
            "domain": domain,
            "status": status,
            "tenant_id": TENANT_ID
        }
    }
    req = urllib.request.Request(
        "http://weaviate:8080/v1/objects",
        data=json.dumps(seed).encode(),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"Error creating seed: {e}")
        return None
