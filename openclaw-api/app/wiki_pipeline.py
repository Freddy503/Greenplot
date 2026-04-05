"""
Wiki Pipeline - Fully automated wiki maintenance.
Run after harvest or on schedule to:
1. Auto-compile wiki articles for knowledge gaps
2. Regenerate backlinks for all articles
3. Generate BFL images for articles missing them
"""
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user, get_optional_user
from app.models import User
from app.weaviate_client import weaviate_client
from app.tool_executor import auto_compile_for_domain
import asyncio, json

router = APIRouter(prefix="/api/v1/wiki-pipeline", tags=["wiki-pipeline"])


async def regenerate_all_backlinks(tenant_id: str):
    """Regenerate backlinks for all wiki articles based on content similarity"""
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
    
    def extract_topics(article):
        content = (article.get('content', '') or '').lower()
        title = (article.get('title', '') or '').lower()
        text = title + ' ' + content
        topics = ['agentic', 'ai', 'sap', 'creativity', 'career', 'enterprise', 
                  'knowledge', 'wiki', 'seed', 'nemo', 'fde', 'devops', 'design', 
                  'systems', 'llm', 'agent', 'second brain', 'pipeline', 'automation']
        found = []
        for t in topics:
            if text.count(t) > 2:
                found.append(t)
        return set(found)
    
    updates = 0
    for article in articles:
        topics_a = extract_topics(article)
        if not topics_a:
            continue
            
        links = []
        for other in articles:
            if other['id'] == article['id']:
                continue
            topics_b = extract_topics(other)
            shared = topics_a & topics_b
            score = len(shared)
            if score >= 2:
                links.append({'target_id': other['id'], 'score': score})
        
        links.sort(key=lambda x: x['score'], reverse=True)
        if links:
            backlink_ids = ','.join(l['target_id'] for l in links[:5])
            try:
                weaviate_client.client.data_object.update(
                    data_object={"backlinks": backlink_ids},
                    class_name="WikiArticle",
                    uuid=article['id']
                )
                updates += 1
            except:
                pass
    
    return updates


async def compile_all_gaps(tenant_id: str, user_id: str):
    """Auto-compile wiki articles for all knowledge gaps"""
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    
    # Find gaps
    from collections import Counter
    domain_counts = Counter(s.get('domain', '') for s in seeds 
                          if s.get('domain') not in ('', 'None', 'General', 'untagged', 'agent-insight'))
    wiki_domains = set((a.get('category', '') or '').lower() for a in articles if a.get('category'))
    
    gaps = [{'domain': d, 'count': c} for d, c in domain_counts.most_common()
            if d.lower() not in wiki_domains and c >= 3]
    
    compiled = []
    for gap in gaps[:3]:  # Compile top 3 gaps to avoid rate limits
        try:
            result = await auto_compile_for_domain(gap['domain'], tenant_id, user_id)
            if result:
                compiled.append({
                    'domain': gap['domain'], 
                    'title': result.get('title', ''),
                    'seeds': result.get('seeds', 0)
                })
            await asyncio.sleep(2)  # Rate limit delay
        except:
            pass
    
    return compiled


@router.post("/run")
async def run_pipeline(current_user: User = Depends(get_current_user)):
    """Run the full wiki pipeline: compile gaps + regenerate backlinks"""
    tenant_id = str(current_user.tenant_id)
    user_id = str(current_user.id)
    
    # Step 1: Auto-compile gaps
    compiled = await compile_all_gaps(tenant_id, user_id)
    
    await asyncio.sleep(3)  # Wait for articles to be indexed
    
    # Step 2: Regenerate backlinks
    backlink_updates = await regenerate_all_backlinks(tenant_id)
    
    return {
        "success": True,
        "compiled_articles": len(compiled),
        "articles": compiled,
        "backlinks_updated": backlink_updates
    }


@router.get("/run")
async def run_pipeline_get(current_user: User = Depends(get_current_user)):
    return await run_pipeline(current_user)
