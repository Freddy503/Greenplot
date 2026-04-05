#!/usr/bin/env python3
"""
Garden Insight Generator - Autonomous sub-agent that analyzes the user's Garden 
and generates insight reports. Can run as cron job or on-demand.

Types of insights:
- PATTERN: Find unexpected connections between seeds
- GAP: Identify topics with seeds but no wiki article
- TREND: Analyze temporal patterns in seed creation
- QUALITY: Flag duplicates, stale content, missing tags
"""

import os, sys, json, urllib.request
from datetime import datetime, timedelta
from collections import Counter

# Config
NOTION_API_KEY = open(os.path.expanduser('~/.config/notion/api_key')).read().strip()
WEAVIATE_URL = os.environ.get('WEAVIATE_URL', 'http://localhost:8080')
TENANT_ID = '87959b2e-5443-4c50-9336-2da01af82c14'
INSIGHT_TYPE = sys.argv[1] if len(sys.argv) > 1 else 'pattern'

def weaviate_graphql(query):
    req = urllib.request.Request(
        f"{WEAVIATE_URL}/v1/graphql",
        data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
        return data.get('data', {}).get('Get', {})

def llm_chat(system, user, model="qwen/qwen3.6-plus:free"):
    """Call LLM via OpenRouter for insight generation"""
    api_key = os.environ.get('OPENROUTER_API_KEY', '')
    if not api_key:
        return ""
    
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user}
            ],
            "max_tokens": 800,
            "temperature": 0.7
        }).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            result = json.loads(r.read())
            return result['choices'][0]['message']['content']
    except:
        return ""

def get_seeds():
    result = weaviate_graphql(f'''{{
        IdeaSeed(where: {{path: "tenant_id", operator: Equal, valueText: "{TENANT_ID}"}}, limit: 500) {{
            title content domain tags status created_at _additional {{ id }}
        }}
    }}''')
    return result.get('IdeaSeed', [])

def get_wiki_articles():
    result = weaviate_graphql(f'''{{
        WikiArticle(where: {{path: "tenant_id", operator: Equal, valueText: "{TENANT_ID}"}}, limit: 100) {{
            title category _additional {{ id }}
        }}
    }}''')
    return result.get('WikiArticle', [])

def add_seed(title, content, tags, domain="agent-insight", status="Planted"):
    """Create a new seed in Weaviate"""
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
        f"{WEAVIATE_URL}/v1/objects",
        data=json.dumps(seed).encode(),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"Error creating seed: {e}")
        return None

def pattern_agent(seeds, wiki_articles):
    """Find unexpected connections between seeds"""
    print(f"🔍 Pattern Agent: Analyzing {len(seeds)} seeds for patterns...")
    
    # Extract all tags and domains
    tag_map = {}
    for seed in seeds:
        tags = seed.get('tags', '') or ''
        domain = seed.get('domain', 'untagged')
        for tag in tags.split(',') if ',' in tags else [tags]:
            tag = tag.strip().lower()
            if tag and tag not in ('untitled', 'stub', 'none'):
                if tag not in tag_map:
                    tag_map[tag] = []
                tag_map[tag].append({
                    'title': seed.get('title', ''),
                    'domain': domain,
                    'content': (seed.get('content', '') or '')[:100]
                })
    
    # Find tags that connect different domains
    connections = []
    for tag, items in sorted(tag_map.items(), key=lambda x: len(x[1]), reverse=True)[:20]:
        domains = set(item['domain'] for item in items)
        if len(domains) > 1 and len(items) >= 3:
            connections.append({
                'tag': tag,
                'domains': list(domains),
                'seeds': items[:4]
            })
    
    # Generate insight report
    if connections:
        report = f"# Pattern Discovery Report\n\n"
        report += f"Found {len(connections)} cross-domain patterns in your Garden:\n\n"
        for i, conn in enumerate(connections[:5], 1):
            report += f"## {i}. \"{conn['tag']}\" connects {len(conn['domains'])} domains\n"
            report += f"Domains: {', '.join(conn['domains'])}\n"
            for seed in conn['seeds']:
                report += f"- {seed['title'][:50]} ({seed['domain']})\n"
            report += "\n"
        
        # Save as seed
        add_seed(
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
    
    # Group seeds by domain
    domain_counts = {}
    for seed in seeds:
        domain = seed.get('domain', 'untagged')
        if domain not in ('None', 'untagged', 'General'):
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
    
    # Check which domains have wiki articles
    wiki_domains = set()
    for article in wiki_articles:
        wiki_domains.add((article.get('category', '') or '').lower())
    
    # Find gaps
    gaps = []
    for domain, count in sorted(domain_counts.items(), key=lambda x: x[1], reverse=True):
        if domain.lower() not in wiki_domains and count >= 3:
            gaps.append({'domain': domain, 'count': count})
    
    if gaps:
        report = f"# Knowledge Gap Report\n\n"
        report += f"Found {len(gaps)} domains with seeds but no wiki article:\n\n"
        for gap in gaps:
            report += f"- **{gap['domain']}**: {gap['count']} seeds, no wiki article\n"
        
        # Save as seed
        add_seed(
            title=f"Knowledge Gaps: {len(gaps)} domains missing wiki coverage",
            content=report,
            tags="agent-insight, knowledge-gap, missing-wiki",
            domain="agent-insight"
        )
        print(f"✅ Saved gap report to Garden")
    else:
        print("ℹ️  No significant knowledge gaps found")
    
    return gaps

def trend_agent(seeds):
    """Analyze temporal patterns"""
    print(f"🔍 Trend Agent: Analyzing seed creation patterns...")
    
    # Get last 7 days of seeds
    week_ago = datetime.utcnow() - timedelta(days=7)
    month_ago = datetime.utcnow() - timedelta(days=30)
    
    weekly_seeds = []
    monthly_seeds = []
    
    for seed in seeds:
        created = seed.get('_additional', {}).get('creationTimeUnix', '')
        if created:
            try:
                dt = datetime.fromtimestamp(int(created) / 1000)
                if dt >= week_ago:
                    weekly_seeds.append(seed)
                if dt >= month_ago:
                    monthly_seeds.append(seed)
            except:
                pass
    
    # Find trending tags
    weekly_tags = []
    for seed in weekly_seeds:
        if seed.get('tags'):
            for tag in seed['tags'].split(','):
                tag = tag.strip().lower()
                if tag and tag not in ('untitled', 'stub'):
                    weekly_tags.append(tag)
    
    if weekly_tags:
        tag_freq = Counter(weekly_tags)
        trending = tag_freq.most_common(5)
        
        report = f"# Weekly Trend Report\n\n"
        report += f"Last 7 days: {len(weekly_seeds)} new seeds, {len(monthly_seeds)} this month\n\n"
        report += "## Trending Tags\n"
        for tag, count in trending:
            report += f"- **{tag}**: {count} mentions\n"
        
        # Save as seed
        add_seed(
            title=f"Weekly Trends: {trending[0][0]} ({trending[0][1]} mentions)",
            content=report,
            tags="agent-insight, weekly-trends, " + trending[0][0],
            domain="agent-insight"
        )
        print(f"✅ Saved weekly trends to Garden")
    else:
        print("ℹ️  No recent seeds to analyze")

def quality_agent(seeds):
    """Flag low-quality issues"""
    print(f"🔍 Quality Agent: Checking seed quality...")
    
    issues = []
    for seed in seeds:
        title = seed.get('title', '')
        content = seed.get('content', '') or ''
        tags = seed.get('tags', '') or ''
        domain = seed.get('domain', '') or ''
        
        if title.lower() == 'untitled':
            issues.append({'type': 'untitled', 'seed_id': seed.get('_additional', {}).get('id', '')})
        if not tags and title.lower() != 'untitled':
            issues.append({'type': 'no-tags', 'seed_id': seed.get('_additional', {}).get('id', ''), 'title': title})
        if len(content) < 50 and title.lower() != 'untitled':
            issues.append({'type': 'low-content', 'seed_id': seed.get('_additional', {}).get('id', ''), 'title': title[:40]})
    
    if issues:
        report = f"# Quality Report\n\n"
        report += f"Found {len(issues)} quality issues:\n\n"
        
        by_type = {}
        for issue in issues:
            t = issue['type']
            if t not in by_type:
                by_type[t] = []
            by_type[t].append(issue)
        
        for issue_type, items in by_type.items():
            report += f"- **{issue_type.replace('-', ' ').title()}**: {len(items)} seeds\n"
        
        report += "\n## Recommendations\n"
        if 'untitled' in by_type:
            report += f"- {len(by_type['untitled'])} seeds need titles\n"
        if 'no-tags' in by_type:
            report += f"- {len(by_type['no-tags'])} seeds need tags\n"
        if 'low-content' in by_type:
            report += f"- {len(by_type['low-content'])} seeds need more content\n"
        
        # Save as seed
        add_seed(
            title=f"Quality Issues: {len(issues)} seeds need attention",
            content=report,
            tags="agent-insight, quality-audit",
            domain="agent-insight"
        )
        print(f"✅ Saved quality report to Garden")
    else:
        print("ℹ️  No quality issues found")

def main():
    print("=" * 60)
    print(f"🌱 Garden Insight Agent - {INSIGHT_TYPE.capitalize()}")
    print("=" * 60)
    
    # Check OPENROUTER_API_KEY
    api_key = os.environ.get('OPENROUTER_API_KEY', '')
    if not api_key:
        print("⚠️ OPENROUTER_API_KEY not set, using local analysis only")
    
    seeds = get_seeds()
    wiki_articles = get_wiki_articles()
    
    print(f"📊 Seeds: {len(seeds)}, Wiki articles: {len(wiki_articles)}\n")
    
    if INSIGHT_TYPE == 'pattern':
        pattern_agent(seeds, wiki_articles)
    elif INSIGHT_TYPE == 'gap':
        gap_agent(seeds, wiki_articles)
    elif INSIGHT_TYPE == 'trend':
        trend_agent(seeds)
    elif INSIGHT_TYPE == 'quality':
        quality_agent(seeds)
    elif INSIGHT_TYPE == 'all':
        pattern_agent(seeds, wiki_articles)
        gap_agent(seeds, wiki_articles)
        trend_agent(seeds)
        quality_agent(seeds)
    
    print("\n✅ Garden Insight Agent complete!")

if __name__ == '__main__':
    main()
