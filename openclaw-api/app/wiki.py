from fastapi import APIRouter, HTTPException, Request, Header, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.auth import get_current_user
from app.weaviate_client import weaviate_client
from app.config import settings
import httpx

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
    current_user = Depends(get_current_user),
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "recent",
    limit: int = 50,
):
    user = current_user
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
async def wiki_health(request: Request, current_user = Depends(get_current_user)):
    user = current_user
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
async def get_suggestions(request: Request, current_user = Depends(get_current_user)):
    """LLM-suggested exploration topics based on garden gaps."""
    user = current_user
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



@router.post("/compile")
async def compile_article(body: WikiCompileRequest, request: Request, current_user = Depends(get_current_user)):
    """Compile a wiki article from seed/link clusters."""
    user = current_user
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

    # LLM synthesis: generate a structured wiki article from source content
    raw_content = "\n\n---\n\n".join(contents)

    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if api_key:
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "nvidia/llama-3.1-nemotron-70b-instruct:free",
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a knowledge synthesizer. Given multiple source materials, "
                                    "write a structured wiki article in markdown. Include:\n"
                                    "- A compelling title\n"
                                    "- A 2-3 sentence overview/summary\n"
                                    "- Key themes as ## headings with bullet points\n"
                                    "- Connections between sources\n"
                                    "- A 'Key Takeaways' section at the end\n"
                                    "Write in clear, concise prose. Use markdown formatting."
                                ),
                            },
                            {
                                "role": "user",
                                "content": f"Compile these sources into a wiki article about: {title}\n\nSources:\n{raw_content}",
                            },
                        ],
                        "max_tokens": 1000,
                        "temperature": 0.7,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    synthesized = data["choices"][0]["message"]["content"]
                    # Extract title from first # heading if present
                    for line in synthesized.split("\n"):
                        if line.startswith("# "):
                            title = line[2:].strip()
                            break
                    content = synthesized
                    # Extract summary: first paragraph after headings
                    summary_lines = []
                    in_content = False
                    for line in synthesized.split("\n"):
                        if line.startswith("#"):
                            in_content = True
                            continue
                        if in_content and line.strip():
                            summary_lines.append(line.strip())
                            if len(summary_lines) >= 2:
                                break
                    summary = " ".join(summary_lines)[:300] if summary_lines else contents[0][:200]
                else:
                    content = raw_content
                    summary = contents[0][:200] if contents else ""
        except Exception:
            content = raw_content
            summary = contents[0][:200] if contents else ""
    else:
        content = raw_content
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



@router.post("/auto-compile")
async def auto_compile(request: Request, x_api_key: str = Header(default="")):
    """Auto-compile wiki articles from enriched link clusters not yet in wiki.

    Supports both JWT auth and X-API-Key (for cron jobs).
    """
    # Try API key first (for cron jobs)
    import os
    harvest_key = os.environ.get("HARVEST_API_KEY", "<HARVEST_API_KEY>")
    if x_api_key == harvest_key:
        # Use first available tenant for API key auth
        # In production, you'd want a dedicated cron tenant
        try:
            from app.database import get_db
            from app.models import User
            db = next(get_db())
            user = db.query(User).first()
            tenant_id = str(user.tenant_id)
            user_id = str(user.id)
            db.close()
        except Exception:
            raise HTTPException(status_code=500, detail="No users found for API key auth")
    else:
        raise HTTPException(status_code=401, detail="API key required for auto-compile (use X-API-Key header)")

    # 1. Get all enriched links
    links = weaviate_client.get_links(tenant_id=tenant_id, limit=200)
    enriched = [l for l in links if l.get("status") == "enriched" and l.get("summary")]
    if not enriched:
        return {"ok": True, "compiled": 0, "message": "No enriched links available"}

    # 2. Get existing wiki articles and their source link IDs
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
    covered_link_ids = set()
    for article in articles:
        for lid in article.get("sourceLinkIds", []):
            covered_link_ids.add(lid)
        # Also check by domain — don't create duplicate domain articles
        pass

    # 3. Find enriched links NOT yet in any wiki article
    uncovered = [l for l in enriched if l.get("id") not in covered_link_ids]
    if not uncovered:
        return {"ok": True, "compiled": 0, "message": "All enriched links already in wiki"}

    # 4. Group by domain
    domain_groups = {}
    for l in uncovered:
        d = l.get("domain", "").strip().lower()
        if not d:
            d = "general"
        if d not in domain_groups:
            domain_groups[d] = []
        domain_groups[d].append(l)

    # 5. Skip domains that already have a wiki article
    existing_domains = set()
    for article in articles:
        cat = article.get("category", "").strip().lower()
        if cat:
            existing_domains.add(cat)

    # 6. Compile eligible clusters (3+ links, no existing article)
    compiled = 0
    results = []

    for domain, group in domain_groups.items():
        if len(group) < 3:
            continue
        if domain in existing_domains:
            continue

        # Build content from links
        contents = []
        source_link_ids = []
        for l in group[:8]:
            contents.append(f"## {l.get('title', 'Untitled')}\n\n{l.get('summary', '')}")
            source_link_ids.append(l.get("id", ""))

        if not contents:
            continue

        raw_content = "\n\n---\n\n".join(contents)
        title = f"{domain.title()} — Compiled Insights"
        category = _detect_category(domain, group)

        # LLM synthesis
        api_key = getattr(settings, "OPENROUTER_API_KEY", None)
        article_content = f"# {title}\n\nAuto-compiled from {len(group)} enriched links.\n\n{raw_content}"

        if api_key:
            try:
                async with httpx.AsyncClient(timeout=45) as client:
                    resp = await client.post(
                        "https://openrouter.ai/api/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": "nvidia/llama-3.1-nemotron-70b-instruct:free",
                            "messages": [
                                {
                                    "role": "system",
                                    "content": (
                                        "You are a knowledge synthesizer. Given multiple source materials, "
                                        "write a structured wiki article in markdown. Include:\n"
                                        "- A compelling title\n"
                                        "- A 2-3 sentence overview/summary\n"
                                        "- Key themes as ## headings with bullet points\n"
                                        "- Connections between sources\n"
                                        "- A 'Key Takeaways' section at the end\n"
                                        "Write in clear, concise prose. Use markdown formatting."
                                    ),
                                },
                                {"role": "user", "content": f"Synthesize these {len(contents)} sources about {domain}:\n\n{raw_content}"},
                            ],
                            "temperature": 0.4,
                            "max_tokens": 2000,
                        },
                    )
                    if resp.status_code == 200:
                        llm_content = resp.json()["choices"][0]["message"]["content"]
                        if llm_content and len(llm_content) > 100:
                            article_content = llm_content
            except Exception:
                pass  # Fallback to basic content

        # Extract summary (first paragraph or first 200 chars)
        lines = article_content.split("\n")
        summary_lines = []
        for line in lines:
            if line.strip() and not line.startswith("#"):
                summary_lines.append(line.strip())
                if len(" ".join(summary_lines)) > 200:
                    break
        summary = " ".join(summary_lines)[:300]

        # Create wiki article
        try:
            article_id = weaviate_client.add_wiki_article(
                tenant_id=tenant_id,
                user_id=user_id,
                title=title,
                category=category,
                summary=summary,
                content=article_content,
                source_seed_ids="",
                source_link_ids=",".join(source_link_ids),
                backlinks="",
                status="published",
            )
            compiled += 1
            results.append({"id": article_id, "title": title, "links": len(source_link_ids)})
        except Exception:
            continue

    return {"ok": True, "compiled": compiled, "articles": results}



@router.post("/from-text")
async def create_from_text(body: dict, request: Request, current_user = Depends(get_current_user)):
    """Create a wiki article from raw text (e.g., chat response)."""
    user = current_user
    tenant_id = str(user.tenant_id)
    user_id = str(user.id)

    text = body.get("text", "").strip()
    if not text or len(text) < 50:
        raise HTTPException(status_code=400, detail="Text too short (min 50 chars)")

    title = body.get("title") or text.split("\n")[0].replace("#", "").strip()[:80] or "Chat Insight"
    source_seed_ids = body.get("source_seed_ids", [])
    source_link_ids = body.get("source_link_ids", [])

    # LLM synthesis to structure the content
    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    article_content = f"# {title}\n\n{text}"

    if api_key:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "nvidia/llama-3.1-nemotron-70b-instruct:free",
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "Turn this raw text into a well-structured wiki article in markdown. "
                                    "Add a clear title, organize into sections, extract key points as bullets. "
                                    "Keep all substantive content. Use markdown formatting."
                                ),
                            },
                            {"role": "user", "content": text},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 1500,
                    },
                )
                if resp.status_code == 200:
                    llm_content = resp.json()["choices"][0]["message"]["content"]
                    if llm_content and len(llm_content) > 100:
                        article_content = llm_content
        except Exception:
            pass

    # Extract summary
    plain = article_content.replace("#", "").replace("*", "").replace("_", "")
    summary = plain[:300].strip()

    # Detect category from content
    category = _detect_category(title.lower(), [{"domain": text[:200].lower()}])

    # Create article
    article_id = weaviate_client.add_wiki_article(
        tenant_id=tenant_id,
        user_id=user_id,
        title=title,
        category=category,
        summary=summary,
        content=article_content,
        source_seed_ids=",".join(source_seed_ids) if isinstance(source_seed_ids, list) else str(source_seed_ids),
        source_link_ids=",".join(source_link_ids) if isinstance(source_link_ids, list) else str(source_link_ids),
        backlinks="",
        status="published",
    )

    return {"ok": True, "id": article_id, "title": title}



@router.get("/stale")
async def get_stale_articles(request: Request, current_user = Depends(get_current_user)):
    """Find wiki articles that may need recompilation (new content since last compile)."""
    user = current_user
    tenant_id = str(user.tenant_id)

    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
    links = weaviate_client.get_links(tenant_id=tenant_id, limit=200)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=200)

    stale = []

    for article in articles:
        source_link_ids = set(article.get("sourceLinkIds", []))
        category = article.get("category", "").lower()
        updated_at = article.get("updatedAt", "")

        # Find new links in same domain that aren't in this article
        new_related = [
            l for l in links
            if l.get("domain", "").lower() == category
            and l.get("id") not in source_link_ids
            and l.get("status") == "enriched"
        ]

        if new_related:
            stale.append({
                "id": article["id"],
                "title": article["title"],
                "category": category,
                "new_links": len(new_related),
                "last_updated": updated_at,
                "suggestion": f"Recompile to include {len(new_related)} new {category} links",
            })

    return {"stale": stale, "total_articles": len(articles)}


@router.get("/export/obsidian")
async def export_obsidian(request: Request, current_user = Depends(get_current_user)):
    """Export entire wiki as Obsidian-compatible markdown with wikilinks."""
    import zipfile
    import io

    user = current_user
    tenant_id = str(user.tenant_id)

    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=500)

    if not articles:
        raise HTTPException(status_code=404, detail="No articles to export")

    # Build ID→title map for wikilinks
    id_to_title = {a["id"]: a["title"] for a in articles}

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Create folder structure by category
        for article in articles:
            category = article.get("category", "General")
            title = article["title"]
            slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
            filename = f"{category}/{slug}.md"

            # Convert backlink IDs to wikilinks
            content = article.get("content", "")
            for bl_id in article.get("backlinks", []):
                bl_title = id_to_title.get(bl_id, "")
                if bl_title:
                    content = content.replace(bl_id, f"[[{bl_title}]]")

            md = f"# {title}\n\n"
            if article.get("summary"):
                md += f"> {article['summary']}\n\n"
            md += content
            md += "\n"

            zf.writestr(filename, md)

        # Add index file
        index = "# GreenPlot Wiki Index\n\n"
        for article in sorted(articles, key=lambda a: a.get("category", "")):
            cat = article.get("category", "General")
            slug = re.sub(r'[^a-z0-9]+', '-', article["title"].lower()).strip('-')
            index += f"- [[{article['title']}]] ({cat})\n"
        zf.writestr("INDEX.md", index)

    zip_buffer.seek(0)
    from fastapi.responses import Response
    return Response(
        content=zip_buffer.read(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="greenplot-wiki.zip"'},
    )



@router.get("/{article_id}")
async def get_article(article_id: str, request: Request, current_user = Depends(get_current_user)):
    user = current_user

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



@router.patch("/{article_id}")
async def update_article(article_id: str, body: WikiUpdate, request: Request, current_user = Depends(get_current_user)):
    user = current_user

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
async def regenerate_article(article_id: str, request: Request, current_user = Depends(get_current_user)):
    """Re-run LLM synthesis on an existing wiki article's source links."""
    user = current_user
    tenant_id = str(user.tenant_id)

    # Fetch existing article
    try:
        obj = weaviate_client.client.data_object.get_by_id(
            uuid=article_id, class_name="WikiArticle"
        )
        props = obj.get("properties", {})
    except Exception:
        raise HTTPException(status_code=404, detail="Article not found")

    source_link_ids_str = props.get("source_link_ids", "")
    source_link_ids = [s.strip() for s in source_link_ids_str.split(",") if s.strip()]

    if not source_link_ids:
        return {"ok": False, "message": "No source links to regenerate from"}

    # Fetch source link content
    contents = []
    for lid in source_link_ids:
        try:
            lobj = weaviate_client.client.data_object.get_by_id(uuid=lid, class_name="Link")
            lp = lobj.get("properties", {})
            contents.append(f"## {lp.get('title', 'Link')}\n\n{lp.get('summary', '')}")
        except:
            pass

    if not contents:
        return {"ok": False, "message": "Source links not found"}

    title = props.get("title", "Regenerated Article")
    raw_content = "\n\n---\n\n".join(contents)

    # LLM synthesis
    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if api_key:
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "nvidia/llama-3.1-nemotron-70b-instruct:free",
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a knowledge synthesizer. Given multiple source materials, "
                                    "write a structured wiki article in markdown. Include:\n"
                                    "- A compelling title\n"
                                    "- A 2-3 sentence overview/summary\n"
                                    "- Key themes as ## headings with bullet points\n"
                                    "- Connections between sources\n"
                                    "- A 'Key Takeaways' section at the end\n"
                                    "Write in clear, concise prose. Use markdown formatting."
                                ),
                            },
                            {
                                "role": "user",
                                "content": f"Regenerate and improve this wiki article: {title}\n\nSources:\n{raw_content}",
                            },
                        ],
                        "max_tokens": 1000,
                        "temperature": 0.7,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    synthesized = data["choices"][0]["message"]["content"]
                    for line in synthesized.split("\n"):
                        if line.startswith("# "):
                            title = line[2:].strip()
                            break
                    content = synthesized
                    summary_lines = []
                    in_content = False
                    for line in synthesized.split("\n"):
                        if line.startswith("#"):
                            in_content = True
                            continue
                        if in_content and line.strip():
                            summary_lines.append(line.strip())
                            if len(summary_lines) >= 2:
                                break
                    summary = " ".join(summary_lines)[:300]
                else:
                    content = raw_content
                    summary = contents[0][:200]
        except Exception:
            content = raw_content
            summary = contents[0][:200]
    else:
        content = raw_content
        summary = contents[0][:200]

    # Update article in place
    from datetime import datetime
    weaviate_client.update_wiki_article(
        article_id,
        title=title,
        content=content,
        summary=summary,
        updated_at=datetime.utcnow().isoformat(),
        last_regenerated_at=datetime.utcnow().isoformat(),
        status="published",
    )

    return {"ok": True, "title": title}



@router.delete("/{article_id}")
async def delete_article(article_id: str, request: Request, current_user = Depends(get_current_user)):
    user = current_user
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



@router.get("/{article_id}/export")
async def export_article(article_id: str, request: Request, current_user = Depends(get_current_user)):
    """Export wiki article as clean markdown."""
    user = current_user

    try:
        obj = weaviate_client.client.data_object.get_by_id(
            uuid=article_id, class_name="WikiArticle"
        )
        props = obj.get("properties", {})
        title = props.get("title", "Untitled")
        content = props.get("content", "")
        category = props.get("category", "")
        summary = props.get("summary", "")

        slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')

        md = f"# {title}\n\n"
        if summary:
            md += f"> {summary}\n\n"
        if category:
            md += f"**Category:** {category}\n\n---\n\n"
        md += content
        md += f"\n\n---\n*Exported from GreenPlot Wiki*\n"

        from fastapi.responses import Response
        return Response(
            content=md,
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{slug}.md"'},
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Article not found")

