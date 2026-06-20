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


def _iso(dt):
    return dt.isoformat() if dt else None


def _seed_summary(seed) -> dict:
    metadata = seed.seed_metadata or {}
    content = seed.content or ""
    raw_tags = metadata.get("tags", "")
    tags = raw_tags if isinstance(raw_tags, list) else [t.strip() for t in str(raw_tags or "").split(",") if t.strip()]
    return {
        "id": str(seed.id),
        "title": seed.title,
        "summary": metadata.get("summary") or content[:180],
        "domain": metadata.get("domain") or "",
        "tags": tags[:6],
        "seed_type": seed.seed_type or metadata.get("seed_type") or "idea",
        "created_at": _iso(seed.created_at),
        "last_interacted_at": _iso(seed.last_interacted_at),
        "quality_score": seed.quality_score,
        "metadata": metadata,
    }


def _link_summary(link: dict) -> dict:
    return {
        "id": link.get("id") or link.get("uuid") or "",
        "title": link.get("title") or link.get("url") or "Untitled link",
        "summary": link.get("summary") or "",
        "domain": link.get("domain") or "",
        "status": link.get("status") or "",
        "url": link.get("url") or "",
        "created_at": link.get("addedAt") or link.get("created_at") or link.get("createdAt") or "",
    }


def _days_since(value) -> int:
    if not value:
        return 999
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            return 999
    return max(0, (datetime.utcnow() - dt).days)


def _admin_email_set() -> set[str]:
    return {e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()}


# ── P1.2: Garden Health Dashboard ─────────────────────

@router.get("/health")
def garden_health(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
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


@router.get("/review")
def garden_review(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Daily operating surface for the garden.

    This intentionally assembles existing Greenplot systems instead of creating
    new storage: seeds/thoughts/products/events from Postgres, source/wiki
    coverage from Weaviate, and relationship hints from SeedLink metadata.
    """
    user = get_current_user(token=token, db=db)
    tenant_id = str(user.tenant_id)

    from app.models import Seed, Thought, SeedLink, UserEvent, WaitlistEntry

    seeds = db.query(Seed).filter(
        Seed.tenant_id == user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None),
    ).order_by(Seed.created_at.desc()).limit(500).all()
    thoughts = db.query(Thought).filter(
        Thought.tenant_id == user.tenant_id,
    ).order_by(Thought.created_at.desc()).limit(50).all()
    seed_ids = [s.id for s in seeds]

    links = weaviate_client.get_links(tenant_id=tenant_id, limit=500)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)

    seed_by_id = {str(seed.id): seed for seed in seeds}
    products = [s for s in seeds if (s.seed_type == "product" or (s.seed_metadata or {}).get("seed_type") == "product")]
    specs = [s for s in seeds if (s.seed_type == "spec" or (s.seed_metadata or {}).get("seed_type") in {"spec", "prd"})]
    papers = [s for s in seeds if ((s.seed_metadata or {}).get("seed_type") == "paper" or s.seed_type == "paper")]

    now = datetime.utcnow()
    raw_seeds = [
        s for s in seeds
        if not (s.seed_metadata or {}).get("summary")
        and (s.seed_type or "idea") not in {"product", "spec"}
    ]
    stale_seeds = sorted(
        [
            s for s in seeds
            if _days_since(s.last_interacted_at or s.created_at) >= 7
            and (s.seed_type or "idea") not in {"product"}
        ],
        key=lambda s: (_days_since(s.last_interacted_at or s.created_at), s.created_at or now),
        reverse=True,
    )
    pending_thoughts = [t for t in thoughts if t.status in {"pending", "processing", "error"}]
    pending_links = [l for l in links if l.get("status") in {"pending", "processing", "error"}]
    enriched_links = [l for l in links if l.get("status") == "enriched"]

    tending = []
    for seed in stale_seeds[:3]:
        age_days = _days_since(seed.last_interacted_at or seed.created_at)
        tending.append({
            "kind": "review_seed",
            "priority": "high" if age_days >= 21 else "medium",
            "title": seed.title,
            "body": f"Untouched for {age_days} days",
            "seed_id": str(seed.id),
            "action_label": "Review",
        })
    for seed in raw_seeds[:2]:
        tending.append({
            "kind": "enrich_seed",
            "priority": "medium",
            "title": seed.title,
            "body": "No summary or domain yet",
            "seed_id": str(seed.id),
            "action_label": "Open",
        })
    for thought in pending_thoughts[:2]:
        tending.append({
            "kind": "triage_thought",
            "priority": "high" if thought.status == "error" else "medium",
            "title": thought.content[:80] or "Pending thought",
            "body": f"Thought is {thought.status}",
            "thought_id": str(thought.id),
            "action_label": "Check",
        })

    inbox = {
        "pending_links": [_link_summary(l) for l in pending_links[:8]],
        "raw_seeds": [_seed_summary(s) for s in raw_seeds[:8]],
        "pending_thoughts": [{
            "id": str(t.id),
            "title": t.content[:90] or "Untitled thought",
            "status": t.status,
            "created_at": _iso(t.created_at),
            "error": t.error_message,
        } for t in pending_thoughts[:8]],
    }

    relationships = []
    if seed_ids:
        rows = db.query(SeedLink).filter(
            SeedLink.source_seed_id.in_(seed_ids),
            SeedLink.target_seed_id.in_(seed_ids),
        ).order_by(SeedLink.created_at.desc()).limit(50).all()
        seen_pairs = set()
        for row in rows:
            source = seed_by_id.get(str(row.source_seed_id))
            target = seed_by_id.get(str(row.target_seed_id))
            if not source or not target:
                continue
            pair_key = tuple(sorted([str(source.id), str(target.id)]))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            relationships.append({
                "source": _seed_summary(source),
                "target": _seed_summary(target),
                "relationship": row.link_type,
                "confidence": round((row.confidence or 0) / 1000, 2) if row.confidence else None,
                "created_at": _iso(row.created_at),
                "suggestion": "Open both and decide whether this should become a stronger link, a merged idea, or a PRD input.",
            })
            if len(relationships) >= 6:
                break

    if len(relationships) < 6:
        domain_buckets: dict[str, list] = {}
        for seed in seeds:
            domain = ((seed.seed_metadata or {}).get("domain") or "").split(",")[0].strip().lower()
            if domain and domain not in {"general", "none", "untagged"}:
                domain_buckets.setdefault(domain, []).append(seed)
        for domain, grouped in sorted(domain_buckets.items(), key=lambda kv: len(kv[1]), reverse=True):
            if len(grouped) < 2:
                continue
            source, target = grouped[0], grouped[1]
            if str(source.id) == str(target.id):
                continue
            relationships.append({
                "source": _seed_summary(source),
                "target": _seed_summary(target),
                "relationship": "shared_domain",
                "confidence": None,
                "created_at": None,
                "suggestion": f"Both sit in {domain}; consider linking, merging, or using them as evidence for the same outcome.",
            })
            if len(relationships) >= 6:
                break

    def _stage_for(seed) -> str:
        metadata = seed.seed_metadata or {}
        if metadata.get("build_status") in {"built", "shipped", "merged"}:
            return "shipped"
        if metadata.get("build_status") in {"building", "in_progress"}:
            return "building"
        if seed.seed_type == "spec" or metadata.get("seed_type") in {"spec", "prd"}:
            return "spec"
        if metadata.get("seed_type") == "paper" or seed.seed_type == "paper" or metadata.get("research_run_id"):
            return "research"
        return "seed"

    stage_labels = {
        "seed": "Seed",
        "research": "Research",
        "spec": "Spec",
        "building": "Build",
        "shipped": "Shipped",
    }
    pipeline = []
    for stage in ["seed", "research", "spec", "building", "shipped"]:
        items = [_seed_summary(s) for s in seeds if _stage_for(s) == stage][:6]
        pipeline.append({"stage": stage, "label": stage_labels[stage], "count": len([s for s in seeds if _stage_for(s) == stage]), "items": items})

    wiki_source_ids = set()
    for article in articles:
        for link_id in article.get("sourceLinkIds", []):
            wiki_source_ids.add(link_id)

    domain_counts: dict[str, int] = {}
    for seed in seeds:
        domain = ((seed.seed_metadata or {}).get("domain") or "").split(",")[0].strip()
        if domain and domain.lower() not in {"general", "none", "untagged"}:
            domain_counts[domain] = domain_counts.get(domain, 0) + 1

    wiki_categories = {(a.get("category") or a.get("title") or "").lower() for a in articles}
    wiki_candidates = []
    for domain, count in sorted(domain_counts.items(), key=lambda kv: kv[1], reverse=True):
        if count >= 3 and domain.lower() not in wiki_categories:
            wiki_candidates.append({
                "kind": "domain_gap",
                "title": domain,
                "body": f"{count} seeds, no obvious wiki article",
                "count": count,
                "action_label": "Draft wiki",
            })
        if len(wiki_candidates) >= 4:
            break
    for link in enriched_links:
        link_id = link.get("id")
        if link_id and link_id not in wiki_source_ids and _days_since(link.get("addedAt")) >= 7:
            wiki_candidates.append({
                "kind": "source_ready",
                "title": link.get("title") or link.get("url") or "Enriched source",
                "body": "Enriched source has not been folded into the wiki",
                "link": _link_summary(link),
                "action_label": "Use as source",
            })
        if len(wiki_candidates) >= 6:
            break

    spaces = []
    for product in products:
        meta = product.seed_metadata or {}
        attached = [
            spec for spec in specs
            if (spec.seed_metadata or {}).get("product_id") == str(product.id)
        ]
        activity_dates = [dt for dt in [product.created_at] + [s.created_at for s in attached] if dt]
        spaces.append({
            "id": str(product.id),
            "title": product.title,
            "rank": meta.get("rank") or "backlog",
            "summary": meta.get("problem") or product.content[:180],
            "prd_count": len(attached),
            "open_prds": len([s for s in attached if (s.seed_metadata or {}).get("build_status") not in {"built", "shipped", "merged"}]),
            "last_activity_at": max(activity_dates).isoformat() if activity_dates else None,
        })
    orphan_specs = [spec for spec in specs if not (spec.seed_metadata or {}).get("product_id")]

    timeline_rows = []
    for seed in seeds[:20]:
        timeline_rows.append({
            "type": "seed_created",
            "title": seed.title,
            "body": (seed.seed_metadata or {}).get("summary") or seed.content[:120],
            "created_at": _iso(seed.created_at),
            "seed_id": str(seed.id),
        })
    events = db.query(UserEvent).filter(UserEvent.user_id == user.id).order_by(UserEvent.created_at.desc()).limit(20).all()
    for event in events:
        timeline_rows.append({
            "type": event.event,
            "title": event.event.replace("_", " ").title(),
            "body": (event.meta or {}).get("title") or (event.meta or {}).get("source") or "",
            "created_at": _iso(event.created_at),
        })
    timeline_rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)

    admin_nudges = []
    if (user.email or "").lower() in _admin_email_set():
        waiting_count = db.query(WaitlistEntry).filter(WaitlistEntry.invited_at.is_(None)).count()
        error_thoughts = len([t for t in pending_thoughts if t.status == "error"])
        admin_nudges = [
            {
                "kind": "waitlist",
                "title": "Waitlist",
                "body": f"{waiting_count} people waiting for an invite",
                "href": "/admin",
            },
            {
                "kind": "processing",
                "title": "Processing health",
                "body": f"{error_thoughts} thought processing errors in the recent queue",
                "href": "/admin",
            },
        ]

    next_actions = []
    if pending_links:
        next_actions.append({"label": "Clear research inbox", "href": "/links", "reason": f"{len(pending_links)} links need processing"})
    if orphan_specs:
        next_actions.append({"label": "Attach orphan specs", "href": "/studio", "reason": f"{len(orphan_specs)} specs serve no product"})
    if wiki_candidates:
        next_actions.append({"label": "Draft a wiki article", "href": "/wiki", "reason": wiki_candidates[0]["body"]})
    if relationships:
        next_actions.append({"label": "Review relationships", "href": "/garden", "reason": relationships[0]["suggestion"]})

    return {
        "generated_at": _iso(now),
        "summary": {
            "seeds": len(seeds),
            "links": len(links),
            "wiki_articles": len(articles),
            "products": len(products),
            "specs": len(specs),
            "papers": len(papers),
            "pending_items": len(pending_links) + len(raw_seeds) + len(pending_thoughts),
            "relationship_suggestions": len(relationships),
            "wiki_candidates": len(wiki_candidates),
        },
        "daily_tending": tending[:8],
        "inbox": inbox,
        "relationships": relationships,
        "pipeline": pipeline,
        "wiki_candidates": wiki_candidates[:6],
        "spaces": {
            "products": spaces,
            "orphan_specs": [_seed_summary(s) for s in orphan_specs[:8]],
        },
        "timeline": timeline_rows[:12],
        "admin_nudges": admin_nudges,
        "next_actions": next_actions[:4],
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
                        "model": settings.BRIEFING_MODEL,
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
def prompt_suggestions(body: PromptSuggestionRequest, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
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
def export_training(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
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
def lint_garden(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
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
