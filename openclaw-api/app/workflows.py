from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import LinkCache, ResearchRun, Seed, SeedLink, Thought, User, UserEvent
from app.weaviate_client import weaviate_client


router = APIRouter(prefix="/api/v1", tags=["workflows"])


STAGES = [
    {"key": "seed", "label": "Seed"},
    {"key": "research", "label": "Research Brief"},
    {"key": "spec", "label": "Spec/PRD"},
    {"key": "build", "label": "Build Task"},
    {"key": "shipped", "label": "Shipped"},
]

RELATIONSHIP_ACTIONS = ["merge", "link", "cite", "expand", "archive"]


class WikiDraftRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200)
    category: str = Field(default="Garden")
    source_seed_ids: list[str] = Field(default_factory=list)
    source_link_ids: list[str] = Field(default_factory=list)


class WikiApproveRequest(WikiDraftRequest):
    title: str | None = None
    summary: str | None = None
    content: str = Field(..., min_length=20)


def _iso(dt):
    return dt.isoformat() if dt else None


def _clean_words(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[a-z0-9]{3,}", (text or "").lower())
        if word not in {"the", "and", "for", "with", "from", "that", "this", "into", "your"}
    }


def _tag_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(tag).strip() for tag in value if str(tag).strip()]
    return [tag.strip() for tag in str(value or "").split(",") if tag.strip()]


def _domain_from_url(url: str) -> str:
    if not url:
        return ""
    cleaned = re.sub(r"^https?://", "", url).split("/", 1)[0]
    return cleaned.replace("www.", "")[:120]


def _valid_uuid_values(values: list[str]) -> list[uuid.UUID]:
    parsed = []
    for value in values:
        try:
            parsed.append(uuid.UUID(str(value)))
        except (TypeError, ValueError):
            continue
    return parsed


def _meta(seed: Seed) -> dict:
    return seed.seed_metadata or {}


def _seed_card(seed: Seed) -> dict:
    meta = _meta(seed)
    tags = _tag_list(meta.get("tags", []))
    return {
        "id": str(seed.id),
        "title": seed.title,
        "summary": meta.get("summary") or (seed.content or "")[:180],
        "seed_type": seed.seed_type or meta.get("seed_type") or "idea",
        "domain": meta.get("domain") or "",
        "tags": tags[:6],
        "created_at": _iso(seed.created_at),
        "metadata": meta,
    }


def _object_card(kind: str, item: dict) -> dict:
    title = item.get("title") or item.get("name") or item.get("url") or "Untitled"
    return {
        "id": str(item.get("id") or item.get("weaviate_id") or title),
        "kind": kind,
        "title": title,
        "summary": item.get("summary") or item.get("content", "")[:180] or item.get("snippet", ""),
        "domain": item.get("domain") or _domain_from_url(item.get("url", "")),
        "tags": _tag_list(item.get("tags", [])),
        "url": item.get("url", ""),
        "created_at": item.get("created_at") or item.get("addedAt") or item.get("createdAt") or "",
        "metadata": item.get("metadata") or {},
    }


def _seed_words(seed: Seed) -> set[str]:
    meta = _meta(seed)
    return _clean_words(f"{seed.title} {(seed.content or '')[:600]} {meta.get('domain', '')} {meta.get('tags', '')}")


def _wiki_words(article: dict) -> set[str]:
    return _clean_words(f"{article.get('title', '')} {article.get('summary', '')} {article.get('category', '')}")


def _link_words(link: dict) -> set[str]:
    return _clean_words(f"{link.get('title', '')} {link.get('summary', '')} {link.get('domain', '')} {link.get('tags', '')}")


def _safe_links(tenant_id: str, limit: int = 120) -> list[dict]:
    try:
        return weaviate_client.get_links(tenant_id=tenant_id, limit=limit)
    except Exception:
        return []


def _safe_wiki(tenant_id: str, limit: int = 120) -> list[dict]:
    try:
        return weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=limit)
    except Exception:
        return []


def _stage_for(seed: Seed) -> str:
    meta = _meta(seed)
    status = (meta.get("build_status") or "draft").lower()
    seed_type = (seed.seed_type or meta.get("seed_type") or "idea").lower()
    tags = ",".join(meta.get("tags") or []) if isinstance(meta.get("tags"), list) else str(meta.get("tags") or "")

    if status in {"shipped", "built", "merged"} or meta.get("build_pr_url"):
        return "shipped"
    if status in {"building", "in_progress"}:
        return "build"
    if seed_type == "spec" or seed_type == "prd" or "prd" in tags.lower() or "spec" in tags.lower():
        return "spec"
    if seed_type == "paper" or meta.get("research_run_id") or "deep-research" in tags.lower():
        return "research"
    return "seed"


def _next_action(stage: str, item: dict, related: dict[str, list[dict]]) -> dict:
    if stage == "seed":
        if related.get("research"):
            return {"label": "Turn research into a PRD", "href": f"/garden?seed={related['research'][0]['id']}", "kind": "draft_prd"}
        return {"label": "Run research", "href": "/garden", "kind": "research"}
    if stage == "research":
        return {"label": "Draft PRD", "href": f"/garden?seed={item['id']}", "kind": "draft_prd"}
    if stage == "spec":
        return {"label": "Mark ready or ship", "href": "/studio", "kind": "advance_build_status"}
    if stage == "build":
        return {"label": "Attach PR or mark shipped", "href": "/studio", "kind": "ship"}
    return {"label": "Extract learnings", "href": f"/garden?seed={item['id']}", "kind": "reflect"}


def _history_for(seed: Seed, related: dict[str, list[dict]]) -> list[dict]:
    meta = _meta(seed)
    history = [{
        "at": _iso(seed.created_at),
        "title": "Seed planted",
        "detail": seed.title,
    }]
    if meta.get("research_run_id") or related.get("research"):
        history.append({"at": meta.get("research_completed_at") or _iso(seed.created_at), "title": "Research brief connected", "detail": "Evidence gathered for this outcome"})
    if related.get("spec") or _stage_for(seed) in {"spec", "build", "shipped"}:
        history.append({"at": meta.get("prd_created_at") or _iso(seed.created_at), "title": "Spec drafted", "detail": "PRD/build brief exists"})
    if meta.get("build_status") in {"building", "in_progress"}:
        history.append({"at": meta.get("build_started_at") or _iso(seed.created_at), "title": "Build started", "detail": "Implementation is underway"})
    if meta.get("build_pr_url") or meta.get("build_status") in {"shipped", "built", "merged"}:
        history.append({"at": meta.get("shipped_at") or _iso(seed.created_at), "title": "Shipped", "detail": meta.get("build_pr_url") or "Marked shipped"})
    return history


def _seed_similarity(a: Seed, b: Seed) -> int:
    am = _meta(a)
    bm = _meta(b)
    words = _clean_words(f"{a.title} {(a.content or '')[:300]} {am.get('domain', '')} {am.get('tags', '')}")
    other = _clean_words(f"{b.title} {(b.content or '')[:300]} {bm.get('domain', '')} {bm.get('tags', '')}")
    return len(words & other)


@router.get("/outcomes")
def outcome_pipeline(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seeds = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None),
    ).order_by(Seed.created_at.desc()).limit(500).all()
    runs = db.query(ResearchRun).filter(
        ResearchRun.tenant_id == current_user.tenant_id,
    ).order_by(ResearchRun.created_at.desc()).limit(100).all()

    by_stage: dict[str, list[Seed]] = defaultdict(list)
    for seed in seeds:
        by_stage[_stage_for(seed)].append(seed)

    workflows = []
    for seed in seeds[:120]:
        stage = _stage_for(seed)
        related: dict[str, list[dict]] = {"seed": [], "research": [], "spec": [], "build": [], "shipped": []}

        meta = _meta(seed)
        source_ids = {
            str(meta.get("source_seed_id") or ""),
            str(meta.get("source_paper_id") or ""),
            str(meta.get("result_seed_id") or ""),
        }
        if meta.get("product_id"):
            source_ids.add(str(meta.get("product_id")))

        for candidate in seeds:
            if candidate.id == seed.id:
                continue
            cm = _meta(candidate)
            candidate_ids = {str(candidate.id), str(cm.get("source_seed_id") or ""), str(cm.get("source_paper_id") or "")}
            if source_ids & candidate_ids or _seed_similarity(seed, candidate) >= 4:
                related[_stage_for(candidate)].append(_seed_card(candidate))

        item = _seed_card(seed)
        workflows.append({
            "id": str(seed.id),
            "title": seed.title,
            "current_stage": stage,
            "stage_label": next(s["label"] for s in STAGES if s["key"] == stage),
            "item": item,
            "related": {k: v[:5] for k, v in related.items()},
            "next_action": _next_action(stage, item, related),
            "history": _history_for(seed, related),
            "suggestions": _outcome_suggestions(stage, seed, related),
        })

    active_runs = [{
        "id": str(run.id),
        "theme": run.theme,
        "status": run.status,
        "result_seed_id": str(run.result_seed_id) if run.result_seed_id else None,
        "created_at": _iso(run.created_at),
        "finding_count": run.finding_count,
    } for run in runs if run.status not in {"done", "error"}]

    return {
        "stages": [
            {**stage, "count": len(by_stage.get(stage["key"], []))}
            for stage in STAGES
        ],
        "workflows": workflows[:80],
        "active_research": active_runs,
        "summary": {
            "total": len(seeds),
            "seed": len(by_stage.get("seed", [])),
            "research": len(by_stage.get("research", [])),
            "spec": len(by_stage.get("spec", [])),
            "build": len(by_stage.get("build", [])),
            "shipped": len(by_stage.get("shipped", [])),
        },
    }


def _outcome_suggestions(stage: str, seed: Seed, related: dict[str, list[dict]]) -> list[dict]:
    suggestions = []
    if stage == "seed":
        suggestions.append({"kind": "research", "label": "Research the strongest unknown before drafting"})
        if related.get("spec"):
            suggestions.append({"kind": "merge", "label": "A related spec already exists; extend it instead of creating another"})
    if stage == "research":
        suggestions.append({"kind": "prd", "label": "Convert the gap into a PRD while evidence is fresh"})
    if stage == "spec":
        suggestions.append({"kind": "ready", "label": "Decide whether the PRD is ready for an agent"})
    if stage == "build":
        suggestions.append({"kind": "ship", "label": "Attach the implementation PR and capture learning"})
    if stage == "shipped":
        suggestions.append({"kind": "wiki", "label": "Fold the shipped learning back into the wiki"})
    return suggestions[:3]


@router.get("/relationships/suggestions")
def relationship_suggestions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tenant_id = str(current_user.tenant_id)
    seeds = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None),
    ).order_by(Seed.created_at.desc()).limit(300).all()
    existing_links = db.query(SeedLink).join(
        Seed, Seed.id == SeedLink.source_seed_id
    ).filter(Seed.tenant_id == current_user.tenant_id).limit(1000).all()
    linked_pairs = {
        tuple(sorted([str(link.source_seed_id), str(link.target_seed_id)]))
        for link in existing_links
    }
    links = _safe_links(tenant_id, 120)
    articles = _safe_wiki(tenant_id, 120)

    suggestions: list[dict] = []

    for index, seed in enumerate(seeds[:140]):
        seed_words = _seed_words(seed)
        seed_meta = _meta(seed)

        for other in seeds[index + 1:index + 60]:
            pair = tuple(sorted([str(seed.id), str(other.id)]))
            if pair in linked_pairs:
                continue
            overlap = seed_words & _seed_words(other)
            same_domain = seed_meta.get("domain") and seed_meta.get("domain") == _meta(other).get("domain")
            if len(overlap) < 5 and not same_domain:
                continue
            action = "merge" if len(overlap) >= 9 else "link"
            suggestions.append({
                "id": f"{action}-{seed.id}-{other.id}",
                "action": action,
                "confidence": min(96, 58 + len(overlap) * 4 + (10 if same_domain else 0)),
                "reason": "Strong shared language" if action == "merge" else "Related themes are not connected yet",
                "source": {**_seed_card(seed), "kind": "seed"},
                "target": {**_seed_card(other), "kind": "seed"},
                "evidence": sorted(list(overlap))[:8],
                "next_actions": ["Review side by side", "Create seed link"],
            })

        for link in links[:80]:
            overlap = seed_words & _link_words(link)
            if len(overlap) >= 4:
                suggestions.append({
                    "id": f"cite-{seed.id}-{link.get('id')}",
                    "action": "cite",
                    "confidence": min(92, 55 + len(overlap) * 5),
                    "reason": "External source can support this seed",
                    "source": {**_seed_card(seed), "kind": "seed"},
                    "target": _object_card("link", link),
                    "evidence": sorted(list(overlap))[:8],
                    "next_actions": ["Cite in wiki draft", "Attach to seed"],
                })

        for article in articles[:60]:
            overlap = seed_words & _wiki_words(article)
            if len(overlap) >= 4:
                suggestions.append({
                    "id": f"expand-{seed.id}-{article.get('id')}",
                    "action": "expand",
                    "confidence": min(90, 52 + len(overlap) * 5),
                    "reason": "Seed looks like new material for an existing wiki article",
                    "source": {**_seed_card(seed), "kind": "seed"},
                    "target": _object_card("wiki", article),
                    "evidence": sorted(list(overlap))[:8],
                    "next_actions": ["Add as source", "Regenerate article"],
                })

        age = datetime.utcnow() - (seed.created_at or datetime.utcnow())
        if age.days > 120 and not seed.last_visited and not seed_meta.get("summary") and len(seed.content or "") < 120:
            suggestions.append({
                "id": f"archive-{seed.id}",
                "action": "archive",
                "confidence": 62,
                "reason": "Old, thin, and not revisited",
                "source": {**_seed_card(seed), "kind": "seed"},
                "target": None,
                "evidence": ["low context", f"{age.days} days old"],
                "next_actions": ["Archive", "Rewrite before keeping"],
            })

    suggestions.sort(key=lambda item: item["confidence"], reverse=True)
    buckets = {action: 0 for action in RELATIONSHIP_ACTIONS}
    for suggestion in suggestions:
        buckets[suggestion["action"]] = buckets.get(suggestion["action"], 0) + 1

    return {
        "suggestions": suggestions[:80],
        "summary": {
            "total": len(suggestions),
            "actions": buckets,
            "sources": {"seeds": len(seeds), "links": len(links), "wiki": len(articles)},
        },
    }


@router.get("/research/inbox")
def research_inbox(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tenant_id = str(current_user.tenant_id)
    thoughts = db.query(Thought).filter(
        Thought.tenant_id == current_user.tenant_id,
        Thought.status.in_(["pending", "processing", "error"]),
    ).order_by(Thought.created_at.desc()).limit(80).all()
    seeds = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None),
    ).order_by(Seed.created_at.desc()).limit(250).all()
    links = _safe_links(tenant_id, 120)
    cached_links = db.query(LinkCache).filter(
        LinkCache.tenant_id == current_user.tenant_id,
    ).order_by(LinkCache.created_at.desc()).limit(120).all()

    items: list[dict] = []
    known_titles = Counter(re.sub(r"\W+", " ", seed.title.lower()).strip() for seed in seeds)
    known_domains = Counter(_meta(seed).get("domain") for seed in seeds if _meta(seed).get("domain"))

    for thought in thoughts:
        words = _clean_words(thought.content)
        tags = sorted(list(words))[:5]
        classification = "voice note" if thought.source == "voice" else "raw note"
        duplicate_count = sum(1 for seed in seeds if len(words & _seed_words(seed)) >= 5)
        items.append({
            "id": str(thought.id),
            "kind": "thought",
            "title": (thought.content or "Untitled note")[:90],
            "summary": (thought.content or "")[:220],
            "status": thought.status,
            "classification": classification,
            "suggested_tags": tags,
            "duplicate_count": duplicate_count,
            "created_at": _iso(thought.created_at),
            "actions": ["keep", "connect", "turn into seed", "discard"],
        })

    for link in links:
        status = link.get("status", "")
        if status not in {"pending", "queued", "error", "unread", ""}:
            continue
        domain = link.get("domain") or _domain_from_url(link.get("url", ""))
        duplicate_count = int(bool(link.get("garden_seed_id"))) + known_domains.get(domain, 0)
        items.append({
            "id": link.get("id"),
            "kind": "link",
            "title": link.get("title") or link.get("url") or "Untitled link",
            "summary": link.get("summary") or "",
            "status": status or "pending",
            "classification": "research link",
            "suggested_tags": _tag_list(link.get("tags"))[:5] or ([domain] if domain else []),
            "duplicate_count": duplicate_count,
            "created_at": link.get("addedAt") or link.get("created_at"),
            "actions": ["keep", "connect", "turn into seed", "discard"],
            "url": link.get("url", ""),
        })

    for cached in cached_links:
        title_key = re.sub(r"\W+", " ", (cached.title or cached.url or "").lower()).strip()
        if cached.summary and cached.starred:
            continue
        items.append({
            "id": str(cached.id),
            "kind": "link-cache",
            "title": cached.title or cached.url or "Saved source",
            "summary": (cached.summary or "")[:220],
            "status": "needs review",
            "classification": cached.domain or "saved source",
            "suggested_tags": _tag_list(cached.tags)[:5] or ([cached.domain] if cached.domain else []),
            "duplicate_count": known_titles.get(title_key, 0),
            "created_at": _iso(cached.created_at),
            "actions": ["keep", "connect", "turn into seed", "discard"],
            "url": cached.url,
        })

    paper_seeds = [
        seed for seed in seeds
        if (seed.seed_type == "paper" or _meta(seed).get("paper_url") or _meta(seed).get("parse_status") in {"queued", "parsing", "failed"})
    ]
    for paper in paper_seeds[:40]:
        meta = _meta(paper)
        if meta.get("parse_status") in {"parsed", "complete"} and meta.get("summary"):
            continue
        items.append({
            "id": str(paper.id),
            "kind": "paper",
            "title": paper.title,
            "summary": (meta.get("abstract") or paper.content or "")[:220],
            "status": meta.get("parse_status") or "needs parse",
            "classification": "paper",
            "suggested_tags": _tag_list(meta.get("tags"))[:5] or ["paper"],
            "duplicate_count": sum(1 for seed in seeds if seed.id != paper.id and len(_seed_words(seed) & _seed_words(paper)) >= 6),
            "created_at": _iso(paper.created_at),
            "actions": ["keep", "connect", "turn into seed", "discard"],
        })

    items.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return {
        "items": items[:120],
        "summary": {
            "total": len(items),
            "thoughts": sum(1 for item in items if item["kind"] == "thought"),
            "links": sum(1 for item in items if item["kind"] in {"link", "link-cache"}),
            "papers": sum(1 for item in items if item["kind"] == "paper"),
            "duplicates": sum(1 for item in items if item.get("duplicate_count", 0) > 0),
        },
    }


def _topic_candidates(seeds: list[Seed], links: list[dict], articles: list[dict]) -> list[dict]:
    existing_titles = {article.get("title", "").lower() for article in articles}
    domain_counts = Counter()
    seed_sources: dict[str, list[Seed]] = defaultdict(list)
    link_sources: dict[str, list[dict]] = defaultdict(list)

    for seed in seeds:
        meta = _meta(seed)
        domain = meta.get("domain") or (seed.seed_type or "garden")
        tags = _tag_list(meta.get("tags"))
        topic = tags[0] if tags else domain
        if topic:
            key = str(topic).strip().title()
            domain_counts[key] += 1
            seed_sources[key].append(seed)

    for link in links:
        tags = _tag_list(link.get("tags"))
        topic = tags[0] if tags else link.get("domain")
        if topic:
            key = str(topic).strip().title()
            domain_counts[key] += 1
            link_sources[key].append(link)

    candidates = []
    for topic, count in domain_counts.most_common(40):
        if topic.lower() in existing_titles:
            continue
        seed_cards = [{**_seed_card(seed), "kind": "seed"} for seed in seed_sources.get(topic, [])[:6]]
        link_cards = [_object_card("link", link) for link in link_sources.get(topic, [])[:6]]
        if len(seed_cards) + len(link_cards) < 2:
            continue
        candidates.append({
            "topic": topic,
            "category": "Garden",
            "source_count": len(seed_cards) + len(link_cards),
            "seed_count": len(seed_cards),
            "link_count": len(link_cards),
            "reason": "Enough connected garden material to draft intentionally",
            "sources": seed_cards + link_cards,
        })
    return candidates


def _draft_wiki(topic: str, category: str, seed_sources: list[Seed], link_sources: list[dict]) -> dict:
    seed_lines = [f"- {seed.title}: {(seed.content or '')[:220]}" for seed in seed_sources[:8]]
    link_lines = [f"- {link.get('title') or link.get('url')}: {link.get('summary', '')[:220]}" for link in link_sources[:8]]
    summary_bits = []
    if seed_sources:
        summary_bits.append(f"{len(seed_sources)} garden seed(s)")
    if link_sources:
        summary_bits.append(f"{len(link_sources)} source link(s)")
    summary = f"{topic} is an emerging garden topic supported by {', '.join(summary_bits) or 'selected sources'}."
    content = f"""# {topic}

{summary}

## Overview
This draft pulls together the strongest available garden evidence for **{topic}**. It is meant as an approval-ready starting point, not a final encyclopedia article.

## Supporting Seeds
{chr(10).join(seed_lines) if seed_lines else "- No seed sources selected yet."}

## Supporting Sources
{chr(10).join(link_lines) if link_lines else "- No external sources selected yet."}

## Connections
Related topics should be linked here using wiki links like [[related-topic]] after review.

## Open Questions
- What claim is strongest enough to preserve?
- Which source should be cited first?
- What should be turned into a build task or product decision?
"""
    return {
        "title": topic,
        "category": category or "Garden",
        "summary": summary,
        "content": content,
        "source_seed_ids": [str(seed.id) for seed in seed_sources],
        "source_link_ids": [str(link.get("id")) for link in link_sources if link.get("id")],
    }


@router.get("/wiki/from-garden")
def wiki_from_garden(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tenant_id = str(current_user.tenant_id)
    seeds = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None),
    ).order_by(Seed.created_at.desc()).limit(300).all()
    links = _safe_links(tenant_id, 160)
    articles = _safe_wiki(tenant_id, 120)
    candidates = _topic_candidates(seeds, links, articles)
    return {
        "topics": candidates[:30],
        "summary": {
            "topic_count": len(candidates),
            "existing_wiki": len(articles),
            "source_pool": len(seeds) + len(links),
        },
    }


@router.post("/wiki/from-garden/preview")
def wiki_from_garden_preview(payload: WikiDraftRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seed_sources = []
    source_seed_ids = _valid_uuid_values(payload.source_seed_ids)
    if source_seed_ids:
        seed_sources = db.query(Seed).filter(
            Seed.tenant_id == current_user.tenant_id,
            Seed.id.in_(source_seed_ids),
        ).limit(12).all()
    links = _safe_links(str(current_user.tenant_id), 200)
    link_sources = [link for link in links if str(link.get("id")) in set(payload.source_link_ids)]
    return {"draft": _draft_wiki(payload.topic, payload.category, seed_sources, link_sources)}


@router.post("/wiki/from-garden/approve")
def wiki_from_garden_approve(payload: WikiApproveRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    title = payload.title or payload.topic
    summary = payload.summary or payload.content.split("\n\n", 1)[0].replace("#", "").strip()[:500]
    try:
        article_id = weaviate_client.add_wiki_article(
            tenant_id=str(current_user.tenant_id),
            user_id=str(current_user.id),
            title=title,
            category=payload.category or "Garden",
            summary=summary,
            content=payload.content,
            source_seed_ids=",".join(payload.source_seed_ids),
            source_link_ids=",".join(payload.source_link_ids),
            backlinks="",
            status="published",
            health_score=72,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Could not publish wiki draft: {exc}") from exc
    return {"ok": True, "article_id": article_id, "title": title}


@router.get("/spaces")
def product_project_spaces(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seeds = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None),
    ).order_by(Seed.created_at.desc()).limit(400).all()

    products = [seed for seed in seeds if (seed.seed_type or "").lower() == "product" or _meta(seed).get("kind") == "product"]
    specs = [seed for seed in seeds if _stage_for(seed) in {"spec", "build", "shipped"}]
    spaces = []

    for product in products[:40]:
        product_meta = _meta(product)
        members = []
        for seed in seeds:
            if seed.id == product.id:
                continue
            meta = _meta(seed)
            same_product = str(meta.get("product_id") or "") == str(product.id)
            same_words = len(_seed_words(product) & _seed_words(seed)) >= 4
            if same_product or same_words:
                members.append({**_seed_card(seed), "stage": _stage_for(seed), "kind": "seed"})
        spaces.append({
            "id": str(product.id),
            "name": product.title,
            "summary": product_meta.get("summary") or product.content[:220],
            "product": {**_seed_card(product), "kind": "product"},
            "members": members[:16],
            "counts": Counter(member["stage"] for member in members),
            "next_action": "Clarify the next build task" if any(member["stage"] == "spec" for member in members) else "Attach related seeds",
        })

    assigned_ids = {member["id"] for space in spaces for member in space["members"]}
    orphan_specs = [
        {**_seed_card(seed), "stage": _stage_for(seed), "kind": "seed"}
        for seed in specs
        if str(seed.id) not in assigned_ids and not _meta(seed).get("product_id")
    ][:30]

    suggestions = []
    for spec in orphan_specs:
        spec_words = _clean_words(f"{spec['title']} {spec.get('summary', '')}")
        best_space = None
        best_overlap = 0
        for space in spaces:
            overlap = len(spec_words & _clean_words(f"{space['name']} {space['summary']}"))
            if overlap > best_overlap:
                best_overlap = overlap
                best_space = space
        if best_space and best_overlap >= 2:
            suggestions.append({
                "seed": spec,
                "space": {"id": best_space["id"], "name": best_space["name"]},
                "reason": "Spec language matches the project space",
                "confidence": min(90, 55 + best_overlap * 8),
            })

    return {
        "spaces": spaces,
        "orphan_specs": orphan_specs,
        "suggestions": suggestions[:30],
        "summary": {
            "spaces": len(spaces),
            "orphan_specs": len(orphan_specs),
            "suggestions": len(suggestions),
        },
    }


@router.get("/insights/timeline")
def insight_timeline(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    since = datetime.utcnow() - timedelta(days=120)
    seeds = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        Seed.created_at >= since,
    ).order_by(Seed.created_at.desc()).limit(300).all()
    events = db.query(UserEvent).filter(
        UserEvent.user_id == current_user.id,
        UserEvent.created_at >= since,
    ).order_by(UserEvent.created_at.desc()).limit(200).all()
    runs = db.query(ResearchRun).filter(
        ResearchRun.tenant_id == current_user.tenant_id,
        ResearchRun.created_at >= since,
    ).order_by(ResearchRun.created_at.desc()).limit(80).all()
    links = db.query(SeedLink).join(
        Seed, Seed.id == SeedLink.source_seed_id
    ).filter(
        Seed.tenant_id == current_user.tenant_id,
        SeedLink.created_at >= since,
    ).order_by(SeedLink.created_at.desc()).limit(120).all()

    timeline: list[dict] = []
    for seed in seeds:
        stage = _stage_for(seed)
        if stage in {"research", "spec", "build", "shipped"} or seed.quality_score or seed.seed_type in {"learning", "paper"}:
            timeline.append({
                "id": f"seed-{seed.id}",
                "at": _iso(seed.created_at),
                "kind": "seed",
                "title": seed.title,
                "detail": f"{stage.title()} item added",
                "importance": 3 if stage in {"build", "shipped"} else 2,
                "tags": _tag_list(_meta(seed).get("tags"))[:5],
            })

    for event in events:
        meta = event.meta or {}
        if event.event in {"seed_created", "paper_added", "prd_created", "wiki_compiled", "chat", "digest_sent"}:
            timeline.append({
                "id": f"event-{event.id}",
                "at": _iso(event.created_at),
                "kind": event.event,
                "title": meta.get("title") or event.event.replace("_", " ").title(),
                "detail": meta.get("summary") or meta.get("source") or "Product activity",
                "importance": 2 if event.event != "chat" else 1,
                "tags": _tag_list(meta.get("tags"))[:5],
            })

    for run in runs:
        timeline.append({
            "id": f"run-{run.id}",
            "at": _iso(run.created_at),
            "kind": "research",
            "title": run.theme or "Research run",
            "detail": f"{run.status}; {run.finding_count or 0} findings",
            "importance": 3 if run.status == "done" else 2,
            "tags": ["research"],
        })

    for link in links:
        timeline.append({
            "id": f"link-{link.id}",
            "at": _iso(link.created_at),
            "kind": "relationship",
            "title": f"{link.link_type.replace('_', ' ').title()} connection",
            "detail": "Two seeds became meaningfully connected",
            "importance": 2,
            "tags": [link.link_type],
        })

    topic_counts = Counter()
    week_counts = Counter()
    for seed in seeds:
        for tag in _tag_list(_meta(seed).get("tags"))[:4]:
            topic_counts[tag] += 1
        domain = _meta(seed).get("domain")
        if domain:
            topic_counts[domain] += 1
        if seed.created_at:
            week_counts[seed.created_at.strftime("%Y-W%U")] += 1

    timeline.sort(key=lambda item: item.get("at") or "", reverse=True)
    return {
        "events": timeline[:120],
        "rising_topics": [{"label": key, "count": value} for key, value in topic_counts.most_common(12)],
        "activity": [{"week": key, "count": value} for key, value in sorted(week_counts.items())[-12:]],
        "summary": {
            "events": len(timeline),
            "rising_topics": len(topic_counts),
            "research_runs": len(runs),
            "connections": len(links),
        },
    }
