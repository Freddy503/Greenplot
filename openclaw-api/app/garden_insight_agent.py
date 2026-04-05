"""
Garden Insight Agent - Autonomous pattern/gap/trend/quality discovery
Can be called via API or standalone script
"""
from app.weaviate_client import weaviate_client
from collections import Counter
from datetime import datetime, timedelta
import json
import urllib.request

def _create_insight_seed(title, content, tags, domain, tenant_id, user_id, status="Planted"):
    """Create a new insight seed in Weaviate"""
    seed = {
        "class": "IdeaSeed",
        "properties": {
            "title": title,
            "content": content,
            "tags": tags,
            "domain": domain,
            "status": status,
            "tenant_id": tenant_id,
            "user_id": str(user_id)
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
        print(f"Error: {e}")
        return None

def run_all_insights(tenant_id, user_id):
    """Run all 4 insight agents and return results"""
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    wiki = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
    
    results = {}
    
    # 1. Pattern Agent - cross-domain connections
    tag_map = {}
    for seed in seeds:
        tags = seed.get('tags', '') or ''
        domain = seed.get('domain', 'untagged')
        title = seed.get('title', '')
        for tag in (tags.split(',') if ',' in tags else [tags]):
            tag = tag.strip().lower()
            if tag and tag not in ('untitled', 'stub', 'none', ''):
                tag_map.setdefault(tag, []).append({'title': title, 'domain': domain})
    
    connections = []
    for tag, items in sorted(tag_map.items(), key=lambda x: len(x[1]), reverse=True)[:20]:
        domains = set(i['domain'] for i in items)
        if len(domains) > 1 and len(items) >= 3:
            connections.append({'tag': tag, 'domains': list(domains), 'count': len(items), 'seeds': items[:4]})
    
    if connections:
        report = f"# Pattern Discovery Report\n\nFound {len(connections)} cross-domain patterns:\n\n"
        for i, c in enumerate(connections[:5], 1):
            report += f"## {i}. \"{c['tag']}\" connects {len(c['domains'])} domains\n"
            report += f"Domains: {', '.join(c['domains'])}\n"
            for s in c['seeds']:
                report += f"- {s['title'][:50]} ({s['domain']})\n"
            report += "\n"
        
        _create_insight_seed(
            f"Pattern: {connections[0]['tag']} connects {len(connections[0]['domains'])} domains",
            report, "agent-insight, pattern, " + connections[0]['tag'],
            "agent-insight", tenant_id, user_id)
        results['pattern'] = {'found': len(connections), 'top': connections[:3]}
    else:
        results['pattern'] = {'found': 0}
    
    # 2. Gap Agent - seeds without wiki
    domain_counts = Counter(s.get('domain', '') for s in seeds if s.get('domain') not in ('', 'None', 'General'))
    wiki_domains = set((a.get('category', '') or '').lower() for a in wiki)
    gaps = [{'domain': d, 'count': c} for d, c in domain_counts.most_common() if d.lower() not in wiki_domains and c >= 3]
    
    if gaps:
        report = "# Knowledge Gap Report\n\n"
        for g in gaps:
            report += f"- **{g['domain']}**: {g['count']} seeds, no wiki article\n"
        _create_insight_seed(f"Gaps: {len(gaps)} domains missing wiki", report,
                           "agent-insight, knowledge-gap", "agent-insight", tenant_id, user_id)
        results['gap'] = {'found': len(gaps), 'gaps': gaps}
    else:
        results['gap'] = {'found': 0}
    
    # 3. Trend Agent - domain/tag distribution
    all_tags = []
    for s in seeds:
        if s.get('tags'):
            all_tags.extend(t.strip().lower() for t in s['tags'].split(',') if t.strip() and t.strip() not in ('untitled', 'stub'))
    tag_counts = Counter(all_tags)
    top_tag = tag_counts.most_common(1)[0] if tag_counts else ("none", 0)
    
    report = f"# Garden Trends ({len(seeds)} seeds)\n\n## Top Domains\n"
    for d, c in domain_counts.most_common(10):
        if d: report += f"- **{d}**: {c}\n"
    report += "\n## Top Tags\n"
    for t, c in tag_counts.most_common(15):
        report += f"- **{t}**: {c}\n"
    
    _create_insight_seed(f"Trends: top tag is {top_tag[0]} ({top_tag[1]} mentions)", report,
                        "agent-insight, trends, analytics", "agent-insight", tenant_id, user_id)
    results['trend'] = {'total_seeds': len(seeds), 'top_tag': top_tag, 'domains': domain_counts.most_common(10)}
    
    # 4. Quality Agent - flag issues
    issues = []
    for s in seeds:
        t = (s.get('title') or '').strip()
        tags = s.get('tags') or ''
        content = s.get('content') or ''
        domain = s.get('domain') or ''
        if t.lower() in ('untitled', ''): issues.append('untitled')
        if not tags or tags.strip() in ('', 'untitled', 'stub'): issues.append('no-tags')
        if len(content.strip()) < 50: issues.append('low-content')
        if not domain: issues.append('no-domain')
    
    if issues:
        by_type = dict(Counter(issues).most_common())
        report = f"# Quality Report\n\nFound {len(issues)} issues:\n"
        for k, v in by_type.items():
            report += f"- **{k.replace('-', ' ').title()}**: {v}\n"
        
        _create_insight_seed(f"Quality: {len(issues)} issues found", report,
                           "agent-insight, quality-audit", "agent-insight", tenant_id, user_id)
        results['quality'] = {'found': len(issues), 'by_type': by_type}
    else:
        results['quality'] = {'found': 0}
    
    return results
