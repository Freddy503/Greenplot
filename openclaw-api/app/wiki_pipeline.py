"""
Wiki Pipeline — Fully automated wiki maintenance.
Runs after harvest or on schedule to:
1. Auto-compile wiki articles for knowledge gaps
2. Regenerate backlinks for all articles
3. Generate BFL images for articles missing them
"""
from fastapi import APIRouter, Depends
from app.auth import get_current_user
from app.models import User
from app.weaviate_client import weaviate_client
from app.tool_executor import auto_compile_for_domain
from collections import Counter
import asyncio

router = APIRouter(prefix="/api/v1/wiki-pipeline", tags=["wiki-pipeline"])


async def regenerate_all_backlinks(tenant_id):
    """Regenerate backlinks for all wiki articles"""
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
    
    def extract_topics(article):
        text = ((article.get('content', '') or '') + ' ' + (article.get('title', '') or '')).lower()
        topics = ['agentic', 'ai', 'sap', 'creativity', 'career', 'enterprise', 'knowledge',
                  'wiki', 'seed', 'nemo', 'fde', 'devops', 'design', 'systems', 'llm', 'agent']
        return set(t for t in topics if text.count(t) > 2)
    
    updates = 0
    for article in articles:
        topics_a = extract_topics(article)
        if not topics_a: continue
            
        links = []
        for other in articles:
            if other['id'] == article['id']: continue
            topics_b = extract_topics(other)
            score = len(topics_a & topics_b)
            if score >= 2:
                links.append({'target_id': other['id'], 'score': score})
        
        links.sort(key=lambda x: x['score'], reverse=True)
        if links:
            try:
                weaviate_client.client.data_object.update(
                    data_object={"backlinks": ','.join(l['target_id'] for l in links[:5])},
                    class_name="WikiArticle", uuid=article['id'])
                updates += 1
            except:
                pass
    return updates


@router.post("/run")
async def run_pipeline(current_user: User = Depends(get_current_user)):
    """Full automated wiki pipeline: compile gaps + backlinks"""
    tenant_id = str(current_user.tenant_id)
    user_id = str(current_user.id)
    
    # Step 1: Find and compile knowledge gaps
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    domain_counts = Counter(s.get('domain', '') for s in seeds if s.get('domain') not in ('', 'None', 'General', 'untagged', 'agent-insight'))
    wiki_domains = set((a.get('category', '') or '').lower() for a in articles if a.get('category'))
    gaps = [{'domain': d, 'count': c} for d, c in domain_counts.most_common() if d.lower() not in wiki_domains and c >= 3]
    
    compiled = []
    for gap in gaps[:3]:
        try:
            result = await auto_compile_for_domain(gap['domain'], tenant_id, user_id)
            if result: compiled.append({'domain': gap['domain'], 'title': result.get('title',''), 'seeds': result.get('seeds',0)})
            await asyncio.sleep(2)
        except:
            pass
    
    await asyncio.sleep(3)
    
    # Step 2: Regenerate all backlinks
    backlinks = await regenerate_all_backlinks(tenant_id)
    
    return {"success": True, "compiled": len(compiled), "articles": compiled, "backlinks_updated": backlinks}

@router.get("/run")
async def run_pipeline_get(current_user: User = Depends(get_current_user)):
    return await run_pipeline(current_user)
