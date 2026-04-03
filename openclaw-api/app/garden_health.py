from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional, List
from app.auth import get_current_user
from app.weaviate_client import weaviate_client
from app.config import settings
import httpx
import json
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/v1/garden", tags=["garden"])


class AskRequest(BaseModel):
    question: str
    limit: int = 8


# ── P1.2: Garden Health Dashboard ─────────────────────

@router.get("/health")
async def garden_health(request: Request):
    """Combined health dashboard for links + seeds + wiki."""
    user = await get_current_user(request)
    tenant_id = str(user.tenant_id)

    links = weaviate_client.get_links(tenant_id=tenant_id, limit=500)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=500)

    # Link stats
    total_links = len(links)
    enriched_links = len([l for l in links if l.get("status") == "enriched"])
    pending_links = len([l for l in links if l.get("status") == "pending"])
    starred_links = len([l for l in links if l.get("starred")])
    connected_links = len([l for l in links if l.get("connection_count", 0) > 0 or l.get("garden_seed_id")])

    # Domain breakdown
    domains = {}
    for l in links:
        d = l.get("domain", "unknown")
        domains[d] = domains.get(d, 0) + 1
    top_domains = sorted(domains.items(), key=lambda x: x[1], reverse=True)[:10]

    # Wiki stats
    total_articles = len(articles)
    wiki_categories = {}
    for a in articles:
        cat = a.get("category", "Uncategorized")
        wiki_categories[cat] = wiki_categories.get(cat, 0) + 1

    # Orphans: links with no connections and no wiki article
    wiki_source_link_ids = set()
    for a in articles:
        for lid in a.get("sourceLinkIds", []):
            wiki_source_link_ids.add(lid)
    orphan_links = [
        l for l in links
        if l.get("id") not in wiki_source_link_ids
        and not l.get("garden_seed_id")
        and l.get("connection_count", 0) == 0
    ]

    # Stale: enriched but no wiki article in 7+ days
    cutoff = (datetime.utcnow() - timedelta(days=7)).isoformat()
    stale_enriched = [
        l for l in links
        if l.get("status") == "enriched"
        and l.get("id") not in wiki_source_link_ids
        and l.get("addedAt", "") < cutoff
    ]

    # Coverage percentages
    enrichment_coverage = round(enriched_links / total_links * 100) if total_links > 0 else 0
    wiki_coverage = round(len(wiki_source_link_ids) / enriched_links * 100) if enriched_links > 0 else 0

    # Connection density
    total_connections = sum(l.get("connection_count", 0) for l in links)
    avg_connections = round(total_connections / total_links, 1) if total_links > 0 else 0

    # Suggestions
    suggestions = []
    if pending_links > 0:
        suggestions.append({
            "type": "enrich",
            "icon": "auto_fix_high",
            "text": f"{pending_links} links need enrichment",
            "action": "enrich-pending",
            "priority": "high",
        })
    if len(orphan_links) >= 3:
        suggestions.append({
            "type": "connect",
            "icon": "link",
            "text": f"{len(orphan_links)} orphan links with no connections",
            "action": "detect-connections",
            "priority": "medium",
        })
    if len(stale_enriched) >= 3:
        suggestions.append({
            "type": "compile",
            "icon": "auto_stories",
            "text": f"{len(stale_enriched)} enriched links ready for wiki compilation",
            "action": "compile-wiki",
            "priority": "medium",
        })
    if starred_links > 0 and total_articles == 0:
        suggestions.append({
            "type": "start-wiki",
            "icon": "menu_book",
            "text": f"You have {starred_links} starred items — compile your first wiki article",
            "action": "compile-wiki",
            "priority": "high",
        })

    return {
        "summary": {
            "total_links": total_links,
            "enriched_links": enriched_links,
            "pending_links": pending_links,
            "starred_links": starred_links,
            "connected_links": connected_links,
            "total_articles": total_articles,
            "orphan_links": len(orphan_links),
            "stale_enriched": len(stale_enriched),
        },
        "coverage": {
            "enrichment": enrichment_coverage,
            "wiki": wiki_coverage,
        },
        "connections": {
            "total": total_connections,
            "average": avg_connections,
        },
        "top_domains": [{"domain": d, "count": c} for d, c in top_domains],
        "wiki_categories": wiki_categories,
        "suggestions": suggestions,
    }


# ── P2.2: Chat Against Garden ─────────────────────────

@router.post("/ask")
async def ask_garden(body: AskRequest, request: Request):
    """Ask a question against the user's knowledge garden. Retrieves relevant items and generates a grounded answer."""
    user = await get_current_user(request)
    tenant_id = str(user.tenant_id)

    question = body.question.strip()
    if not question:
        return {"answer": "Please ask a question.", "sources": []}

    # Search across links and wiki articles
    links = weaviate_client.get_links(tenant_id=tenant_id, limit=200)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)

    # Simple relevance scoring: word overlap with question
    q_words = set(question.lower().split())
    scored_items = []

    for link in links:
        searchable = f"{link.get('title', '')} {link.get('summary', '')} {link.get('tags', '')}".lower()
        words = set(searchable.split())
        overlap = len(q_words & words)
        if overlap > 0:
            scored_items.append({
                "score": overlap,
                "type": "link",
                "id": link.get("id", ""),
                "title": link.get("title", ""),
                "domain": link.get("domain", ""),
                "summary": link.get("summary", ""),
                "url": link.get("url", ""),
            })

    for article in articles:
        searchable = f"{article.get('title', '')} {article.get('summary', '')} {article.get('content', '')[:500]}".lower()
        words = set(searchable.split())
        overlap = len(q_words & words)
        if overlap > 0:
            scored_items.append({
                "score": overlap + 1,  # Wiki articles get slight boost
                "type": "wiki",
                "id": article.get("id", ""),
                "title": article.get("title", ""),
                "category": article.get("category", ""),
                "summary": article.get("summary", ""),
                "content_snippet": article.get("content", "")[:300],
            })

    # Sort by relevance, take top N
    scored_items.sort(key=lambda x: x["score"], reverse=True)
    top_sources = scored_items[:body.limit]

    if not top_sources:
        return {
            "answer": "I couldn't find relevant information in your garden for that question. Try adding more links or enriching your existing ones.",
            "sources": [],
        }

    # Build context for LLM
    context_parts = []
    for i, src in enumerate(top_sources, 1):
        if src["type"] == "wiki":
            context_parts.append(f"[{i}] Wiki: {src['title']} ({src.get('category', '')})\n{src.get('summary', '')}\n{src.get('content_snippet', '')}")
        else:
            context_parts.append(f"[{i}] Link: {src['title']} ({src.get('domain', '')})\n{src.get('summary', '')}")

    context = "\n\n".join(context_parts)

    # Call LLM for answer
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.OPENROUTER_BASE_URL or 'https://openrouter.ai/api/v1'}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "nvidia/llama-3.1-nemotron-70b-instruct:free",
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a helpful assistant answering questions based on the user's personal knowledge garden. Use the provided sources to answer. Reference sources by number like [1], [2]. Be concise and insightful.",
                        },
                        {
                            "role": "user",
                            "content": f"Sources:\n{context}\n\nQuestion: {question}",
                        },
                    ],
                    "max_tokens": 500,
                    "temperature": 0.7,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                answer = data["choices"][0]["message"]["content"]
            else:
                answer = f"Based on your garden, I found {len(top_sources)} relevant items. Here's what I found:\n\n" + "\n".join(
                    f"• {s['title']}: {s.get('summary', '')[:100]}" for s in top_sources[:5]
                )
    except Exception:
        answer = f"Based on your garden, I found {len(top_sources)} relevant items:\n\n" + "\n".join(
            f"• {s['title']}: {s.get('summary', '')[:100]}" for s in top_sources[:5]
        )

    # Format sources for frontend
    formatted_sources = []
    for s in top_sources:
        formatted_sources.append({
            "id": s.get("id", ""),
            "type": s["type"],
            "title": s.get("title", ""),
            "domain": s.get("domain", s.get("category", "")),
            "summary": s.get("summary", "")[:150],
        })

    return {"answer": answer, "sources": formatted_sources}
