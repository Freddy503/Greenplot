"""
Wiki Lint — Quality control for wiki articles.
Checks for stale content, contradictions, orphans, gaps, and quality issues.
"""
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user
from app.models import User
from app.weaviate_client import weaviate_client
from datetime import datetime, timedelta, timezone
from collections import Counter
import re, json

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
    
    # 1. Stale articles (no update in 30+ days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    for a in articles:
        updated = a.get("updatedAt") or a.get("updated_at") or ""
        try:
            if updated:
                # Handle ISO format
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
    
    # 3. Knowledge gaps (domains with 3+ seeds but no wiki)
    domain_counts = Counter(s.get("domain", "") for s in seeds 
                          if s.get("domain") not in ("", "None", "General", "untagged"))
    wiki_domains = set((a.get("category", "") or "").lower() for a in articles if a.get("category"))
    
    for domain, count in domain_counts.most_common():
        if domain.lower() not in wiki_domains and count >= 3:
            lint_results["knowledge_gaps"].append({
                "domain": domain,
                "seed_count": count,
                "action": "Consider creating wiki article"
            })
    
    # 4. Quality issues
    for a in articles:
        issues = []
        content = a.get("content", "") or ""
        title = a.get("title", "")
        
        # Short content
        if len(content.strip()) < 500:
            issues.append("Short content (<500 chars)")
        
        # No citations
        if "[1]" not in content and "Source" not in content and "source_link_ids" in a and not a.get("source_link_ids"):
            issues.append("No source citations")
        
        # No summary
        if not a.get("summary") or len(a.get("summary", "")) < 20:
            issues.append("Missing summary")
        
        if issues:
            lint_results["quality_issues"].append({
                "id": a.get("id", ""),
                "title": title,
                "issues": issues
            })
    
    lint_results["total_issues"] = (
        len(lint_results["stale_articles"]) + 
        len(lint_results["orphan_articles"]) +
        len(lint_results["quality_issues"]) +
        len(lint_results["knowledge_gaps"])
    )
    
    return lint_results


def generate_lint_report(lint_results):
    """Generate a human-readable lint report"""
    report = f"# Wiki Lint Report\n\n"
    report += f"Generated: {lint_results['checked_at']}\n"
    report += f"**Total issues found: {lint_results['total_issues']}**\n\n"
    
    # Stale articles
    if lint_results["stale_articles"]:
        report += f"## Stale Articles ({len(lint_results['stale_articles'])})\n"
        report += "Articles not updated in 30+ days:\n\n"
        for a in lint_results["stale_articles"]:
            report += f"- **{a['title']}** — {a['days_old']} days old\n"
        report += "\n"
    
    # Orphan articles
    if lint_results["orphan_articles"]:
        report += f"## Orphan Articles ({len(lint_results['orphan_articles'])})\n"
        report += "Articles with no backlinks (disconnected from knowledge graph):\n\n"
        for a in lint_results["orphan_articles"]:
            report += f"- **{a['title']}** ({a.get('category', 'N/A')})\n"
        report += "\n"
    
    # Knowledge gaps
    if lint_results["knowledge_gaps"]:
        report += f"## Knowledge Gaps ({len(lint_results['knowledge_gaps'])})\n"
        report += "Domains with seeds but no wiki coverage:\n\n"
        for g in lint_results["knowledge_gaps"]:
            report += f"- **{g['domain']}** — {g['seed_count']} seeds missing wiki article\n"
        report += "\n"
    
    # Quality issues
    if lint_results["quality_issues"]:
        report += f"## Quality Issues ({len(lint_results['quality_issues'])})\n"
        for qi in lint_results["quality_issues"]:
            report += f"- **{qi['title']}**: {', '.join(qi['issues'])}\n"
        report += "\n"
    
    report += "## Recommendations\n\n"
    report += "1. **Stale articles**: Review and update with latest sources, or remove if obsolete\n"
    report += "2. **Orphan articles**: Add backlinks from related articles or link from relevant wiki pages\n"
    report += "3. **Knowledge gaps**: Prioritize wiki creation for domains with most seeds\n"
    report += "4. **Quality issues**: Expand short articles, add citations for unsupported claims\n"
    
    return report


@router.get("/lint")
def run_wiki_lint(current_user: User = Depends(get_current_user)):
    """Run comprehensive lint check on all wiki articles"""
    tenant_id = str(current_user.tenant_id)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    
    results = lint_articles(articles, seeds)
    report = generate_lint_report(results)
    
    return {
        "success": True,
        "lint": results,
        "report": report
    }


@router.post("/lint")
def run_wiki_lint_post(current_user: User = Depends(get_current_user)):
    return run_wiki_lint(current_user)
