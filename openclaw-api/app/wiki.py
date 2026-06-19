from fastapi import APIRouter, HTTPException, Request, Header, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.auth import get_current_user, get_optional_user
from app.weaviate_client import weaviate_client
from app.config import settings
import httpx
import asyncio
import json
import logging
import re

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/wiki", tags=["wiki"])

# ── High-Quality Wiki Synthesis Prompts ──────────────
# Prompts are loaded from app/prompts/wiki_synthesis.md at runtime.
# Edit that file and restart the container to iterate without redeploying.

def _load_wiki_system_prompt() -> str:
    try:
        from app.prompts import load_prompt
        p = load_prompt("wiki_synthesis")
        if p:
            return p
    except Exception:
        pass
    # Inline fallback in case the file is missing
    return """You are a senior encyclopedic writer creating personal knowledge base articles. Your writing quality must match GrokPedia/Wikipedia standards.

## ARTICLE STRUCTURE (follow strictly):

### 1. LEAD SECTION (most important)
- Start with a bold definition sentence: "**{Topic}** is/are/refers to..."
- 3-5 sentences that tell the complete story
- Include: WHAT it is, WHY it matters, HOW it connects to broader themes
- Write as if explaining to a smart friend who's never heard of it

### 2. TABLE OF CONTENTS
```
## Contents
- [Overview](#overview)
- [Background & Context](#background--context)
- [Key Insights](#key-insights)
- [Practical Applications](#practical-applications)
- [Connections & Patterns](#connections--patterns)
- [Critical Analysis](#critical-analysis)
- [See Also](#see-also)
- [Sources](#sources)
```

### 3. OVERVIEW (2-3 paragraphs)
- Expand on the lead with specific examples, data points, quotes from sources
- Make it scannable with clear topic sentences

### 4. BACKGROUND & CONTEXT
- Where did this come from? What problem does it solve?

### 5. KEY INSIGHTS (the meat — 3-5 subsections with ### headers)
- Each subsection: claim + evidence + analysis
- Reference specific sources: [1], [2], etc.
- Include your own thinking/observations marked as 💭

### 6. PRACTICAL APPLICATIONS
- Real-world uses, how to implement, case studies

### 7. CONNECTIONS & PATTERNS
- How this links to other topics, recurring themes

### 8. CRITICAL ANALYSIS
- Strengths, weaknesses, open questions, future directions

### 9. SEE ALSO with [[wikilinks]]

### 10. SOURCES (numbered with URLs)

## QUALITY RULES:
1. NEVER just concatenate source content — synthesize and add value
2. Every major claim needs a citation [1]
3. Use specific examples, not vague generalities
4. Write in third person encyclopedic tone
5. Bold key terms on first use
6. Include "💭 Analysis:" sections for your own insights
7. End with "What to explore next" suggestions
8. Minimum 800 words for substantial topics

IMPORTANT: Do NOT include a Timeline section — that will be appended automatically after synthesis."""

WIKI_SYSTEM_PROMPT = _load_wiki_system_prompt()
WIKI_MODEL = settings.WIKI_MODEL  # kept on Gemini by default; see config.py to migrate
WIKI_FALLBACK_MODEL = settings.WIKI_FALLBACK_MODEL
WIKI_MAX_TOKENS = 4000
WIKI_TEMPERATURE = 0.5
_TIMELINE_DIVIDER = "\n\n---\n\n## Timeline\n\n*Evidence trail — append only. Each entry records when new seeds or sources were incorporated into this article.*\n\n"

async def _auto_generate_image(article_id: str, title: str, category: str = "", domain: str = "", tenant_id: str = ""):
    """Image generation removed (BFL retired) — articles render without hero images."""
    return None
def _build_timeline_entry(seed_count: int, link_count: int, source_titles: list[str]) -> str:
    """Build a single dated timeline entry for a compile event."""
    from datetime import datetime, timezone
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sources_str = ""
    if source_titles:
        sources_str = "\n" + "\n".join(f"  - {t}" for t in source_titles[:5])
        if len(source_titles) > 5:
            sources_str += f"\n  - …and {len(source_titles) - 5} more"
    return (
        f"**{date_str}** — Compiled from {seed_count} seed(s) and {link_count} source(s).{sources_str}"
    )

def _append_timeline_entry(article_content: str, entry: str) -> str:
    """
    Append a timeline entry to article content.
    - If no Timeline section exists yet: add the divider + header + entry.
    - If Timeline section already exists: append the new entry below existing ones.
      The Compiled Truth section above the divider is never touched.
    """
    if _TIMELINE_DIVIDER.strip() in article_content:
        # Timeline already exists — append below the last entry
        return article_content.rstrip() + "\n\n" + entry + "\n"
    else:
        return article_content.rstrip() + _TIMELINE_DIVIDER + entry + "\n"


def build_wiki_user_prompt(title: str, category: str, links_content: str, seeds_content: str) -> str:
    """Build the user prompt for wiki synthesis."""
    return f"""Write a comprehensive wiki article about: {title}

Category: {category}
Personal context: This is for a knowledge management system used by a technical founder building AI products.

## Source Materials:

### Links (external references):
{links_content if links_content else "No external links provided."}

### Seeds (personal ideas and observations):
{seeds_content if seeds_content else "No personal notes provided."}

## Instructions:
1. Synthesize ALL sources into a coherent narrative
2. Add your own analysis and connections
3. Reference sources by number [1], [2], etc.
4. Mark personal insights with 💭
5. Make it actionable — what should the reader do with this knowledge?
6. Connect to broader themes in AI, product development, and knowledge management
7. Follow the article structure exactly as specified in the system prompt
8. Write at least 800 words of substantive content"""


def prepa<RESEND_API_KEY>(links: list, seeds: list) -> tuple[str, str]:
    """Prepare link and seed content for the LLM prompt."""
    links_parts = []
    for i, l in enumerate(links[:8], 1):
        title = l.get("title", "Untitled")
        url = l.get("url", "")
        summary = l.get("summary", "")[:400]
        domain = l.get("domain", "")
        tags = l.get("tags", "")
        if isinstance(tags, list):
            tags = ", ".join(tags)
        links_parts.append(f"[{i}] {title}\nURL: {url}\nDomain: {domain}\nTags: {tags}\nSummary: {summary}\n")
    
    seeds_parts = []
    for i, s in enumerate(seeds[:8], len(links_parts) + 1):
        title = s.get("title", "Untitled")
        content = (s.get("content", "") or "")[:400]
        tags = s.get("tags", "")
        seeds_parts.append(f"[{i}] 💡 {title}\nTags: {tags}\nContent: {content}\n")
    
    return "\n---\n".join(links_parts), "\n---\n".join(seeds_parts)


async def synthesize_with_llm(system_prompt: str, user_prompt: str) -> str | None:
    """Call the LLM for wiki synthesis. Tries primary model, falls back to secondary."""
    api_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if not api_key:
        logger.error("LLM synthesis: No OPENROUTER_API_KEY configured")
        return None
    
    models_to_try = [WIKI_MODEL, WIKI_FALLBACK_MODEL]
    
    for model in models_to_try:
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "max_tokens": WIKI_MAX_TOKENS,
                        "temperature": WIKI_TEMPERATURE,
                    },
                )
                if resp.status_code == 200:
                    result = resp.json()["choices"][0]["message"]["content"]
                    logger.info(f"LLM synthesis: got {len(result)} chars from {model}")
                    return result
                elif resp.status_code == 429:
                    logger.warning(f"LLM synthesis: {model} rate-limited, trying next...")
                    continue
                else:
                    logger.error(f"LLM synthesis: {model} HTTP {resp.status_code} — {resp.text[:200]}")
        except Exception as e:
            logger.error(f"LLM synthesis: {model} failed: {e}")
    
    return None


async def compile_single_spec(
    title: str,
    content: str,
    category: str,
    seed_id: str,
    user_id: str,
    tenant_id: str,
) -> Optional[str]:
    """
    Immediately compile a single spec seed into a Library wiki article.
    Returns article_id (str) or None on failure.
    """
    try:
        seeds_content = f"## {title}\nContent: {content}\n"
        user_prompt = build_wiki_user_prompt(title, category, "", seeds_content)
        article_content = await synthesize_with_llm(WIKI_SYSTEM_PROMPT, user_prompt)

        if not article_content:
            # Fallback: use spec content verbatim
            article_content = f"# {title}\n\n{content}"

        # Extract a summary from the first non-header paragraph
        summary = ""
        for line in article_content.split("\n"):
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                summary = stripped[:300]
                break

        article_id = weaviate_client.add_wiki_article(
            tenant_id=tenant_id,
            user_id=user_id,
            title=title,
            category=category,
            summary=summary or content[:300],
            content=article_content,
            source_seed_ids=seed_id,
            source_link_ids="",
            status="published",
        )
        logger.info(f"compile_single_spec: article '{title}' created as {article_id}")
        return article_id
    except Exception as e:
        logger.warning(f"compile_single_spec failed for '{title}': {e}")
        return None


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


@router.get("/debug")
async def wiki_debug(request: Request, current_user = Depends(get_current_user)):
    """Diagnostic: why is the Library empty? Runs the same counting logic as the
    wiki-compile cron (no LLM calls) so we can see seed counts, detected domains,
    gaps, and Weaviate health in a single request."""
    from collections import Counter
    from app.database import get_db
    from app.models import Seed as SeedModel

    user = current_user
    tenant_id = str(user.tenant_id)

    weaviate_ok = True
    existing_articles = []
    weaviate_seeds = 0
    try:
        existing_articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
        wv_seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
        weaviate_seeds = len(wv_seeds or [])
    except Exception as e:
        weaviate_ok = False
        logger.exception(f"wiki_debug: Weaviate error: {e}")
        wv_seeds = []

    # Build the same domain view as the cron, using Postgres as the source of truth
    _NOISE = {"none", "untagged", "agent-insight", "general", ""}
    db = next(get_db())
    try:
        pg_seeds = db.query(SeedModel).filter(
            SeedModel.tenant_id == user.tenant_id
        ).order_by(SeedModel.created_at.desc()).limit(500).all()
    finally:
        db.close()

    seeds = []
    for s in pg_seeds:
        meta = s.seed_metadata or {}
        tags_raw = meta.get("tags", "")
        tags = ", ".join(tags_raw) if isinstance(tags_raw, list) else (tags_raw or "")
        domain = (meta.get("domain", "") or "").strip().lower()
        if not domain or domain in _NOISE:
            tag_list = [t.strip().lower() for t in tags.split(",") if t.strip() and len(t.strip()) > 2]
            tag_list = [t for t in tag_list if t not in _NOISE]
            domain = tag_list[0] if tag_list else ""
        seeds.append({"id": str(s.id), "domain": domain, "tags": tags})

    _SKIP = {'', 'none', 'untagged', 'general', 'agent-insight'}
    domain_counts = Counter(
        (s.get('domain', '') or '').strip().lower() for s in seeds
        if (s.get('domain', '') or '').strip().lower() not in _SKIP
    )
    wiki_domains = set((a.get('category', '') or '').lower() for a in existing_articles)
    wiki_titles_lower = set((a.get('title', '') or '').lower() for a in existing_articles)
    gaps = []
    for d, c in domain_counts.most_common():
        if not d or d in _SKIP:
            continue
        already_covered = d in wiki_domains or any(d in wt for wt in wiki_titles_lower)
        if not already_covered and c >= 1:
            gaps.append({"domain": d, "count": c})

    return {
        "weaviate_ok": weaviate_ok,
        "seed_count_postgres": len(seeds),
        "seed_count_weaviate": weaviate_seeds,
        "domains_detected": dict(domain_counts),
        "gaps": gaps,
        "existing_articles": [{"title": a.get("title", ""), "category": a.get("category", "")} for a in existing_articles],
        "existing_article_count": len(existing_articles),
    }



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
            # Build source references for citation
            source_refs = []
            for i, c in enumerate(contents[:8], 1):
                source_refs.append(f"[{i}] {c[:100]}...")
            refs_text = "\n".join(source_refs)

            async with httpx.AsyncClient(timeout=45) as client:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": WIKI_MODEL,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a wiki article writer following Wikipedia/GrokPedia structure. "
                                    "Given source materials, write a comprehensive, well-structured article.\n\n"
                                    "REQUIRED STRUCTURE (follow exactly):\n\n"
                                    "1. **Title**: Clear, descriptive (# Title)\n\n"
                                    "2. **Lead Section**: Start with a bold definition sentence, then 2-4 sentences "
                                    "providing a complete overview. The lead should stand alone as a summary.\n\n"
                                    "3. **Table of Contents**: Use this format:\n"
                                    "```\n"
                                    "## Contents\n"
                                    "- [Background](#background)\n"
                                    "- [Key Concepts](#key-concepts)\n"
                                    "- [Applications](#applications)\n"
                                    "- [See Also](#see-also)\n"
                                    "- [References](#references)\n"
                                    "```\n\n"
                                    "4. **Background**: Context, motivation, history\n\n"
                                    "5. **Key Concepts**: 2-4 subsections (###) with clear explanations\n\n"
                                    "6. **Applications**: Real-world uses, examples, implementations\n\n"
                                    "7. **Connections**: How this relates to broader topics\n\n"
                                    "8. **See Also**: Related topics as wikilinks [[Topic]]\n\n"
                                    "9. **References**: Numbered list with source URLs\n\n"
                                    "10. **Footer**: *Last updated: {date} • Sources: {n} • Category: {category}*\n\n"
                                    "STYLE RULES:\n"
                                    "- Write in third person, encyclopedic tone\n"
                                    "- Bold the subject on first mention\n"
                                    "- Use clear, concise prose\n"
                                    "- Include specific examples and data when available\n"
                                    "- Every major claim should reference a source [1], [2], etc.\n"
                                    "- Use markdown formatting (headers, lists, tables, bold)\n"
                                    "- Keep sections balanced in length\n"
                                    "- End with actionable insights or next steps if applicable"
                                ),
                            },
                            {
                                "role": "user",
                                "content": (
                                    f"Write a wiki article about: {title}\n"
                                    f"Category: {category}\n\n"
                                    f"Source materials:\n{raw_content}\n\n"
                                    f"Remember to follow the Wikipedia structure exactly."
                                ),
                            },
                        ],
                        "max_tokens": 2000,
                        "temperature": 0.6,
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

    Supports both JWT Bearer auth (from UI) and X-API-Key (for cron jobs).
    """
    from app.database import get_db
    from app.models import User

    harvest_key = settings.HARVEST_API_KEY

    force_recompile = False  # Set True to recompile domains that already have articles
    if harvest_key and x_api_key == harvest_key:
        # Cron / admin path — look up Freddy's account; always force recompile
        force_recompile = True
        try:
            db = next(get_db())
            user = db.query(User).filter(User.email == "contact@example.com").first()
            if not user:
                user = db.query(User).filter(User.email.like("%@greenplot.%")).first()
            if not user:
                user = db.query(User).first()
            tenant_id = str(user.tenant_id)
            user_id = str(user.id)
            db.close()
        except Exception:
            raise HTTPException(status_code=500, detail="No users found for API key auth")
    else:
        # Bearer token path — used by UI compile button
        auth_header = request.headers.get("authorization", "")
        token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else ""
        if not token:
            raise HTTPException(status_code=401, detail="Authentication required (Bearer token or X-API-Key)")
        try:
            from app.auth import decode_token
            payload = decode_token(token)
            user_id_str = payload.get("sub")
            if not user_id_str:
                raise HTTPException(status_code=401, detail="Invalid token")
            db = next(get_db())
            user = db.query(User).filter(User.id == user_id_str).first()
            db.close()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            tenant_id = str(user.tenant_id)
            user_id = str(user.id)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail="Could not validate credentials")

    # 1. Get all enriched links (may be empty — that's OK, seed clusters still compile)
    links = weaviate_client.get_links(tenant_id=tenant_id, limit=200)
    enriched = [l for l in links if l.get("status") == "enriched" and l.get("summary")]
    logger.info(f"auto_compile: tenant={tenant_id} total_links={len(links)} enriched={len(enriched)}")

    # 1b. Get seeds — prefer Weaviate, fall back to Postgres (source of truth)
    all_seeds = weaviate_client.get_seeds_by_tenant(tenant_id, limit=200)
    weaviate_has_domains = any(s.get("domain") for s in all_seeds)
    logger.warning(f"auto_compile: weaviate seeds={len(all_seeds)} has_domains={weaviate_has_domains}")
    if not all_seeds or not weaviate_has_domains:
        # Weaviate may be empty or seeds lack domain data — read directly from Postgres
        try:
            from app.database import get_db
            from app.models import Seed
            db = next(get_db())
            # Fetch up to 2000 seeds so domain-tagged seeds (which may be older) are included
            pg_seeds = db.query(Seed).filter(Seed.tenant_id == tenant_id).order_by(Seed.created_at.desc()).limit(2000).all()
            db.close()
            all_seeds = []
            for s in pg_seeds:
                meta = s.seed_metadata or {}
                tags_raw = meta.get("tags", "")
                tags = ", ".join(tags_raw) if isinstance(tags_raw, list) else (tags_raw or "")
                all_seeds.append({
                    "id": str(s.id),
                    "title": s.title or "",
                    "content": s.content or "",
                    "domain": meta.get("domain", "") or "",
                    "energy": meta.get("energy", "") or "",
                    "tags": tags,
                    "summary": meta.get("summary", "") or "",
                })
            logger.warning(f"auto_compile: postgres fallback seeds={len(all_seeds)}")
        except Exception as e:
            logger.warning(f"Postgres seed fallback failed: {e}")

    # 2. Get existing wiki articles and their source IDs
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
    covered_link_ids = set()
    for article in articles:
        for lid in article.get("sourceLinkIds", []):
            covered_link_ids.add(lid)

    # 3. Find enriched links NOT yet in any wiki article
    uncovered = [l for l in enriched if l.get("id") not in covered_link_ids]
    # Note: if no enriched links we skip the link-cluster path but still compile seed clusters below

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

    # 6. Compile eligible clusters (2+ links, no existing article)
    compiled = 0
    results = []

    for domain, group in domain_groups.items():
        if len(group) < 2:
            continue
        if not force_recompile and domain in existing_domains:
            continue

        # Build content from links
        contents = []
        source_link_ids = []
        for l in group[:8]:
            contents.append(f"## {l.get('title', 'Untitled')}\n\n{l.get('summary', '')}")
            source_link_ids.append(l.get("id", ""))

        # Also pull related seeds — your actual thinking
        source_seed_ids = []
        
        # Build link tags and keywords (handle both string and list formats)
        link_tags = set()
        link_keywords = set()
        for l in group:
            tags = l.get("tags", "")
            if isinstance(tags, list):
                for t in tags:
                    t = str(t).strip().lower()
                    if t and len(t) > 2:
                        link_tags.add(t)
            elif isinstance(tags, str):
                for t in tags.split(","):
                    t = t.strip().lower()
                    if t and len(t) > 2:
                        link_tags.add(t)
            # Keywords from title
            title_words = (l.get("title", "") or "").lower().split()
            for w in title_words:
                w = w.strip(".,;:!?()[]{}\"'")
                if len(w) > 3 and w not in {"with", "from", "this", "that", "have", "will", "your", "about"}:
                    link_keywords.add(w)

        # Match seeds by tags, title keywords, or content mentions
        for seed in all_seeds:
            seed_tags = set(t.strip().lower() for t in str(seed.get("tags", "")).split(",") if t.strip())
            seed_title = (seed.get("title", "") or "").lower()
            seed_content = (seed.get("content", "") or "").lower()[:500]
            
            # 1. Tag overlap
            tag_overlap = link_tags & seed_tags
            
            # 2. Title keyword overlap (2+ words)
            seed_words = set(w.strip(".,;:!?()[]{}\"'") for w in seed_title.split() if len(w) > 3)
            title_overlap = link_keywords & seed_words
            
            # 3. Content mentions link keywords
            content_match = any(kw in seed_content for kw in list(link_tags | link_keywords)[:5])
            
            if tag_overlap or len(title_overlap) >= 2 or content_match:
                s_title = seed.get("title", "Untitled")
                s_content = (seed.get("content", "") or "")[:300]
                contents.append(f"## 💡 {s_title} *(from Garden)*\n\n{s_content}")
                source_seed_ids.append(seed.get("id", ""))

        if not contents:
            continue

        # Prepare sources for LLM
        links_data = [{"title": l.get("title", ""), "url": l.get("url", ""), 
                        "summary": l.get("summary", ""), "domain": l.get("domain", ""),
                        "tags": l.get("tags", "")} for l in group[:8]]
        seeds_data = [{"title": s.get("title", ""), "content": s.get("content", ""),
                        "tags": s.get("tags", "")} for s in all_seeds 
                        if s.get("id") in source_seed_ids][:8]
        
        links_content, seeds_content = prepa<RESEND_API_KEY>(links_data, seeds_data)
        title = f"{domain.title()} — Insights"
        category = _detect_category(domain, group)

        # High-quality LLM synthesis
        user_prompt = build_wiki_user_prompt(title, category, links_content, seeds_content)
        article_content = await synthesize_with_llm(WIKI_SYSTEM_PROMPT, user_prompt)
        
        if not article_content:
            # Fallback: create structured article from sources
            article_content = f"# {title}\n\n"
            article_content += f"**{title}** is a knowledge cluster compiled from {len(group)} sources and {len(source_seed_ids)} personal notes.\n\n"
            article_content += "## Contents\n- [Sources](#sources)\n- [Personal Notes](#personal-notes)\n\n"
            article_content += "## Sources\n\n" + links_content + "\n\n"
            article_content += "## Personal Notes\n\n" + seeds_content + "\n\n"
            article_content += f"\n---\n*Auto-compiled from {len(group)} links and {len(source_seed_ids)} seeds*"
        
        # Rate limit protection between articles
        await asyncio.sleep(3)

        # Append Compiled Truth + Timeline entry (GBrain pattern)
        source_titles = [l.get("title", "") for l in group[:8] if l.get("title")]
        timeline_entry = _build_timeline_entry(len(source_seed_ids), len(source_link_ids), source_titles)
        article_content = _append_timeline_entry(article_content, timeline_entry)

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
                source_seed_ids=",".join(source_seed_ids),
                source_link_ids=",".join(source_link_ids),
                backlinks="",
                status="published",
            )
            compiled += 1
            results.append({"id": article_id, "title": title, "links": len(source_link_ids), "seeds": len(source_seed_ids)})
            # Auto-generate hero image in background (fire & forget)
            asyncio.ensure_future(_auto_generate_image(article_id, title, category=category, domain=domain, tenant_id=tenant_id))
        except Exception as e:
            logger.exception(f"auto_compile: failed to save link-cluster article '{title}': {e}")
            continue

    # ── Also compile from seed clusters (seeds without links) ──
    # Group seeds by domain (fall back to primary tag if domain is missing/generic)
    _SKIP_DOMAINS = {"none", "untagged"}
    seed_groups = {}
    for seed in all_seeds:
        domain = (seed.get("domain", "") or "").strip().lower()
        # If domain is missing, "general", or meaningless, try the first meaningful tag
        if not domain or domain in _SKIP_DOMAINS or domain == "general":
            tags_raw = seed.get("tags", "") or ""
            tag_list = [t.strip().lower() for t in (tags_raw if isinstance(tags_raw, str) else ", ".join(tags_raw)).split(",") if t.strip() and len(t.strip()) > 2]
            # Skip noise tags
            _NOISE = {"general", "idea", "note", "misc", "todo", "untitled", "untagged", "none"}
            tag_list = [t for t in tag_list if t not in _NOISE]
            domain = tag_list[0] if tag_list else ""
        if not domain or domain in _SKIP_DOMAINS:
            continue
        if domain not in seed_groups:
            seed_groups[domain] = []
        seed_groups[domain].append(seed)

    # Sort by seed count descending, cap at top 8 domains to keep compile time reasonable
    seed_groups = dict(sorted(seed_groups.items(), key=lambda x: len(x[1]), reverse=True)[:8])
    logger.warning(f"auto_compile: seed_groups={list(seed_groups.keys())} sizes={[len(v) for v in seed_groups.values()]}")

    # Find seed groups not yet covered by wiki
    covered_seed_ids = set()
    for article in articles:
        seed_ids_raw = article.get("sourceSeedIds", "") or ""
        if isinstance(seed_ids_raw, list):
            covered_seed_ids.update(s.strip() for s in seed_ids_raw if s.strip())
        else:
            for sid in seed_ids_raw.split(","):
                if sid.strip():
                    covered_seed_ids.add(sid.strip())

    for domain, seeds_group in seed_groups.items():
        if len(seeds_group) < 1:  # Need at least 1 seed for a cluster
            continue
        
        # Skip if all seeds already covered
        uncovered_seeds = [s for s in seeds_group if s.get("id", "") not in covered_seed_ids]
        if not uncovered_seeds:
            continue

        # Check if we already have an article for this domain (skip if force_recompile)
        if not force_recompile:
            domain_exists = any(
                a.get("category", "").lower() == domain.lower() or
                domain.lower() in a.get("title", "").lower()
                for a in articles
            )
            if domain_exists:
                continue

        # Build content from seeds
        contents = []
        source_seed_ids = []
        for seed in uncovered_seeds[:8]:
            s_title = seed.get("title", "Untitled")
            s_content = (seed.get("content", "") or "")[:400]
            contents.append(f"## 💡 {s_title}\n\n{s_content}")
            source_seed_ids.append(seed.get("id", ""))

        if not contents:
            continue

        # Prepare seeds for LLM
        seeds_data = [{"title": s.get("title", ""), "content": s.get("content", ""),
                        "tags": s.get("tags", "")} for s in uncovered_seeds[:8]]
        _, seeds_content = prepa<RESEND_API_KEY>([], seeds_data)
        
        title = f"{domain.title()} — Garden Insights"
        category = _detect_category(domain, [])

        # High-quality LLM synthesis
        user_prompt = build_wiki_user_prompt(title, category.title(), "", seeds_content)
        article_content = await synthesize_with_llm(WIKI_SYSTEM_PROMPT, user_prompt)
        
        if not article_content:
            # Fallback
            article_content = f"# {title}\n\n**{title}** represents a cluster of {len(uncovered_seeds)} related ideas from the Garden.\n\n"
            article_content += "## Contents\n- [Ideas](#ideas)\n\n## Ideas\n\n" + seeds_content
            article_content += f"\n---\n*Compiled from {len(uncovered_seeds)} seeds*"
        
        # Rate limit protection
        await asyncio.sleep(3)

        # Append Compiled Truth + Timeline entry (GBrain pattern)
        seed_titles = [s.get("title", "") for s in uncovered_seeds[:8] if s.get("title")]
        timeline_entry = _build_timeline_entry(len(source_seed_ids), 0, seed_titles)
        article_content = _append_timeline_entry(article_content, timeline_entry)

        # Extract summary
        lines = article_content.split("\n")
        summary_lines = []
        for line in lines:
            if line.strip() and not line.startswith("#") and not line.startswith("```"):
                summary_lines.append(line.strip())
                if len(" ".join(summary_lines)) > 200:
                    break
        summary = " ".join(summary_lines)[:300]

        try:
            logger.info(f"auto_compile: saving seed-cluster article '{title}' (domain={domain}, seeds={len(source_seed_ids)})")
            article_id = weaviate_client.add_wiki_article(
                tenant_id=tenant_id,
                user_id=user_id,
                title=title,
                category=category.title(),
                summary=summary,
                content=article_content,
                source_seed_ids=",".join(source_seed_ids),
                source_link_ids="",
                backlinks="",
                status="published",
            )
            compiled += 1
            results.append({"id": article_id, "title": title, "links": 0, "seeds": len(source_seed_ids)})

            # Auto-generate hero image in background (fire & forget)
            asyncio.ensure_future(_auto_generate_image(article_id, title, category=category, domain=domain, tenant_id=tenant_id))
        except Exception as e:
            logger.exception(f"auto_compile: failed to save seed-cluster article '{title}': {e}")
            continue

    return {
        "ok": True,
        "compiled": compiled,
        "articles": results,
        "_debug": {
            "weaviate_seeds": len(all_seeds),
            "weaviate_had_domains": weaviate_has_domains,
            "seed_groups": {k: len(v) for k, v in seed_groups.items()},
            "existing_articles": len(articles),
            "enriched_links": len(enriched),
            "uncovered_links": len(uncovered),
        },
    }



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
                        "model": WIKI_MODEL,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "Turn this raw text into a well-structured wiki article following Wikipedia format. "
                                    "Structure:\n"
                                    "1. # Title with bold definition\n"
                                    "2. Lead paragraph (2-4 sentences overview)\n"
                                    "3. Table of Contents\n"
                                    "4. Organized ## sections with ### subsections\n"
                                    "5. See Also with [[wikilinks]]\n"
                                    "6. References\n"
                                    "Keep all substantive content. Use encyclopedic tone. Add citations where possible."
                                ),
                            },
                            {"role": "user", "content": text},
                        ],
                        "temperature": 0.3,
                        "max_tokens": 2500,
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
                        "model": WIKI_MODEL,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    "You are a wiki article writer following Wikipedia/GrokPedia structure. "
                                    "Given source materials, write a comprehensive article.\n\n"
                                    "STRUCTURE:\n"
                                    "1. # Title with bold definition sentence\n"
                                    "2. Lead paragraph (2-4 sentences overview)\n"
                                    "3. Table of Contents\n"
                                    "4. Background section\n"
                                    "5. Key Concepts (2-4 ### subsections)\n"
                                    "6. Applications/Examples\n"
                                    "7. Connections to other topics\n"
                                    "8. See Also with wikilinks [[Topic]]\n"
                                    "9. References with numbered sources\n"
                                    "10. Footer with metadata\n\n"
                                    "Write in encyclopedic tone. Bold subject on first mention. Include citations [1], [2]."
                                ),
                            },
                            {
                                "role": "user",
                                "content": f"Regenerate and improve this wiki article: {title}\n\nSources:\n{raw_content}",
                            },
                        ],
                        "max_tokens": 2500,
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


@router.patch("/{article_id}")
async def patch_article(article_id: str, request: Request, current_user = Depends(get_current_user)):
    """Manually edit an article's title/content/summary (Library editor)."""
    from datetime import datetime
    body = await request.json()
    updates = {}
    if body.get("title"):
        updates["title"] = str(body["title"]).strip()[:200]
    if body.get("content"):
        updates["content"] = str(body["content"])
        if not body.get("summary"):
            for line in str(body["content"]).split("\n"):
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    updates["summary"] = stripped[:300]
                    break
    if body.get("summary"):
        updates["summary"] = str(body["summary"]).strip()[:300]
    if not updates:
        raise HTTPException(status_code=422, detail="Provide title and/or content")
    updates["updated_at"] = datetime.utcnow().isoformat() + "Z"

    # Ownership check
    tenant_id = str(current_user.tenant_id)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
    if not any(a.get("id") == article_id for a in articles):
        raise HTTPException(status_code=404, detail="Article not found")

    if not weaviate_client.update_wiki_article(article_id, **updates):
        raise HTTPException(status_code=502, detail="Article update failed")
    return {"ok": True, "article_id": article_id, "title": updates.get("title")}


@router.post("/articles")
async def create_article_endpoint(request: Request, current_user = Depends(get_current_user)):
    """Create a Library article directly (used by the MCP create_article tool)."""
    body = await request.json()
    title = (body.get("title") or "").strip()
    content = (body.get("content") or "").strip()
    category = (body.get("category") or "Note").strip()
    if not title or not content:
        raise HTTPException(status_code=422, detail="title and content are required")
    summary = (body.get("summary") or "").strip()
    if not summary:
        for line in content.split("\n"):
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                summary = stripped[:300]
                break
    try:
        article_id = weaviate_client.add_wiki_article(
            tenant_id=str(current_user.tenant_id),
            user_id=str(current_user.id),
            title=title,
            category=category,
            summary=summary or content[:300],
            content=content,
            status="published",
        )
        return {"ok": True, "article_id": article_id, "title": title}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Article creation failed: {e}")


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
    tag_parts = []
    for l in links:
        tags = l.get("tags", "")
        if isinstance(tags, list):
            tag_parts.extend(str(t) for t in tags)
        elif isinstance(tags, str):
            tag_parts.append(tags)
    all_tags = " ".join(tag_parts).lower()
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


@router.post("/{article_id}/generate-image")
async def generate_article_image(article_id: str, current_user=Depends(get_current_user)):
    """Image generation was removed (BFL retired)."""
    raise HTTPException(status_code=410, detail="Image generation has been removed")

@router.get("/{article_id}/concept-map")
async def get_concept_map(
    article_id: str,
    request: Request,
    current_user=Depends(get_optional_user),
):
    """Get D3.js-compatible concept map data for an article and its connections."""
    import re
    user = current_user
    # Use user's tenant_id, fallback to Freddy's tenant for unauthenticated
    if hasattr(user, 'tenant_id') and user.tenant_id:
        tenant_id = str(user.tenant_id)
    else:
        # Unauthenticated request - use Freddy's known tenant
        tenant_id = "87959b2e-5443-4c50-9336-2da01af82c14"

    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
    article = next((a for a in articles if a.get("id") == article_id), None)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    # Fetch seeds for tag-based connections
    all_seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    seed_map = {s.get("id"): s for s in all_seeds}

    # Build nodes and links for D3 force graph
    nodes = []
    links = []
    node_ids = set()

    # Central node
    nodes.append({
        "id": article_id,
        "label": article.get("title", "Article"),
        "type": "article",
        "category": article.get("category", "General"),
        "size": 20,
    })
    node_ids.add(article_id)

    # --- Helper: extract tags from seeds ---
    def get_seed_tags(seed_ids):
        tags = set()
        for sid in seed_ids:
            seed = seed_map.get(sid, {})
            raw_tags = seed.get("tags") or seed.get("domain", "") or ""
            for t in raw_tags.split(","):
                t = t.strip().lower()
                if t and t not in ("untitled", "none", ""):
                    tags.add(t)
        return tags

    # --- Helper: extract content keywords ---
    def get_content_words(seed_ids):
        words = set()
        for sid in seed_ids:
            seed = seed_map.get(sid, {})
            title = (seed.get("title") or "") + " " + (seed.get("content") or "")
            for w in re.sub(r'[^a-zA-Z ]', ' ', title.lower()).split():
                if len(w) > 3:
                    words.add(w)
        return words

    # 1. Explicit backlinks (stored)
    backlinks = article.get("backlinks", [])
    if isinstance(backlinks, str):
        try:
            backlinks = json.loads(backlinks)
        except:
            backlinks = []
    for bl_id in backlinks:
        if bl_id not in node_ids:
            bl_article = next((a for a in articles if a.get("id") == bl_id), None)
            if bl_article:
                nodes.append({
                    "id": bl_id,
                    "label": bl_article.get("title", "Related"),
                    "type": "article",
                    "category": bl_article.get("category", "General"),
                    "size": 12,
                })
                node_ids.add(bl_id)
                links.append({"source": article_id, "target": bl_id, "type": "backlink"})

    # 2. Source seeds (shown as nodes)
    source_seed_ids_raw = article.get("sourceSeedIds", [])
    if isinstance(source_seed_ids_raw, str):
        source_seed_ids_raw = [s.strip() for s in source_seed_ids_raw.split(",") if s.strip()]
    for sid in source_seed_ids_raw[:6]:
        if sid not in node_ids:
            seed = seed_map.get(sid, {})
            seed_title = seed.get("title", "") or f"Seed {sid[:6]}"
            nodes.append({
                "id": sid,
                "label": seed_title[:30],
                "type": "seed",
                "size": 8,
            })
            node_ids.add(sid)
        links.append({"source": article_id, "target": sid, "type": "source"})

    # 3. Connections to OTHER articles via shared seed tags
    my_seed_ids = set(article.get("sourceSeedIds", []) or [])
    my_link_ids = set(article.get("sourceLinkIds", []) or [])
    my_tags = get_seed_tags(my_seed_ids)
    my_words = get_content_words(my_seed_ids)

    connections = []
    for other in articles:
        if other.get("id") == article_id: continue
        other_seed_ids = set(other.get("sourceSeedIds", []) or [])
        other_link_ids = set(other.get("sourceLinkIds", []) or [])
        
        # Shared source IDs
        shared_ids = (my_seed_ids & other_seed_ids) | (my_link_ids & other_link_ids)
        
        # Shared tags (strongest semantic signal)
        other_tags = get_seed_tags(other_seed_ids)
        shared_tags = my_tags & other_tags
        
        # Title keyword overlap
        other_words = get_content_words(other_seed_ids)
        shared_words = my_words & other_words
        
        # Score the connection
        score = len(shared_ids) * 3 + len(shared_tags) * 2 + min(len(shared_words), 10) * 0.5
        if score > 0 and other.get("id") not in node_ids:
            connections.append((other, score, len(shared_tags), shared_tags, len(shared_words)))

    # Sort by score, take top 5
    connections.sort(key=lambda x: x[1], reverse=True)
    for conn in connections[:5]:
        other_art, score, tag_count, shared_tags, word_count = conn
        nodes.append({
            "id": other_art["id"],
            "label": other_art.get("title", "Related")[:35],
            "type": "article",
            "category": other_art.get("category", "General"),
            "size": max(10, min(16, int(score / 2))),
        })
        node_ids.add(other_art["id"])
        
        conn_type = "shared-tags" if tag_count > 0 else "keyword-overlap"
        conn_label = f"{tag_count} tags, {word_count} words" if tag_count else f"{word_count} words"
        links.append({
            "source": article_id,
            "target": other_art["id"],
            "type": conn_type,
            "shared_count": tag_count or word_count,
            "connection_label": conn_label,
        })

    return {"nodes": nodes, "links": links}



# ── Wiki Image Serving ──────────────────────────────
import os
from fastapi.responses import FileResponse

IMAGES_DIR = "/app/public/wiki-images"


@router.get("/images/{filename}")
async def get_wiki_image(filename: str):
    """Serve locally stored wiki hero images."""
    filepath = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Image not found")
    if not filename.endswith(('.jpeg', '.jpg', '.png', '.webp')):
        raise HTTPException(status_code=400, detail="Invalid image type")
    return FileResponse(filepath, media_type="image/jpeg")
