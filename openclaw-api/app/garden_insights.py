"""Garden Insight Agents - Autonomous pattern/gap/trend/quality discovery"""
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user
from app.models import User
from app.weaviate_client import weaviate_client
from collections import Counter
import urllib.request, json

router = APIRouter(prefix="/api/v1/garden", tags=["garden-insights"])
TENANT_PLACEHOLDER = "__TENANT_ID__"
USER_PLACEHOLDER = "__USER_ID__"


def _create_insight_seed(title, content, tags, domain, tenant_id, user_id, status="Planted"):
    seed = {
        "class": "IdeaSeed",
        "properties": {
            "title": title, "content": content, "tags": tags,
            "domain": domain, "status": status,
            "tenant_id": tenant_id, "user_id": str(user_id)
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
        return {"error": str(e)}


def _pattern_agent(seeds, wiki_articles, tenant_id, user_id):
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
            connections.append({'tag': tag, 'domains': list(domains), 'seeds': items[:4]})
    if not connections:
        return {"found": 0}
    report = "# Pattern Discovery Report\n\n"
    report += f"Found {len(connections)} cross-domain patterns:\n\n"
    for i, c in enumerate(connections[:5], 1):
        report += f"## {i}. \"{c['tag']}\" connects {len(c['domains'])} domains\n"
        report += f"Domains: {', '.join(c['domains'])}\n"
        for s in c['seeds']:
            report += f"- {s['title'][:50]} ({s['domain']})\n"
    _create_insight_seed(
        f"Pattern: {connections[0]['tag']} across {len(connections[0]['domains'])} domains",
        report, f"agent-insight, pattern, {connections[0]['tag']}", "agent-insight", tenant_id, user_id)
    return {"found": len(connections), "top": connections[:3]}


def _gap_agent(seeds, wiki_articles, tenant_id, user_id):
    domain_counts = Counter(s.get('domain', '') for s in seeds if s.get('domain') not in ('', 'None', 'General'))
    wiki_domains = set((a.get('category', '') or '').lower() for a in wiki_articles)
    gaps = [{'domain': d, 'count': c} for d, c in domain_counts.most_common() if d.lower() not in wiki_domains and c >= 3]
    if not gaps:
        return {"found": 0}
    report = "# Knowledge Gap Report\n\n"
    for g in gaps:
        report += f"- **{g['domain']}**: {g['count']} seeds, no wiki article\n"
    _create_insight_seed(f"Gaps: {len(gaps)} domains missing wiki", report,
                         "agent-insight, knowledge-gap", "agent-insight", tenant_id, user_id)
    return {"found": len(gaps), "gaps": gaps}


def _trend_agent(seeds, tenant_id, user_id):
    domain_counts = Counter(s.get('domain', '') for s in seeds)
    all_tags = []
    for s in seeds:
        if s.get('tags'):
            all_tags.extend(t.strip().lower() for t in s['tags'].split(',')
                            if t.strip() and t.strip() not in ('untitled', 'stub'))
    tag_counts = Counter(all_tags)
    report = f"# Garden Trends ({len(seeds)} seeds)\n\n## Top Domains\n"
    for d, c in domain_counts.most_common(10):
        if d: report += f"- **{d}**: {c}\n"
    report += "\n## Top Tags\n"
    for t, c in tag_counts.most_common(15):
        report += f"- **{t}**: {c}\n"
    top = tag_counts.most_common(1)[0] if tag_counts else ("none", 0)
    _create_insight_seed(f"Trends: top tag is {top[0]} ({top[1]} mentions)", report,
                         "agent-insight, trends, analytics", "agent-insight", tenant_id, user_id)
    return {"total": len(seeds), "domains": domain_counts.most_common(10), "tags": tag_counts.most_common(15)}


def _quality_agent(seeds, tenant_id, user_id):
    issues = []
    for s in seeds:
        t = (s.get('title') or '').strip()
        if t.lower() in ('untitled', ''): issues.append('untitled')
        tags = s.get('tags') or ''
        if not tags or tags.strip() in ('', 'untitled', 'stub'): issues.append('no-tags')
        content = s.get('content') or ''
        if len(content.strip()) < 50: issues.append('low-content')
        if not s.get('domain'): issues.append('no-domain')
    if not issues:
        return {"found": 0}
    by_type = dict(Counter(issues).most_common())
    report = f"# Quality Report\n\nFound {len(issues)} issues:\n"
    for k, v in by_type.items():
        report += f"- **{k.replace('-', ' ').title()}**: {v}\n"
    _create_insight_seed(f"Quality: {len(issues)} issues found", report,
                         "agent-insight, quality-audit", "agent-insight", tenant_id, user_id)
    return {"found": len(issues), "by_type": by_type}


@router.get("/skim/{agent_type}")
def skim_garden(agent_type: str, current_user: User = Depends(get_current_user)):
    if agent_type not in ("pattern", "gap", "trend", "quality", "all"):
        raise HTTPException(400, "Unknown agent type. Use: pattern|gap|trend|quality|all")
    tenant_id = str(current_user.tenant_id)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    wiki_articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
    results = {}
    if agent_type in ("pattern", "all"): results["pattern"] = _pattern_agent(seeds, wiki_articles, tenant_id, str(current_user.id))
    if agent_type in ("gap", "all"): results["gap"] = _gap_agent(seeds, wiki_articles, tenant_id, str(current_user.id))
    if agent_type in ("trend", "all"): results["trend"] = _trend_agent(seeds, tenant_id, str(current_user.id))
    if agent_type in ("quality", "all"): results["quality"] = _quality_agent(seeds, tensor_id, str(current_user.id))
    return {"success": True, "insights": results}


@router.post("/skim/{agent_type}")
async def skim_garden_post(agent_type: str, current_user: User = Depends(get_current_user)):
    return skim_garden(agent_type, current_user)
