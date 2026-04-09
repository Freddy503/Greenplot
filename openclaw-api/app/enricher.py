import os
import re
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

_URL_RE = re.compile(r'https?://[^\s<>"\']+', re.IGNORECASE)

def detect_url(text: str) -> Optional[str]:
    """Return the first URL found in text, or None."""
    m = _URL_RE.search(text)
    return m.group(0).rstrip('.,;)') if m else None

def fetch_url_content(url: str) -> Optional[str]:
    """
    Fetch full page content via Exa /contents.
    Returns substantive text (up to ~8000 chars) or None on failure.
    """
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

def generate_seed(thought_text: str, web_context: Optional[str] = None) -> dict:
    """
    Synthesize a structured seed from raw thought + optional web content.

    Returns: {title, content, tags, domain, energy}
      - domain: LLM-inferred field (e.g. "AI", "Medicine", "Finance") — no hardcoded list
      - energy: "HIGH" | "MEDIUM" | "LOW" based on novelty/urgency signals
    """
    system_prompt = (
        "You are a knowledge distillation engine for a personal second brain. "
        "Given a raw thought (and optionally fetched web content), produce a structured seed that:\n"
        "1. Has a specific, informative title (not generic like 'Insight' or 'Note')\n"
        "2. Has rich content: synthesize the key ideas, implications, and connections — at least 3-5 sentences\n"
        "3. Infers the knowledge domain from the content (e.g. 'Machine Learning', 'Medicine', 'Economics', 'Personal Development') — do NOT use a fixed list, infer freely\n"
        "4. Rates energy as HIGH (novel, urgent, actionable), MEDIUM (useful reference), or LOW (minor note)\n"
        "5. Tags: 3-6 specific keywords\n\n"
        "Respond ONLY with valid JSON (no markdown fences):\n"
        '{"title": "...", "content": "...", "tags": [...], "domain": "...", "energy": "HIGH|MEDIUM|LOW"}'
    )

    user_parts = [f"Raw thought:\n{thought_text}"]
    if web_context:
        user_parts.append(f"\nFetched web content:\n{web_context}")
    user_content = "\n\n".join(user_parts)

    response = openai_client.chat.completions.create(
        model="deepseek/deepseek-v3.2",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ],
        temperature=0.7,
        max_tokens=800
    )
    raw = response.choices[0].message.content or ""

    # Strip markdown code fences if model wraps anyway
    cleaned = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*```$', '', cleaned.strip())

    try:
        data = json.loads(cleaned)
        # Ensure required fields exist
        if not data.get("title") or data["title"].lower() in ("insight", "note", "untitled"):
            first_sentence = thought_text.split('.')[0].strip()
            data["title"] = first_sentence[:60] or thought_text[:60]
        data.setdefault("domain", "General")
        data.setdefault("energy", "MEDIUM")
        data.setdefault("tags", [])
        return data
    except Exception:
        # Fallback: derive title from first sentence, preserve raw output as content
        first_sentence = thought_text.split('.')[0].strip()
        fallback_title = first_sentence[:60] or thought_text[:60]
        return {
            "title": fallback_title,
            "content": raw if raw else thought_text,
            "tags": [],
            "domain": "General",
            "energy": "MEDIUM"
        }

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
