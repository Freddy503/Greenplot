"""
enricher_v2.py
Full enrichment pipeline: chunk → extract entities → embed → store → backlink.
Consolidates all utility functions previously in enricher.py.
"""

import os
import re
import json
import uuid
import httpx
from datetime import datetime, date
from typing import Optional

import openai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from app.chunker import chunk_text, should_chunk
from app.entity_extractor import extract_entities
from app.backlinker import find_and_create_links
from app.weaviate_client import weaviate_client
from app.database import get_db
from app.models import Thought, Seed, Usage, Entity, SeedEntity, SeedLink
from app.config import settings

openai_client = openai.OpenAI(
    api_key=settings.OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

_URL_RE = re.compile(r'https?://[^\s<>"\']+', re.IGNORECASE)
_GENERIC_TITLES = {"insight", "note", "untitled", "idea", "thought", "observation", "summary"}
_VALID_ENERGIES = {"HIGH", "MEDIUM", "LOW"}


def detect_url(text: str) -> Optional[str]:
    m = _URL_RE.search(text)
    return m.group(0).rstrip('.,;)') if m else None


def fetch_url_content(url: str) -> Optional[str]:
    exa_key = settings.EXA_API_KEY if hasattr(settings, 'EXA_API_KEY') else os.environ.get('EXA_API_KEY', '')
    if not exa_key:
        return None
    try:
        resp = httpx.post(
            "https://api.exa.ai/contents",
            headers={"x-api-key": exa_key, "Content-Type": "application/json"},
            json={"ids": [url], "text": {"maxCharacters": 8000, "includeHtmlTags": False}},
            timeout=20.0
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return None
        page = results[0]
        title = page.get("title", "")
        text = page.get("text", "") or ""
        if not text.strip():
            return None
        header = f"Title: {title}\nURL: {url}\n\n" if title else f"URL: {url}\n\n"
        return (header + text.strip())[:8000]
    except Exception as e:
        print(f"[enricher] Exa fetch failed for {url}: {e}")
        return None


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
    reraise=True,
)
def embed_text(text: str) -> list:
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    resp = httpx.post(
        "https://openrouter.ai/api/v1/embeddings",
        json={"input": text, "model": settings.EMBEDDING_MODEL},
        headers={
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def _strip_fences(raw: str) -> str:
    cleaned = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.IGNORECASE)
    return re.sub(r'\s*```$', '', cleaned.strip())


def _validate_seed_data(data: dict, thought_text: str) -> tuple[bool, list[str]]:
    errors = []
    if not isinstance(data, dict):
        return False, ["Response is not a JSON object"]
    title = data.get("title", "")
    if not title or not isinstance(title, str) or len(title.strip()) < 5:
        errors.append("title is missing or too short")
    elif title.strip().lower() in _GENERIC_TITLES:
        errors.append(f"title is generic: '{title}'")
    content = data.get("content", "")
    if not content or not isinstance(content, str) or len(content.strip()) < 30:
        errors.append("content is missing or too short")
    tags = data.get("tags", [])
    if not isinstance(tags, list):
        errors.append("tags must be a list")
    elif not all(isinstance(t, str) for t in tags):
        errors.append("tags must be a list of strings")
    energy = data.get("energy", "")
    if energy not in _VALID_ENERGIES:
        errors.append(f"energy '{energy}' is not one of HIGH/MEDIUM/LOW")
    domain = data.get("domain", "")
    if not domain or not isinstance(domain, str):
        errors.append("domain is missing")
    return len(errors) == 0, errors


def _apply_fallbacks(data: dict, thought_text: str) -> dict:
    first_sentence = thought_text.split('.')[0].strip()
    fallback_title = first_sentence[:60] or thought_text[:60]
    title = data.get("title", "")
    if not title or not isinstance(title, str) or len(title.strip()) < 5 or title.strip().lower() in _GENERIC_TITLES:
        data["title"] = fallback_title
    if not data.get("content") or not isinstance(data.get("content"), str):
        data["content"] = thought_text
    if not isinstance(data.get("tags"), list):
        data["tags"] = []
    else:
        data["tags"] = [str(t) for t in data["tags"] if t][:6]
    if data.get("energy") not in _VALID_ENERGIES:
        data["energy"] = "MEDIUM"
    if not data.get("domain") or not isinstance(data.get("domain"), str):
        data["domain"] = "General"
    return data


def _get_enrichment_base_prompt() -> str:
    try:
        from app.prompts import load_prompt
        p = load_prompt("seed_enrichment")
        if p:
            return p
    except Exception:
        pass
    return (
        "You are a knowledge distillation engine for a personal second brain. "
        "Given a raw thought (and optionally fetched web content), produce a structured seed.\n\n"
        "Rules:\n"
        "1. title: specific and informative (NOT generic like 'Insight', 'Note', 'Idea', 'Untitled')\n"
        "2. content: rich synthesis of key ideas, implications, and connections — minimum 3 sentences\n"
        "3. domain: infer freely from content (e.g. 'Machine Learning', 'Medicine', 'Personal Finance') — no fixed list\n"
        "4. energy: exactly 'HIGH' (novel/urgent/actionable), 'MEDIUM' (useful reference), or 'LOW' (minor note)\n"
        "5. tags: list of 3-6 specific keyword strings\n\n"
        'Output ONLY valid JSON with no markdown fences:\n'
        '{"title": "...", "content": "...", "tags": ["tag1", "tag2"], "domain": "...", "energy": "HIGH"}'
    )


def _call_llm_for_seed(thought_text: str, web_context: Optional[str], strict: bool = False) -> str:
    strictness = (
        "\n\nCRITICAL: Your response must be ONLY a JSON object — no prose, no markdown, no explanation. "
        "Start your response with '{' and end with '}'. "
        "energy MUST be exactly 'HIGH', 'MEDIUM', or 'LOW' (uppercase). "
        "tags MUST be a JSON array of strings."
    ) if strict else ""
    system_prompt = _get_enrichment_base_prompt() + strictness
    user_parts = [f"Raw thought:\n{thought_text}"]
    if web_context:
        user_parts.append(f"Fetched web content:\n{web_context[:4000]}")
    try:
        response = openai_client.chat.completions.create(
            model="minimax/minimax-m2.7",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "\n\n".join(user_parts)}
            ],
            temperature=0.3 if strict else 0.7,
            max_tokens=800
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        print(f"[enricher] LLM call failed: {e}")
        return ""


def generate_seed(thought_text: str, web_context: Optional[str] = None) -> dict:
    raw = _call_llm_for_seed(thought_text, web_context, strict=False)
    cleaned = _strip_fences(raw)
    try:
        data = json.loads(cleaned)
        valid, errors = _validate_seed_data(data, thought_text)
        if valid:
            return _apply_fallbacks(data, thought_text)
        print(f"[enricher] Seed validation failed ({errors}), retrying with strict prompt")
    except Exception as e:
        print(f"[enricher] JSON parse failed on attempt 1: {e}, retrying")
        data = {}
    try:
        raw2 = _call_llm_for_seed(thought_text, web_context, strict=True)
        cleaned2 = _strip_fences(raw2)
        data2 = json.loads(cleaned2)
        valid2, errors2 = _validate_seed_data(data2, thought_text)
        if valid2:
            return _apply_fallbacks(data2, thought_text)
        print(f"[enricher] Strict retry also invalid ({errors2}), applying fallbacks")
        return _apply_fallbacks(data2, thought_text)
    except Exception as e:
        print(f"[enricher] JSON parse failed on attempt 2: {e}, using safe fallback")
    first_sentence = thought_text.split('.')[0].strip()
    return {
        "title": first_sentence[:60] or thought_text[:60],
        "content": thought_text,
        "tags": [],
        "domain": "General",
        "energy": "MEDIUM",
    }


def _token_overlap_ratio(a: str, b: str) -> float:
    tokens_a = set(a.lower().split())
    tokens_b = set(b.lower().split())
    if not tokens_a or not tokens_b:
        return 0.0
    return len(tokens_a & tokens_b) / len(tokens_a | tokens_b)


def _normalize_against_wiki(tags: list[str], domain: str, tenant_id: str) -> tuple[list[str], str]:
    """
    Collapse tags and domain to canonical wiki article titles where token overlap >= 0.5.
    """
    try:
        wiki_titles = [
            a.get("title", "").strip()
            for a in weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
            if a.get("title")
        ]
        if not wiki_titles:
            return tags, domain

        normalized_tags = []
        for tag in tags:
            best_match = None
            best_score = 0.0
            for wt in wiki_titles:
                score = _token_overlap_ratio(tag, wt)
                if score > best_score:
                    best_score = score
                    best_match = wt
            if best_match and best_score >= 0.5:
                canonical = best_match.split("—")[0].strip()
                normalized_tags.append(canonical)
            else:
                normalized_tags.append(tag)

        seen = []
        for t in normalized_tags:
            if t not in seen:
                seen.append(t)
        normalized_tags = seen

        normalized_domain = domain
        best_domain_score = 0.0
        for wt in wiki_titles:
            score = _token_overlap_ratio(domain, wt)
            if score > best_domain_score:
                best_domain_score = score
                if score >= 0.5:
                    normalized_domain = wt.split("—")[0].strip()

        return normalized_tags, normalized_domain
    except Exception as e:
        print(f"[enricher_v2] Entity normalization failed (non-fatal): {e}")
        return tags, domain


def enrich_thought_v2(thought_id: str, tenant_id: str, db):
    """
    Full enrichment pipeline.
    1. Chunk the thought (if long enough)
    2. Extract entities, topics, summary
    3. Embed chunks
    4. Generate seed via LLM
    5. Store in Postgres + Weaviate
    6. Find and create backlinks
    """
    thought = db.query(Thought).filter(Thought.id == thought_id).first()
    if not thought:
        return None

    content = thought.content
    tenant_str = str(tenant_id)

    # Step 0: URL detection + web fetch
    web_context: Optional[str] = None
    detected_url: Optional[str] = detect_url(content)
    if detected_url:
        print(f"[enricher_v2] URL detected: {detected_url} — fetching via Exa")
        web_context = fetch_url_content(detected_url)
        if web_context:
            print(f"[enricher_v2] Fetched {len(web_context)} chars from {detected_url}")
        else:
            print(f"[enricher_v2] Exa fetch returned nothing for {detected_url}")

    # Step 1: Chunk
    chunks = chunk_text(content)
    is_chunked = len(chunks) > 1

    # Step 2: Extract entities
    extraction = extract_entities(content)
    entities = extraction.get("entities", [])
    topics = extraction.get("topics", [])
    summary = extraction.get("summary", "")
    entity_names = [e["name"] for e in entities]

    # Step 3: Embed
    embeddings = []
    for chunk in chunks:
        emb = embed_text(chunk["text"])
        embeddings.append(emb)

    # Step 4: Generate seed via LLM
    seed_data = generate_seed(content, web_context=web_context)
    title = seed_data.get("title", "Untitled Seed")
    seed_content = seed_data.get("content", content)
    tags = seed_data.get("tags", [])
    domain = seed_data.get("domain", "General")
    energy = seed_data.get("energy", "MEDIUM")

    all_tags = list(set(tags + topics))
    all_tags, domain = _normalize_against_wiki(all_tags, domain, tenant_str)

    # Step 4b: Quality gate — reject slop before storage
    _GENERIC = {
        'untitled', 'seed', 'note', 'idea', 'thought', 'insight',
        'observation', 'summary', 'draft', 'test', 'untitled seed',
    }
    if not title or len(title.strip()) < 5 or title.lower().strip() in _GENERIC:
        print(f"[enricher_v2] Quality gate: rejecting seed with generic/short title '{title}'")
        return None
    if not seed_content or len(seed_content.strip()) < 40:
        print(f"[enricher_v2] Quality gate: rejecting seed with insufficient content (title='{title}')")
        return None

    # Step 5: Store in Postgres
    # Dedup: if a seed with the same normalized title already exists for this user, skip creation
    try:
        from sqlalchemy import func as _func
        _existing_seed = db.query(Seed).filter(
            Seed.user_id == thought.user_id,
            _func.lower(_func.trim(Seed.title)) == title.lower().strip()
        ).first()
        if _existing_seed:
            # Prefer the richer content
            if len(seed_content) > len(_existing_seed.content or ""):
                _existing_seed.content = seed_content
            db.commit()
            print(f"[enricher_v2] Dedup: skipping duplicate seed '{title}' (exists as {_existing_seed.id})")
            return {
                "seed": _existing_seed,
                "entities": entities,
                "topics": topics,
                "summary": summary,
                "chunks": len(chunks),
                "links_created": 0,
                "links": [],
            }
    except Exception as _dedup_err:
        print(f"[enricher_v2] Dedup check failed (non-fatal): {_dedup_err}")

    seed = Seed(
        tenant_id=uuid.UUID(tenant_str),
        user_id=thought.user_id,
        thought_id=thought.id,
        title=title,
        content=seed_content,
        seed_metadata={
            "tags": all_tags,
            "entities": entity_names,
            "summary": summary,
            "domain": domain,
            "energy": energy,
            "source_url": detected_url,
            "web_enriched": web_context is not None,
            "chunked": is_chunked,
            "chunk_count": len(chunks),
            "source": "enriched_v2"
        },
        created_at=datetime.utcnow()
    )
    db.add(seed)
    db.flush()

    entity_records = []
    for e in entities:
        existing_entity = db.query(Entity).filter(
            Entity.tenant_id == tenant_str,
            Entity.name == e["name"],
            Entity.entity_type == e["type"]
        ).first()
        if existing_entity:
            existing_entity.mention_count += 1
            existing_entity.last_seen = datetime.utcnow()
            entity_record = existing_entity
        else:
            entity_record = Entity(
                tenant_id=uuid.UUID(tenant_str),
                name=e["name"],
                entity_type=e["type"],
                mention_count=1,
                first_seen=datetime.utcnow(),
                last_seen=datetime.utcnow()
            )
            db.add(entity_record)
            db.flush()
        seed_entity = SeedEntity(
            seed_id=seed.id,
            entity_id=entity_record.id,
            confidence=int(e.get("confidence", 0.5) * 1000)
        )
        db.add(seed_entity)
        entity_records.append(entity_record)

    # Step 6: Store in Weaviate
    try:
        if is_chunked:
            weaviate_ids = []
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                wv_id = weaviate_client.add_seed(
                    tenant_id=tenant_str,
                    user_id=str(thought.user_id),
                    thought_id=str(thought.id),
                    title=title if i == 0 else f"{title} (chunk {i+1})",
                    content=chunk["text"],
                    embedding=embedding,
                    metadata={
                        "tags": all_tags,
                        "entities": entity_names,
                        "summary": summary if i == 0 else "",
                        "chunk_index": i,
                        "is_chunk": True
                    },
                    image_url=None,
                    created_at=seed.created_at.isoformat()
                )
                weaviate_ids.append(wv_id)
            seed.embedding_ref = weaviate_ids[0] if weaviate_ids else None
        else:
            weaviate_id = weaviate_client.add_seed(
                tenant_id=tenant_str,
                user_id=str(thought.user_id),
                thought_id=str(thought.id),
                title=title,
                content=seed_content,
                embedding=embeddings[0],
                metadata={
                    "tags": all_tags,
                    "entities": entity_names,
                    "summary": summary,
                    "chunked": False
                },
                image_url=None,
                created_at=seed.created_at.isoformat()
            )
            seed.embedding_ref = weaviate_id
    except Exception as e:
        print(f"Weaviate storage error: {e}")

    db.commit()
    db.refresh(seed)

    # Step 7: Backlinking
    created_links = []
    try:
        created_links = find_and_create_links(
            seed_id=str(seed.id),
            tenant_id=tenant_str,
            seed_title=title,
            seed_content=seed_content,
            seed_entities=entity_names,
            seed_summary=summary
        )
    except Exception as e:
        print(f"Backlinking error: {e}")

    # Step 7b: Contradiction detection
    # Flag seeds with same domain but conflicting energy as potential contradictions.
    try:
        similar = weaviate_client.search_seeds(
            tenant_id=tenant_str,
            embedding=embeddings[0],
            limit=5,
        )
        contradictions = []
        for s in similar:
            sim_energy = (s.get("energy") or "").upper()
            sim_domain = (s.get("domain") or "").lower()
            sim_id = s.get("seed_id") or s.get("id", "")
            if (
                sim_id
                and sim_domain == domain.lower()
                and sim_energy
                and sim_energy != energy.upper()
                and {sim_energy, energy.upper()} in ({"HIGH", "LOW"},)
            ):
                contradictions.append({"id": sim_id, "title": s.get("title", ""), "energy": sim_energy})
        if contradictions:
            meta = seed.seed_metadata or {}
            meta["contradiction_candidates"] = contradictions
            seed.seed_metadata = meta
            db.commit()
    except Exception as e:
        print(f"[enricher_v2] Contradiction detection error (non-fatal): {e}")

    # Step 7c: Suggested links (auto-link suggestions for Garden UI)
    # Find top-5 semantically similar seeds not already linked.
    try:
        similar_for_suggestions = weaviate_client.search_seeds(
            tenant_id=tenant_str,
            embedding=embeddings[0],
            limit=8,
        )
        existing_link_ids = {str(l.target_seed_id) for l in created_links} if created_links else set()
        suggestions = []
        for s in similar_for_suggestions:
            sid = s.get("seed_id") or s.get("id", "")
            if sid and sid != str(seed.id) and sid not in existing_link_ids:
                suggestions.append({"id": sid, "title": s.get("title", "Untitled")})
            if len(suggestions) >= 5:
                break
        if suggestions:
            meta = seed.seed_metadata or {}
            meta["suggested_links"] = suggestions
            seed.seed_metadata = meta
            db.commit()
    except Exception as e:
        print(f"[enricher_v2] Suggested links error (non-fatal): {e}")

    # Step 7d: Ingest log
    try:
        from app.ingest_log import append_log_entry
        source_label = detected_url or "manual"
        append_log_entry(
            tenant_id=tenant_str,
            action="seed_ingested",
            source=source_label,
            summary=f"{title[:80]} [{domain}]",
            db=db,
        )
    except Exception:
        pass

    # Step 8: Update usage
    today = date.today().replace(day=1)
    usage = db.query(Usage).filter(
        Usage.tenant_id == tenant_str,
        Usage.date == today
    ).first()
    if not usage:
        usage = Usage(
            tenant_id=uuid.UUID(tenant_str),
            user_id=thought.user_id,
            date=today,
            llm_tokens=0,
            embedding_tokens=0,
            images_generated=0,
            vector_operations=0
        )
        db.add(usage)
    input_tokens = len(content) // 4
    output_tokens = 500 + (len(entities) * 30)
    usage.llm_tokens += input_tokens + output_tokens
    usage.embedding_tokens += len(content) // 4 * len(chunks)
    usage.vector_operations += len(chunks) + 1
    db.commit()

    return {
        "seed": seed,
        "entities": entities,
        "topics": topics,
        "summary": summary,
        "chunks": len(chunks),
        "links_created": len(created_links),
        "links": created_links
    }
