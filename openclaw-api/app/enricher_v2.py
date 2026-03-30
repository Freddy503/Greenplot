"""
enricher_v2.py
Full enrichment pipeline: chunk → extract entities → embed → store → backlink.

Drop-in replacement for enrich_thought() in enricher.py.
Calls chunker, entity_extractor, and backlinker modules.
"""

import json
import uuid
from datetime import datetime, date
from typing import Optional

from app.chunker import chunk_text, should_chunk
from app.entity_extractor import extract_entities
from app.backlinker import find_and_create_links
from app.enricher import embed_text, generate_seed
from app.weaviate_client import weaviate_client
from app.database import get_db
from app.models import Thought, Seed, Usage, Entity, SeedEntity, SeedLink
from app.config import settings


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

    # ── Step 1: Chunk ──
    chunks = chunk_text(content)
    is_chunked = len(chunks) > 1

    # ── Step 2: Extract entities ──
    extraction = extract_entities(content)
    entities = extraction.get("entities", [])
    topics = extraction.get("topics", [])
    summary = extraction.get("summary", "")

    entity_names = [e["name"] for e in entities]

    # ── Step 3: Embed ──
    embeddings = []
    for chunk in chunks:
        emb = embed_text(chunk["text"])
        embeddings.append(emb)

    # ── Step 4: Generate seed via LLM ──
    seed_data = generate_seed(content)
    title = seed_data.get("title", "Untitled Seed")
    seed_content = seed_data.get("content", content)
    tags = seed_data.get("tags", [])

    # Merge extracted topics with LLM tags
    all_tags = list(set(tags + topics))

    # ── Step 5: Store in Postgres ──
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
            "chunked": is_chunked,
            "chunk_count": len(chunks),
            "source": "enriched_v2"
        },
        created_at=datetime.utcnow()
    )
    db.add(seed)
    db.flush()  # Get the seed ID without committing

    # Store entities in DB
    entity_records = []
    for e in entities:
        # Upsert entity
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

        # Link seed to entity
        seed_entity = SeedEntity(
            seed_id=seed.id,
            entity_id=entity_record.id,
            confidence=int(e.get("confidence", 0.5) * 1000)  # Store as int
        )
        db.add(seed_entity)
        entity_records.append(entity_record)

    # ── Step 6: Store in Weaviate ──
    try:
        if is_chunked:
            # Store each chunk as a separate vector with parent reference
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

            # Store the parent ID reference
            seed.embedding_ref = weaviate_ids[0] if weaviate_ids else None
        else:
            # Single vector — store as before
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
        # Don't fail the whole pipeline if Weaviate is down

    db.commit()
    db.refresh(seed)

    # ── Step 7: Backlinking ──
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
        # Don't fail if backlinking has issues

    # ── Step 8: Update usage ──
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

    # Token estimates
    input_tokens = len(content) // 4
    output_tokens = 500 + (len(entities) * 30)  # Seed gen + entity extraction
    usage.llm_tokens += input_tokens + output_tokens
    usage.embedding_tokens += len(content) // 4 * len(chunks)
    usage.vector_operations += len(chunks) + 1  # Chunks + backlink search
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
