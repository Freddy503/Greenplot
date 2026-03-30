"""
entity_extractor.py
LLM-based entity extraction from text.

Uses Nemotron Super (free via OpenRouter) to extract:
- Named entities (people, projects, concepts, tools, orgs, sources)
- Topic tags
- One-line summary
"""

import json
import httpx
from typing import Optional
from app.config import settings
import openai


openai_client = openai.OpenAI(
    api_key=settings.OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1"
)

EXTRACTION_PROMPT = """You are an entity extractor for a personal knowledge base. Given a text, extract structured metadata.

Return valid JSON only — no markdown, no explanation.

Schema:
{
  "entities": [
    {"name": "string", "type": "person|project|concept|tool|org|source", "confidence": 0.0-1.0}
  ],
  "topics": ["string"],
  "summary": "One concise sentence capturing the core idea"
}

Rules:
- Entities: extract specific named things (proper nouns, technical terms, named concepts)
- Topics: broader categories/areas (2-4 words max per topic)
- Confidence: how sure you are this is a meaningful entity (not generic words)
- Skip generic words like "idea", "thought", "system" unless they're part of a named concept
- Summary: one sentence, no period at end if you prefer, capture the essence
- Max 10 entities, max 5 topics
- Prefer fewer, high-confidence entities over many low-confidence ones"""


def extract_entities(text: str) -> dict:
    """
    Extract entities, topics, and summary from text.

    Returns:
    {
        "entities": [{"name": str, "type": str, "confidence": float}],
        "topics": [str],
        "summary": str
    }
    """
    if not text or len(text.strip()) < 20:
        return {"entities": [], "topics": [], "summary": ""}

    try:
        response = openai_client.chat.completions.create(
            model="openrouter/nvidia/nemotron-3-super-120b-a12b:free",
            messages=[
                {"role": "system", "content": EXTRACTION_PROMPT},
                {"role": "user", "content": text[:3000]}  # Cap input to avoid token waste
            ],
            temperature=0.3,  # Low temp for consistent extraction
            max_tokens=400
        )

        raw = response.choices[0].message.content.strip()

        # Try to parse JSON (handle markdown code blocks)
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)

        # Validate structure
        entities = data.get("entities", [])
        topics = data.get("topics", [])
        summary = data.get("summary", "")

        # Sanitize entities
        clean_entities = []
        for e in entities:
            if isinstance(e, dict) and "name" in e and "type" in e:
                clean_entities.append({
                    "name": str(e["name"])[:100],  # Cap name length
                    "type": str(e.get("type", "concept"))[:20],
                    "confidence": float(e.get("confidence", 0.5))
                })

        return {
            "entities": clean_entities[:10],
            "topics": [str(t)[:50] for t in topics][:5],
            "summary": str(summary)[:300]
        }

    except json.JSONDecodeError:
        # Model didn't return valid JSON
        return {"entities": [], "topics": [], "summary": ""}
    except Exception as e:
        # Any other error — return empty, don't block enrichment
        print(f"Entity extraction error: {e}")
        return {"entities": [], "topics": [], "summary": ""}


def classify_entities(entities: list[dict]) -> dict[str, list[str]]:
    """Group entities by type."""
    grouped = {}
    for e in entities:
        t = e.get("type", "concept")
        if t not in grouped:
            grouped[t] = []
        grouped[t].append(e["name"])
    return grouped
