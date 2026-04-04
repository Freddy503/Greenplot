from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session
from app.auth import get_current_user, oauth2_scheme
from app.weaviate_client import weaviate_client
from app.database import get_db
from app.config import settings
import httpx
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/v1/garden", tags=["garden"])


class AskRequest(BaseModel):
    question: str
    limit: int = 8


# ── P1.2: Garden Health Dashboard ─────────────────────

@router.get("/health")
async def garden_health(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Combined health dashboard for links + seeds + wiki."""
    user = get_current_user(token=token, db=db)
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
async def ask_garden(body: AskRequest, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Ask a question against the user's knowledge garden. Retrieves relevant items and generates a grounded answer."""
    user = get_current_user(token=token, db=db)
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
    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if not api_key:
        answer = f"Based on your garden, I found {len(top_sources)} relevant items:\n\n" + "\n".join(
            f"• {s['title']}: {s.get('summary', '')[:100]}" for s in top_sources[:5]
        )
    else:
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


# ── P0: Prompt Suggestions on Login ───────────────────

class PromptSuggestionRequest(BaseModel):
    count: int = 4


@router.post("/prompt-suggestions")
async def prompt_suggestions(body: PromptSuggestionRequest, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Generate 3-4 contextual prompt suggestions based on the user's garden content."""
    user = get_current_user(token=token, db=db)
    tenant_id = str(user.tenant_id)

    # Gather data from all sources
    links = weaviate_client.get_links(tenant_id=tenant_id, limit=100)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=50)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=100)

    suggestions = []
    used_titles = set()

    # ── Strategy 1: High-energy seeds → creative prompts ──
    energy_seeds = [s for s in seeds if s.get("energy") and "hot" in s.get("energy", "").lower() or "fire" in s.get("energy", "").lower()]
    if not energy_seeds:
        # Fallback: enriched seeds with content
        energy_seeds = [s for s in seeds if s.get("summary") and len(s.get("summary", "")) > 50]

    for seed in energy_seeds[:2]:
        title = seed.get("title", "").strip()
        if title and title not in used_titles:
            used_titles.add(title)
            domain = seed.get("domain", "")
            if domain:
                suggestions.append(f"How does '{title}' connect to my {domain} research?")
            else:
                suggestions.append(f"Expand on this idea: {title}")

    # ── Strategy 2: Recently starred links → explore more ──
    starred = [l for l in links if l.get("starred")]
    for link in starred[:1]:
        title = link.get("title", "").strip()
        if title and title not in used_titles:
            used_titles.add(title)
            suggestions.append(f"Deep dive into: {title}")

    # ── Strategy 3: Enriched links with no wiki → synthesis opportunity ──
    wiki_source_ids = set()
    for a in articles:
        for lid in a.get("sourceLinkIds", []):
            wiki_source_ids.add(lid)
    enriched_no_wiki = [
        l for l in links
        if l.get("status") == "enriched" and l.get("id") not in wiki_source_ids
    ]
    if enriched_no_wiki:
        domains = {}
        for l in enriched_no_wiki:
            d = l.get("domain", "")
            if d:
                domains[d] = domains.get(d, 0) + 1
        if domains:
            top_domain = max(domains, key=domains.get)
            count = domains[top_domain]
            if count >= 3:
                suggestions.append(f"I have {count} {top_domain} links — compile them into an article")
            else:
                suggestions.append(f"What patterns do you see in my {top_domain} links?")

    # ── Strategy 4: Cross-domain connections from seeds ──
    domain_seeds = {}
    for s in seeds:
        d = s.get("domain", "").strip()
        if d and "," in d:
            parts = [p.strip() for p in d.split(",") if p.strip()]
            if len(parts) >= 2:
                key = f"{parts[0]} + {parts[1]}"
                domain_seeds[key] = domain_seeds.get(key, 0) + 1

    if domain_seeds:
        top_combo = max(domain_seeds, key=domain_seeds.get)
        suggestions.append(f"Explore the connection between {top_combo}")

    # ── Strategy 5: Pending links → organization prompt ──
    pending = [l for l in links if l.get("status") == "pending"]
    if pending and len(pending) >= 3:
        suggestions.append(f"Help me organize {len(pending)} unprocessed links")

    # ── Strategy 6: Recent seeds without enrichment ──
    raw_seeds = [s for s in seeds if not s.get("summary") and not s.get("energy")]
    if raw_seeds:
        recent_raw = raw_seeds[0]
        title = recent_raw.get("title", "").strip()
        if title and title not in used_titles:
            used_titles.add(title)
            suggestions.append(f"Enrich and expand this seed: {title}")

    # ── Strategy 7: Domain-specific prompts from garden content ──
    all_domains = set()
    for s in seeds:
        d = s.get("domain", "").strip()
        if d:
            for part in d.split(","):
                p = part.strip()
                if p:
                    all_domains.add(p)
    for l in links:
        d = l.get("domain", "").strip()
        if d:
            all_domains.add(d)

    domain_prompts = {
        "ai": "What's the latest on agentic AI workflows?",
        "tech": "How would I architect a system that does X?",
        "design": "Sketch a user flow for my newest feature idea",
        "business": "What market gaps does my garden suggest?",
        "career": "How can I leverage my garden for professional growth?",
        "creative": "Turn one of my seeds into a story concept",
        "science": "What research questions emerge from my garden?",
    }
    for domain_key, prompt in domain_prompts.items():
        if any(domain_key in d.lower() for d in all_domains):
            if prompt not in suggestions:
                suggestions.append(prompt)
                break

    # ── Fill remaining slots with contextual general prompts ──
    seed_count = len(seeds)
    link_count = len(links)
    wiki_count = len(articles)

    general = []
    if seed_count > 50:
        general.append(f"My garden has {seed_count} seeds — what themes emerge?")
    if wiki_count > 0:
        general.append(f"Which wiki article should I update or expand?")
    if seed_count > 0 and link_count > 0:
        general.append("What's the most interesting connection between my seeds and links?")
    general.extend([
        "Plant a seed about today's biggest insight",
        "What gaps exist in my knowledge garden?",
        "What should I explore next based on my garden?",
        "Find related links I might have missed",
        "Create a concept map of my top 5 ideas",
    ])

    import random
    random.shuffle(general)
    for g in general:
        if len(suggestions) >= body.count:
            break
        if g not in suggestions:
            suggestions.append(g)

    return {"suggestions": suggestions[:body.count]}


# ── C2: Training Data Export ───────────────────────────

@router.get("/export-training")
async def export_training(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Export garden as structured Q&A pairs for fine-tuning (JSONL format)."""
    user = get_current_user(token=token, db=db)
    tenant_id = str(user.tenant_id)

    links = weaviate_client.get_links(tenant_id=tenant_id, limit=500)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=500)

    pairs = []

    # Generate Q&A from wiki articles
    for article in articles:
        title = article.get("title", "")
        summary = article.get("summary", "")
        content = article.get("content", "")
        category = article.get("category", "")

        if summary and len(content) > 100:
            pairs.append({
                "question": f"What is {title}?",
                "answer": summary,
                "sources": [f"wiki:{title}"],
                "category": category,
            })

        # Generate from content sections
        sections = content.split("## ")
        for section in sections[1:]:  # Skip first (before any ##)
            lines = section.strip().split("\n")
            section_title = lines[0].strip() if lines else ""
            section_content = "\n".join(lines[1:]).strip()
            if section_title and len(section_content) > 50:
                pairs.append({
                    "question": f"Explain the '{section_title}' aspect of {title}.",
                    "answer": section_content[:500],
                    "sources": [f"wiki:{title}"],
                    "category": category,
                })

    # Generate Q&A from enriched links
    for link in links:
        if link.get("status") == "enriched" and link.get("summary"):
            pairs.append({
                "question": f"What is {link.get('title', '')}?",
                "answer": link.get("summary", ""),
                "sources": [f"link:{link.get('url', '')}"],
                "category": link.get("domain", ""),
            })

    # Return as JSONL
    import json as _json
    jsonl = "\n".join(_json.dumps(p, ensure_ascii=False) for p in pairs)

    from fastapi.responses import Response
    return Response(
        content=jsonl,
        media_type="application/jsonl",
        headers={"Content-Disposition": 'attachment; filename="greenplot-training.jsonl"'},
    )


# ── C3: Linting Auto-Fix ──────────────────────────────

@router.post("/lint")
async def lint_garden(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Run health checks and auto-fix common issues."""
    user = get_current_user(token=token, db=db)
    tenant_id = str(user.tenant_id)

    links = weaviate_client.get_links(tenant_id=tenant_id, limit=500)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=500)

    issues_found = []
    issues_fixed = []

    # Check 1: Links with empty summaries
    empty_summaries = [l for l in links if l.get("status") == "enriched" and not l.get("summary")]
    for link in empty_summaries:
        issues_found.append(f"Link '{link.get('title', '')}' has no summary")
        # Mark for re-enrichment
        if link.get("id"):
            weaviate_client.update_link(link["id"], status="pending")
            issues_fixed.append(f"Marked '{link.get('title', '')}' for re-enrichment")

    # Check 2: Links with no tags
    no_tags = [l for l in links if l.get("status") == "enriched" and not l.get("tags")]
    for link in no_tags:
        issues_found.append(f"Link '{link.get('title', '')}' has no tags")
        # Auto-tag from domain
        domain = link.get("domain", "")
        if domain:
            tags = domain.split(".")[0]  # e.g., "github" from "github.com"
            weaviate_client.update_link(link["id"], tags=tags)
            issues_fixed.append(f"Auto-tagged '{link.get('title', '')}' with '{tags}'")

    # Check 3: Wiki articles with no source links
    no_sources = [a for a in articles if not a.get("sourceLinkIds")]
    for article in no_sources:
        issues_found.append(f"Wiki article '{article.get('title', '')}' has no source links")

    # Check 4: Duplicate links (same URL)
    seen_urls = {}
    for link in links:
        url = link.get("url", "").lower()
        if url in seen_urls:
            issues_found.append(f"Duplicate link: {link.get('title', '')}")
            if link.get("id"):
                weaviate_client.delete_link(link["id"])
                issues_fixed.append(f"Removed duplicate: {link.get('title', '')}")
        else:
            seen_urls[url] = link.get("id", "")

    # Check 5: Orphan links (no connections, no wiki)
    wiki_source_ids = set()
    for a in articles:
        for lid in a.get("sourceLinkIds", []):
            wiki_source_ids.add(lid)

    orphans = [
        l for l in links
        if l.get("id") not in wiki_source_ids
        and l.get("connection_count", 0) == 0
        and not l.get("related_ids")
        and l.get("status") == "enriched"
    ]
    for link in orphans:
        issues_found.append(f"Orphan link: '{link.get('title', '')}' has no connections")

    return {
        "issues_found": len(issues_found),
        "issues_fixed": len(issues_fixed),
        "details": {
            "found": issues_found[:50],
            "fixed": issues_fixed[:50],
        },
    }
