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

_GENERIC_TITLES = {"insight", "note", "untitled", "idea", "thought", "observation", "summary"}
_VALID_ENERGIES = {"HIGH", "MEDIUM", "LOW"}

def _strip_fences(raw: str) -> str:
    """Remove markdown code fences from LLM output."""
    cleaned = re.sub(r'^```(?:json)?\s*', '', raw.strip(), flags=re.IGNORECASE)
    return re.sub(r'\s*```$', '', cleaned.strip())

def _validate_seed_data(data: dict, thought_text: str) -> tuple[bool, list[str]]:
    """
    Validate seed data structure. Returns (is_valid, list_of_errors).
    Mechanical checks only — no LLM calls.
    """
    errors = []
    if not isinstance(data, dict):
        return False, ["Response is not a JSON object"]

    # Title
    title = data.get("title", "")
    if not title or not isinstance(title, str) or len(title.strip()) < 5:
        errors.append("title is missing or too short")
    elif title.strip().lower() in _GENERIC_TITLES:
        errors.append(f"title is generic: '{title}'")

    # Content
    content = data.get("content", "")
    if not content or not isinstance(content, str) or len(content.strip()) < 30:
        errors.append("content is missing or too short")

    # Tags — must be a list of strings
    tags = data.get("tags", [])
    if not isinstance(tags, list):
        errors.append("tags must be a list")
    elif not all(isinstance(t, str) for t in tags):
        errors.append("tags must be a list of strings")

    # Energy — must be one of the valid values
    energy = data.get("energy", "")
    if energy not in _VALID_ENERGIES:
        errors.append(f"energy '{energy}' is not one of HIGH/MEDIUM/LOW")

    # Domain — must be a non-empty string
    domain = data.get("domain", "")
    if not domain or not isinstance(domain, str):
        errors.append("domain is missing")

    return len(errors) == 0, errors

def _apply_fallbacks(data: dict, thought_text: str) -> dict:
    """Apply safe fallbacks for any invalid fields. Never raises."""
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
    """Load seed enrichment prompt from file, with inline fallback."""
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
    """Single LLM call for seed generation. strict=True adds extra output format pressure.
    Uses Nemotron Super — clean JSON output, no thinking tokens."""
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
            model="nvidia/llama-3.1-nemotron-ultra-253b-v1",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "\n\n".join(user_parts)}
            ],
            temperature=0.3 if strict else 0.7,
            max_tokens=800
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        logger.error(f"[enricher] LLM call failed: {e}")
        return ""

def generate_seed(thought_text: str, web_context: Optional[str] = None) -> dict:
    """
    Synthesize a structured seed from raw thought + optional web content.

    Returns: {title, content, tags, domain, energy}
      - domain: LLM-inferred field (e.g. "AI", "Medicine", "Finance") — no hardcoded list
      - energy: "HIGH" | "MEDIUM" | "LOW" based on novelty/urgency signals

    Validates output deterministically. Retries once with stricter prompt if invalid.
    Falls back to safe defaults rather than storing malformed data.
    """
    # Attempt 1 — normal temperature
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

    # Attempt 2 — strict mode: lower temperature, extra format pressure
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

    # Hard fallback — always valid, never raises
    first_sentence = thought_text.split('.')[0].strip()
    return {
        "title": first_sentence[:60] or thought_text[:60],
        "content": thought_text,
        "tags": [],
        "domain": "General",
        "energy": "MEDIUM",
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
