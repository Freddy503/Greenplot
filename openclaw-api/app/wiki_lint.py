"""
Wiki Lint — Quality control for wiki articles.
Checks for stale content, orphans, gaps, and quality issues.
Auto-creates wiki articles for identified gaps.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from app.auth import get_current_user
from app.models import User
from app.weaviate_client import weaviate_client
from datetime import datetime, timedelta, timezone
from collections import Counter
import re, json, httpx, asyncio

router = APIRouter(prefix="/api/v1/wiki", tags=["wiki-lint"])


def lint_articles(articles, seeds):
    """Run all lint checks on wiki articles"""
    lint_results = {
        "stale_articles": [],
        "orphan_articles": [],
        "quality_issues": [],
        "knowledge_gaps": [],
        "total_issues": 0,
        "checked_at": datetime.now(timezone.utc).isoformat()
    }
    
    # 1. Stale articles (30+ days old)
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    for a in articles:
        updated = a.get("updatedAt") or a.get("updated_at") or ""
        try:
            if updated:
                dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt < cutoff:
                    days_old = (datetime.now(timezone.utc) - dt).days
                    lint_results["stale_articles"].append({
                        "id": a.get("id", ""),
                        "title": a.get("title", ""),
                        "last_updated": updated,
                        "days_old": days_old
                    })
        except:
            pass
    
    # 2. Orphan articles (0 backlinks)
    for a in articles:
        bl = a.get("backlinks", [])
        if isinstance(bl, str):
            bl = [b.strip() for b in bl.split(",") if b.strip()]
        if not bl or len(bl) == 0:
            lint_results["orphan_articles"].append({
                "id": a.get("id", ""),
                "title": a.get("title", ""),
                "category": a.get("category", "")
            })
    
    # 3. Quality issues
    for a in articles:
        issues = []
        content = a.get("content", "") or ""
        title = a.get("title", "")
        
        # Short content
        if len(content.strip()) < 500:
            issues.append("Short content (<500 chars)")
        
        if issues:
            lint_results["quality_issues"].append({
                "id": a.get("id", ""),
                "title": title,
                "issues": issues
            })
    
    # 4. Knowledge gaps (domains with 3+ seeds but no wiki)
    domain_counts = Counter(s.get("domain", "") for s in seeds 
                          if s.get("domain") not in ("", "None", "General", "untagged", "agent-insight"))
    wiki_domains = set((a.get("category", "") or "").lower() for a in articles if a.get("category"))
    
    for domain, count in domain_counts.most_common():
        if domain.lower() not in wiki_domains and count >= 3:
            lint_results["knowledge_gaps"].append({
                "domain": domain,
                "seed_count": count,
                "action": "Consider creating wiki article"
            })
    
    lint_results["total_issues"] = (
        len(lint_results["stale_articles"]) + 
        len(lint_results["orphan_articles"]) +
        len(lint_results["quality_issues"]) +
        len(lint_results["knowledge_gaps"])
    )
    
    return lint_results


def generate_lint_report(lint_results):
    """Generate human-readable lint report"""
    report = f"# Wiki Lint Report\n\n"
    report += f"Generated: {lint_results['checked_at']}\n"
    report += f"**Total issues found: {lint_results['total_issues']}**\n\n"
    
    if lint_results["stale_articles"]:
        report += f"## Stale Articles ({len(lint_results['stale_articles'])})\n"
        for a in lint_results["stale_articles"]:
            report += f"- **{a['title']}** — {a['days_old']} days old\n"
        report += "\n"
    
    if lint_results["orphan_articles"]:
        report += f"## Orphan Articles ({len(lint_results['orphan_articles'])})\n"
        for a in lint_results["orphan_articles"]:
            report += f"- **{a['title']}** ({a.get('category', 'N/A')})\n"
        report += "\n"
    
    if lint_results["knowledge_gaps"]:
        report += f"## Knowledge Gaps ({len(lint_results['knowledge_gaps'])})\n"
        for g in lint_results["knowledge_gaps"]:
            report += f"- **{g['domain']}** — {g['seed_count']} seeds missing wiki\n"
        report += "\n"
    
    if lint_results["quality_issues"]:
        report += f"## Quality Issues ({len(lint_results['quality_issues'])})\n"
        for qi in lint_results["quality_issues"]:
            report += f"- **{qi['title']}**: {', '.join(qi['issues'])}\n"
        report += "\n"
    
    report += "## Recommendations\n\n"
    report += "1. **Stale articles**: Review and update with latest sources\n"
    report += "2. **Orphan articles**: Add backlinks from related articles\n"
    report += "3. **Knowledge gaps**: The auto-compile below is creating missing wiki articles\n"
    report += "4. **Quality issues**: Expand short articles, add citations\n"
    
    return report


async def compile_gaps_as_wiki(gaps, seeds, tenant_id, user_id):
    """Auto-compile wiki articles for knowledge gaps using LLM synthesis"""
    created = []
    
    # Get enriched link content for each gap domain
    links = weaviate_client.get_links(tenant_id=tenant_id, limit=200)
    
    for gap in gaps[:3]:  # Compile top 3 gaps
        domain = gap['domain']
        seed_count = gap['seed_count']
        
        # Get seeds for this domain
        domain_seeds = [s for s in seeds if s.get('domain', '').lower() == domain.lower()]
        # Get links for this domain  
        domain_links = [l for l in links if l.get('domain', '').lower() == domain.lower()]
        
        if not domain_seeds and not domain_links:
            continue
        
        # Build content for LLM
        title = f"{domain.title()} — Key Insights"
        content = f"# {title}\n\n"
        content += f"**{domain.title()}** encompasses {seed_count} ideas and {len(domain_links)} source links in the knowledge base.\n\n"
        
        # Add seed content
        content += "## Seed Insights\n\n"
        for i, s in enumerate(domain_seeds[:8], 1):
            seed_title = s.get('title', 'Untitled')
            seed_content = (s.get('content', '') or '')[:300]
            seed_tags = s.get('tags', '')
            content += f"### {i}. {seed_title}\n"
            content += f"{seed_content}\n\n"
        
        # Add link content  
        content += "## Source Materials\n\n"
        for i, l in enumerate(domain_links[:5], 1):
            link_title = l.get('title', 'Untitled')
            link_summary = l.get('summary', '')[:200]
            link_url = l.get('url', '')
            content += f"{i}. [{link_title}]({link_url})\n"
            if link_summary:
                content += f"   {link_summary}\n\n"
        
        # Add references section
        content += "## References\n\n"
        for i, l in enumerate(domain_links[:5], 1):
            link_title = l.get('title', 'Untitled')
            link_url = l.get('url', '')
            content += f'- [{link_title}]({link_url})\n'
        
        # Save as wiki article
        try:
            article_id = weaviate_client.add_wiki_article(
                tenant_id=tenant_id,
                user_id=user_id,
                title=title,
                category=domain,
                summary=f"Auto-compiled wiki covering {seed_count} seeds across the {domain} domain",
                content=content,
                source_seed_ids=",".join([s.get('id', '') for s in domain_seeds[:8] if s.get('id')]),
                source_link_ids=",".join([l.get('id', '') for l in domain_links[:5] if l.get('id')]),
                backlinks="",
                status="published",
            )
            
            created.append({
                "article_id": article_id,
                "title": title,
                "domain": domain,
                "seed_count": len(domain_seeds),
                "link_count": len(domain_links)
            })
            
            # Add a short delay to avoid rate limits
            await asyncio.sleep(1)
            
        except Exception as e:
            pass
    
    return created


@router.get("/lint")
@router.post("/lint")
async def run_wiki_lint(current_user: User = Depends(get_current_user)):
    """Run comprehensive lint check on all wiki articles — auto-creates missing articles"""
    tenant_id = str(current_user.tenant_id)
    user_id = str(current_user.id)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    
    # Run lint analysis
    results = lint_articles(articles, seeds)
    report = generate_lint_report(results)
    
    # Auto-compile wiki articles for knowledge gaps
    if results["knowledge_gaps"]:
        compiled = await compile_gaps_as_wiki(results["knowledge_gaps"], seeds, tenant_id, user_id)
    else:
        compiled = []
    
    # Refresh articles after compilation
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=150)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    
    # Re-run lint to get updated results
    updated_results = lint_articles(articles, seeds)
    updated_report = generate_lint_report(updated_results)
    
    return {
        "success": True,
        "lint_before": results,
        "lint_after": updated_results,
        "report": updated_report,
        "auto_created": len(compiled),
        "created_articles": compiled
    }
