import os
import json
import httpx
from datetime import datetime
from typing import Optional
from app.config import settings
from app.weaviate_client import weaviate_client
import openai

openai_client = openai.OpenAI(
    api_key=settings.OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

def embed_text(text: str) -> list:
    """Embed text using OpenRouter (1536-dim ada-002)."""
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    resp = httpx.post(
        "https://openrouter.ai/api/v1/embeddings",
        json={
            "input": text,
            "model": settings.EMBEDDING_MODEL,
        },
        headers={
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]

def generate_seed(thought_text: str) -> dict:
    # Use Nemotron Super to synthesize
    response = openai_client.chat.completions.create(
        model="nvidia/nemotron-3-super-120b-a12b:free",
        messages=[
            {"role": "system", "content": "You are an insight synthesizer. Given a raw thought, produce a structured seed with a concise title and a rich elaboration that captures the core idea and potential implications. Respond in JSON: {title: string, content: string, tags: string[]}"},
            {"role": "user", "content": thought_text}
        ],
        temperature=0.7,
        max_tokens=500
    )
    text = response.choices[0].message.content
    try:
        data = json.loads(text)
        return data
    except:
        # Fallback if model doesn't return JSON
        return {"title": "Insight", "content": text, "tags": []}

def generate_image(prompt: str) -> str:
    # Generate via BFL, return image URL
    if not settings.BFL_API_KEY:
        return None
    # Implementation similar to previous BFL scripts; return URL after upload to S3?
    # For now, skip actual generation; return a placeholder
    return None

def enrich_thought(thought_id: str, tenant_id: str, db):
    """Main enrichment logic: embed, store in Weaviate, synthesize, create seed."""
    thought = db.query(Thought).filter(Thought.id == thought_id).first()
    if not thought:
        return

    # 1. Embed the thought content
    embedding = embed_text(thought.content)

    # 2. Generate seed via LLM
    seed_data = generate_seed(thought.content)
    title = seed_data.get("title", "Untitled Seed")
    content = seed_data.get("content", thought.content)
    tags = seed_data.get("tags", [])

    # 3. Store seed in Postgres
    seed = Seed(
        tenant_id=uuid.UUID(tenant_id),
        user_id=thought.user_id,
        thought_id=thought.id,
        title=title,
        content=content,
        metadata={"tags": tags, "source": "enriched"},
        created_at=datetime.utcnow()
    )
    db.add(seed)
    db.commit()
    db.refresh(seed)

    # 4. Store vector in Weaviate
    weaviate_id = weaviate_client.add_seed(
        tenant_id=tenant_id,
        user_id=str(thought.user_id),
        thought_id=str(thought.id),
        title=title,
        content=content,
        embedding=embedding,
        metadata={"tags": tags},
        image_url=None,
        created_at=seed.created_at.isoformat()
    )
    seed.embedding_ref = weaviate_id
    db.commit()

    # 5. Optionally generate image (later)
    # image_url = generate_image(f"Concept diagram: {title} - {content[:200]}")
    # if image_url:
    #     seed.image_url = image_url
    #     db.commit()

    # 6. Update usage: count tokens (rough)
    # approximate: input tokens = len(thought.content)/4, output ~500 tokens
    # add to Usage table for this month
    today = date.today().replace(day=1)
    usage = db.query(Usage).filter(
        Usage.tenant_id == tenant_id,
        Usage.date == today
    ).first()
    if not usage:
        usage = Usage(
            tenant_id=uuid.UUID(tenant_id),
            user_id=thought.user_id,
            date=today,
            llm_tokens=0,
            embedding_tokens=0,
            images_generated=0,
            vector_operations=0
        )
        db.add(usage)
    # Rough estimates
    usage.llm_tokens += (len(thought.content) // 4) + 500
    usage.embedding_tokens += len(thought.content) // 4
    db.commit()

    return seed

def get_intent_router_prompt() -> str:
    # In future, analyze recent seeds to determine spark mode
    return "general"
