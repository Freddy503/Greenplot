"""
backlinker.py
Autonomous backlinking: when a new seed is created, find related
existing seeds via vector similarity + entity overlap, and create links.
"""

import json
from typing import Optional
from datetime import datetime
from app.config import settings
from app.weaviate_client import weaviate_client
from app.database import get_db
from app.models import Seed, SeedLink
import openai
import httpx


openai_client = openai.OpenAI(
    api_key=settings.OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

# Similarity thresholds
AUTO_LINK_THRESHOLD = 0.85    # Auto-create link, no LLM check
LLM_CONFIRM_THRESHOLD = 0.72  # Ask LLM if connection is real
MIN_THRESHOLD = 0.72          # Below this, skip entirely

MAX_CANDIDATES = 10  # Top-k from Weaviate


def embed_text(text: str) -> list[float]:
    """Embed text using OpenRouter."""
    resp = httpx.post(
        "https://openrouter.ai/api/v1/embeddings",
        json={
            "input": text[:2000],
            "model": "openai/text-embedding-ada-002",
        },
        headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def search_similar(
    tenant_id: str,
    embedding: list[float],
    exclude_id: str = None,
    limit: int = MAX_CANDIDATES
) -> list[dict]:
    """
    Search Weaviate for similar seeds.

    Returns list of:
    {id, title, summary, entities, topics, distance, certainty}
    """
    try:
        results = weaviate_client.search_similar(
            tenant_id=tenant_id,
            embedding=embedding,
            limit=limit
        )
        # Filter out the seed itself if provided
        if exclude_id:
            results = [r for r in results if r.get("id") != exclude_id]
        return results
    except Exception as e:
        print(f"Similarity search error: {e}")
        return []


def entity_overlap_score(entities_a: list[str], entities_b: list[str]) -> float:
    """Calculate entity overlap between two sets."""
    if not entities_a or not entities_b:
        return 0.0
    set_a = set(e.lower() for e in entities_a)
    set_b = set(e.lower() for e in entities_b)
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union) if union else 0.0


def confirm_with_llm(
    source_title: str,
    source_summary: str,
    target_title: str,
    target_summary: str
) -> dict:
    """
    Ask LLM to confirm if two seeds are genuinely related.

    Returns: {"confirmed": bool, "link_type": str, "reasoning": str}
    """
    try:
        response = openai_client.chat.completions.create(
            model=settings.ENRICH_MODEL,
            messages=[
                {"role": "system", "content": """You are a connection finder for a personal knowledge base.
Two notes were found to be semantically similar. Determine if they are genuinely related.

Return JSON only:
{
  "confirmed": true/false,
  "link_type": "similar|builds_on|contradicts|related|part_of",
  "reasoning": "Brief explanation"
}

Link types:
- similar: Same idea expressed differently
- builds_on: One extends or develops the other
- contradicts: They present opposing views
- related: Connected by a shared theme but different focus
- part_of: One is a component/subset of the other

Be strict: only confirm if there's a meaningful intellectual connection, not just shared keywords."""},
                {"role": "user", "content": f"Note A: {source_title}\n{source_summary}\n\nNote B: {target_title}\n{target_summary}"}
            ],
            temperature=0.2,
            max_tokens=150
        )

        raw = response.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        raw = raw.strip()

        return json.loads(raw)

    except Exception as e:
        print(f"LLM confirmation error: {e}")
        return {"confirmed": False, "link_type": "similar", "reasoning": "error"}


def find_and_create_links(
    seed_id: str,
    tenant_id: str,
    seed_title: str,
    seed_content: str,
    seed_entities: list[str] = None,
    seed_summary: str = ""
) -> list[dict]:
    """
    Main backlinking function.

    1. Embed the new seed
    2. Search for similar seeds in Weaviate
    3. Score candidates (similarity + entity overlap)
    4. Create links for confirmed connections

    Returns list of created links:
    [{target_seed_id, target_title, link_type, confidence}]
    """
    created_links = []

    # 1. Embed (use summary if available, otherwise title + content)
    search_text = f"{seed_title}. {seed_summary}" if seed_summary else f"{seed_title}. {seed_content[:500]}"
    embedding = embed_text(search_text)

    # 2. Search similar
    candidates = search_similar(tenant_id, embedding, exclude_id=seed_id)

    if not candidates:
        return created_links

    # 3. Process candidates
    for candidate in candidates:
        certainty = candidate.get("certainty", 0.0)
        if certainty < MIN_THRESHOLD:
            continue

        target_id = candidate.get("id")
        target_title = candidate.get("title", "Untitled")
        target_summary = candidate.get("summary", "")
        target_entities = candidate.get("entities", [])

        # Entity overlap bonus
        entity_score = 0.0
        if seed_entities and target_entities:
            entity_score = entity_overlap_score(seed_entities, target_entities)

        # Combined score (vector similarity + entity overlap)
        combined_score = (certainty * 0.7) + (entity_score * 0.3)

        # Determine link type and whether to create
        link_type = "similar"
        confidence = combined_score

        if combined_score >= AUTO_LINK_THRESHOLD:
            # Auto-link: high confidence
            if entity_score > 0.3:
                link_type = "related"  # Strong entity connection
        elif combined_score >= LLM_CONFIRM_THRESHOLD:
            # Medium confidence: ask LLM
            llm_result = confirm_with_llm(
                seed_title, seed_summary or seed_content[:200],
                target_title, target_summary
            )
            if not llm_result.get("confirmed", False):
                continue  # LLM says no real connection
            link_type = llm_result.get("link_type", "similar")
        else:
            continue  # Below threshold

        # 4. Create the link (skip if duplicate)
        try:
            db = next(get_db())
            existing = db.query(SeedLink).filter(
                SeedLink.source_seed_id == seed_id,
                SeedLink.target_seed_id == target_id,
                SeedLink.link_type == link_type
            ).first()

            if not existing:
                link = SeedLink(
                    source_seed_id=seed_id,
                    target_seed_id=target_id,
                    link_type=link_type,
                    confidence=confidence
                )
                db.add(link)
                db.commit()

                created_links.append({
                    "target_seed_id": target_id,
                    "target_title": target_title,
                    "link_type": link_type,
                    "confidence": round(confidence, 3)
                })

            db.close()

        except Exception as e:
            print(f"Link creation error: {e}")
            continue

    return created_links
