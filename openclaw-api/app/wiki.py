from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from app.auth import get_current_user
from app.weaviate_client import weaviate_client
from app.config import settings
import httpx
import json
import re

router = APIRouter(prefix="/api/v1/wiki", tags=["wiki"])


class WikiCompileRequest(BaseModel):
    seed_ids: Optional[List[str]] = None  # If empty, auto-detect clusters
    link_ids: Optional[List[str]] = None


class WikiUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────

@router.get("")
async def list_articles(
    request: Request,
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "recent",
    limit: int = 50,
):
    user = await get_current_user(request)
    tenant_id = str(user.tenant_id)

    articles = weaviate_client.get_wiki_articles(
        tenant_id=tenant_id,
        category=category,
        search=search,
        sort=sort,
        limit=limit,
    )
    return {"articles": articles}


@router.get("/health")
async def wiki_health(request: Request):
    user = await get_current_user(request)
    tenant_id = str(user.tenant_id)

    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
    links = weaviate_client.get_links(tenant_id=tenant_id, limit=200)

    total_articles = len(articles)
    total_links = len(links)
    enriched_links = len([l for l in links if l.get("status") == "enriched"])
    starred = len([l for l in links if l.get("starred")])

    # Categories breakdown
    categories = {}
    for a in articles:
        cat = a.get("category", "Uncategorized")
        categories[cat] = categories.get(cat, 0) + 1

    # Stale articles (>30 days without update)
    from datetime import datetime, timedelta
    stale = []
    cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
    for a in articles:
        if a.get("updatedAt", "") < cutoff:
            stale.append(a["title"])

    # Orphan links (not connected to any wiki article)
    linked_seed_ids = set()
    for a in articles:
        for sid in a.get("sourceSeedIds", []):
            linked_seed_ids.add(sid)

    # Connection density
    total_backlinks = sum(len(a.get("backlinks", [])) for a in articles)
    avg_backlinks = total_backlinks / total_articles if total_articles > 0 else 0

    return {
        "total_articles": total_articles,
        "total_links": total_links,
        "enriched_links": enriched_links,
        "starred_links": starred,
        "categories": categories,
        "stale_articles": stale,
        "total_backlinks": total_backlinks,
        "avg_backlinks": round(avg_backlinks, 1),
    }


@router.get("/suggestions")
async def get_suggestions(request: Request):
    """LLM-suggested exploration topics based on garden gaps."""
    user = await get_current_user(request)
    tenant_id = str(user.tenant_id)

    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
    links = weaviate_client.get_links(tenant_id=tenant_id, limit=200)

    # Find categories with few articles
    categories = {}
    for a in articles:
        cat = a.get("category", "Uncategorized")
        categories[cat] = categories.get(cat, 0) + 1

    suggestions = []

    # Suggest expanding thin categories
    for cat, count in sorted(categories.items(), key=lambda x: x[1]):
        if count < 3:
            suggestions.append({
                "type": "expand_category",
                "text": f"Expand '{cat}' — only {count} article(s)",
                "category": cat,
            })

    # Suggest creating articles from enriched links without wiki coverage
    enriched_no_wiki = [
        l for l in links
        if l.get("status") == "enriched" and not l.get("garden_seed_id")
    ]
    if enriched_no_wiki:
        suggestions.append({
            "type": "compile_from_links",
            "text": f"{len(enriched_no_wiki)} enriched links have no wiki article yet",
            "link_ids": [l["id"] for l in enriched_no_wiki[:5]],
        })

    # Suggest exploring starred items
    starred = [l for l in links if l.get("starred")]
    if starred:
        suggestions.append({
            "type": "deep_dive",
            "text": f"{len(starred)} starred items could be explored deeper",
            "titles": [l["title"] for l in starred[:5]],
        })

    return {"suggestions": suggestions}


@router.get("/{article_id}")
async def get_article(article_id: str, request: Request):
    user = await get_current_user(request)

    try:
        obj = weaviate_client.client.data_object.get_by_id(
            uuid=article_id,
            class_name="WikiArticle",
        )
        props = obj.get("properties", {})

        bl = props.get("backlinks", "")
        bl_list = [b.strip() for b in bl.split(",") if b.strip()] if bl else []
        ss = props.get("source_seed_ids", "")
        ss_list = [s.strip() for s in ss.split(",") if s.strip()] if ss else []
        sl = props.get("source_link_ids", "")
        sl_list = [s.strip() for s in sl.split(",") if s.strip()] if sl else []

        return {
            "id": obj.get("uuid", article_id),
            "title": props.get("title", ""),
            "category": props.get("category", ""),
            "summary": props.get("summary", ""),
            "content": props.get("content", ""),
            "sourceSeedIds": ss_list,
            "sourceLinkIds": sl_list,
            "backlinks": bl_list,
            "status": props.get("status", "published"),
            "healthScore": props.get("health_score", 50),
            "createdAt": props.get("created_at", ""),
            "updatedAt": props.get("updated_at", ""),
        }
    except Exception:
        raise HTTPException(status_code=404, detail="Article not found")


@router.post("/compile")
async def compile_article(body: WikiCompileRequest, request: Request):
    """Compile a wiki article from seed/link clusters."""
    user = await get_current_user(request)
    tenant_id = str(user.tenant_id)
    user_id = str(user.id)

    # Gather content from specified seeds/links, or auto-detect
    contents = []
    source_seed_ids = body.seed_ids or []
    source_link_ids = body.link_ids or []

    if not source_seed_ids and not source_link_ids:
        # Auto-detect: find enriched links not yet in wiki
        links = weaviate_client.get_links(tenant_id=tenant_id, limit=100)
        enriched = [l for l in links if l.get("status") == "enriched" and l.get("summary")]
        if not enriched:
            return {"ok": False, "message": "No enriched content to compile"}

        # Group by domain
        domain_groups = {}
        for l in enriched:
            d = l.get("domain", "general")
            if d not in domain_groups:
                domain_groups[d] = []
            domain_groups[d].append(l)

        # Pick the largest group
        best_domain = max(domain_groups, key=lambda d: len(domain_groups[d]))
        group = domain_groups[best_domain]

        for l in group[:8]:
            contents.append(f"## {l['title']}\n\n{l['summary']}")
            source_link_ids.append(l["id"])

        title = f"{best_domain} — Compiled Insights"
        category = _detect_category(best_domain, group)
    else:
        # Use specified seeds/links
        for lid in (source_link_ids or []):
            try:
                obj = weaviate_client.client.data_object.get_by_id(uuid=lid, class_name="Link")
                p = obj.get("properties", {})
                contents.append(f"## {p.get('title', 'Link')}\n\n{p.get('summary', '')}")
            except:
                pass

        title = "Compiled Article"
        category = "General"

    if not contents:
        return {"ok": False, "message": "No content found to compile"}

    # Generate article with LLM
    content = "\n\n---\n\n".join(contents)
    summary = contents[0][:200] if contents else ""

    article_id = weaviate_client.add_wiki_article(
        tenant_id=tenant_id,
        user_id=user_id,
        title=title,
        category=category,
        summary=summary,
        content=content,
        source_seed_ids=",".join(source_seed_ids),
        source_link_ids=",".join(source_link_ids),
        status="published",
        health_score=60,
    )

    return {"id": article_id, "title": title, "category": category}


@router.patch("/{article_id}")
async def update_article(article_id: str, body: WikiUpdate, request: Request):
    user = await get_current_user(request)

    updates = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.content is not None:
        updates["content"] = body.content
        updates["status"] = "user-edited"
    if body.category is not None:
        updates["category"] = body.category

    success = weaviate_client.update_wiki_article(article_id, **updates)
    if not success:
        raise HTTPException(status_code=404, detail="Article not found")

    return {"ok": True}


@router.post("/{article_id}/regenerate")
async def regenerate_article(article_id: str, request: Request):
    user = await get_current_user(request)
    # Placeholder: would re-run LLM synthesis on source seeds
    return {"ok": True, "message": "Regeneration queued"}


@router.delete("/{article_id}")
async def delete_article(article_id: str, request: Request):
    user = await get_current_user(request)
    success = weaviate_client.delete_wiki_article(article_id)
    if not success:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"ok": True}


def _detect_category(domain: str, links: list) -> str:
    """Simple heuristic category detection."""
    d = domain.lower()
    if "github" in d:
        return "Development"
    if "arxiv" in d or "scholar" in d:
        return "Research"
    if "youtube" in d:
        return "Media"
    if "twitter" in d or "x.com" in d:
        return "Social"
    if "notion" in d:
        return "Notes"
    # Check tags for hints
    all_tags = " ".join(l.get("tags", "") for l in links).lower()
    if "ai" in all_tags or "ml" in all_tags or "llm" in all_tags:
        return "AI & ML"
    if "design" in all_tags or "ux" in all_tags:
        return "Design"
    if "business" in all_tags or "startup" in all_tags:
        return "Business"
    return "General"
