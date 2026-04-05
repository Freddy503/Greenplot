"""
Garden Insight Agents — scan the garden for patterns, gaps, trends, and quality issues.
Can be triggered via API endpoint or cron job.
"""
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user
from app.models import User
from app.weaviate_client import weaviate_client
from collections import Counter
from datetime import datetime
import json, urllib.request, os

router = APIRouter(prefix="/api/v1/garden", tags=["garden-skimmer"])


def create_insight_seed(title: str, content: str, tags: str, domain: str,
                        tenant_id: str, user_id: str, status: str = "Planted"):
    """Save insight as a new seed in Weaviate"""
    seed = {
        "class": "IdeaSeed",
        "properties": {
            "title": title, "content": content, "tags": tags,
            "domain": domain, "status": status,
            "tenant_id": tenant_id, "user_id": str(user_id)
        }
    }
    try:
        weaviate_client.client.data_object.create(
            data_object=seed["properties"],
            class_name="IdeaSeed",
            tenant=seed["properties"]["tenant_id"]
        )
        return {"created": True, "title": title}
    except Exception as e:
        return {"created": False, "error": str(e)}


def pattern_agent(seeds: list, wiki: list, tenant_id: str, user_id: str) -> dict:
    """Find cross-domain tag patterns"""
    tag_map = {}
    for s in seeds:
        domain = s.get('domain', 'untagged')
        for tag in (s.get('tags') or '').split(','):
            t = tag.strip().lower()
            if t and t not in ('untitled', 'stub', 'none', ''):
                tag_map.setdefault(t, set()).add(domain)

    multi_domain = {tag: sorted(domains) for tag, domains in tag_map.items() if len(domains) > 1}
    top = sorted(multi_domain.items(), key=lambda x: len(x[1]), reverse=True)[:5]

    if top:
        report = "# Garden Pattern Discovery Report\n\n"
        report += f"Found {len(multi_domain)} tags spanning multiple domains:\n\n"
        for rank, (tag, domains) in enumerate(top, 1):
            report += f"{rank}. **{tag}** → {', '.join(domains)}\n"
        report += "\n💡 These tags connect different parts of your garden — explore cross-pollination opportunities."
        create_insight_seed(f"Pattern: {top[0][0]} spans {len(top[0][1])} domains",
                          report, f"agent-insight, pattern, {top[0][0]}", "agent-insight", tenant_id, user_id)

    return {"found": len(top), "patterns": [{"tag": t, "domains": d} for t, d in top[:5]]}


def gap_agent(seeds: list, wiki: list, tenant_id: str, user_id: str) -> dict:
    """Find domains with many seeds but no wiki article"""
    domain_counts = Counter(s.get('domain', '') for s in seeds
                          if s.get('domain') not in ('', 'None', 'General', 'untagged'))
    wiki_domains = set((a.get('category', '') or '').lower() for a in wiki)

    gaps = [{'domain': d, 'count': c} for d, c in domain_counts.most_common()
            if d.lower() not in wiki_domains and c >= 3]

    if gaps:
        report = "# Knowledge Gap Report\n\n"
        report += "These domains have 3+ seeds but no wiki coverage:\n\n"
        for g in gaps[:10]:
            report += f"- **{g['domain']}**: {g['count']} seeds\n"
        report += "\n💡 Consider creating wiki articles for these high-value domains."
        create_insight_seed(f"Gap: {len(gaps)} domains lack wiki coverage",
                          report, "agent-insight, knowledge-gap", "agent-insight", tenant_id, user_id)

    return {"found": len(gaps), "gaps": gaps[:5]}


def trend_agent(seeds: list, tenant_id: str, user_id: str) -> dict:
    """Analyze domain and tag distribution"""
    domain_counts = Counter(s.get('domain', '') for s in seeds if s.get('domain'))
    all_tags = []
    for s in seeds:
        if s.get('tags'):
            all_tags.extend(t.strip() for t in s['tags'].split(',')
                          if t.strip() and t.strip().lower() not in ('untitled', 'stub'))
    tag_counts = Counter(all_tags)

    report = f"# Garden Analytics ({len(seeds)} seeds)\n\n"
    report += "## Top Domains\n"
    for d, c in domain_counts.most_common(8):
        report += f"- **{d}**: {c} seeds\n"
    report += "\n## Top Tags\n"
    for t, c in tag_counts.most_common(12):
        report += f"- **{t}**: {c}\n"

    create_insight_seed(f"Trend: garden has {len(seeds)} seeds across {len(domain_counts)} domains",
                       report, "agent-insight, analytics, trends", "agent-insight", tenant_id, user_id)

    return {"total_seeds": len(seeds), "top_tag": tag_counts.most_common(1),
            "domains": dict(domain_counts.most_common(8))}


def quality_agent(seeds: list, tenant_id: str, user_id: str) -> dict:
    """Flag quality issues"""
    issues = {"untitled": 0, "no-tags": 0, "low-content": 0, "no-domain": 0}
    for s in seeds:
        t = (s.get('title') or '').strip()
        if t.lower() in ('untitled', ''): issues["untitled"] += 1
        tags = (s.get('tags') or '').strip()
        if not tags or tags.lower() in ('untitled', 'stub', 'none'): issues["no-tags"] += 1
        if len((s.get('content') or '').strip()) < 50: issues["low-content"] += 1
        if not s.get('domain') or not s['domain'].strip(): issues["no-domain"] += 1

    total = sum(issues.values())
    if total > 0:
        report = f"# Garden Quality Report\n\nFound {total} quality issues:\n\n"
        for k, v in issues.items():
            if v > 0:
                report += f"- **{k.replace('-', ' ').title()}**: {v}\n"
        report += "\n💡 Fix these to improve garden quality and discoverability."
        create_insight_seed(f"Quality: {total} issues found across {len(seeds)} seeds",
                           report, "agent-insight, quality-audit", "agent-insight", tenant_id, user_id)

    return {"total_issues": total, "by_type": {k: v for k, v in issues.items() if v > 0}}


@router.post("/skim")
def run_skim(current_user: User = Depends(get_current_user)):
    """Run all garden insight agents — finds patterns, gaps, trends, and quality issues"""
    tenant_id = str(current_user.tenant_id)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    wiki = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)

    return {
        "success": True,
        "insights": {
            "pattern": pattern_agent(seeds, wiki, tenant_id, str(current_user.id)),
            "gap": gap_agent(seeds, wiki, tenant_id, str(current_user.id)),
            "trend": trend_agent(seeds, tenant_id, str(current_user.id)),
            "quality": quality_agent(seeds, tenant_id, str(current_user.id)),
        },
        "generated_at": datetime.utcnow().isoformat() + "Z"
    }
