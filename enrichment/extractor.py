#!/usr/bin/env python3
"""
extractor.py — KERNEL-style entity extraction and tagging via LLM.

Uses OpenRouter to call a cost-effective model for structured extraction.
KERNEL format: XML-delimited prompts with deterministic JSON output.

Output schema:
{
  "summary": "string (2 sentences max)",
  "tags": ["string", "string", "string"],  // exactly 3 primary tags
  "entities": [
    {"name": "string", "type": "person|project|concept|org|tool|location", "confidence": 0.0-1.0}
  ],
  "domain": "agentic-ai|career|enterprise|systems|learning|creativity",
  "energy": "Spark|Hot|Flow|Cool"
}
"""

import json
import os
import sys
import urllib.request
import urllib.error

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE = "https://openrouter.ai/api/v1"
EXTRACT_MODEL = "openai/gpt-4o-mini"  # cost-effective for structured tasks

KERNEL_PROMPT_TEMPLATE = (
    "<SystemRole>You are an expert ontological architect and knowledge synthesizer for Freddy's Idea Garden.</SystemRole>\n"
    "\n"
    "<ExecutionTask>\n"
    "Analyze the user input. Extract entities, summarize the core concept in exactly two sentences,\n"
    "classify the domain and energy level, and identify three primary categorical tags.\n"
    "</ExecutionTask>\n"
    "\n"
    "<RigidConstraints>\n"
    "- Output must be valid JSON only. No markdown, no code fences, no explanation.\n"
    "- Summary: exactly 2 sentences, concrete and specific.\n"
    "- Tags: exactly 3 lowercase-kebab-case tags (e.g. agentic-ai, rag-pipeline).\n"
    "- Entities: extract 2-6 named entities. Types: person, project, concept, org, tool, location.\n"
    "- Domain: one of: agentic-ai, career, enterprise, systems, learning, creativity.\n"
    "- Energy: one of: Spark (new idea), Hot (exciting/urgent), Flow (in-progress), Cool (background/reflection).\n"
    "</RigidConstraints>\n"
    "\n"
    "<RetrievedHistoricalContext>\n"
    "{context}\n"
    "</RetrievedHistoricalContext>\n"
    "\n"
    "<UserInput>\n"
    "{input_text}\n"
    "</UserInput>"
)


def extract(text: str, context: str = "", model: str = EXTRACT_MODEL) -> dict:
    """
    Run KERNEL-style extraction on a text chunk.
    
    Returns dict with: summary, tags, entities, domain, energy
    Falls back to defaults on failure.
    """
    if not OPENROUTER_API_KEY:
        print("  ⚠ No OPENROUTER_API_KEY, using fallback extraction", file=sys.stderr)
        return _fallback_extract(text)

    prompt = KERNEL_PROMPT_TEMPLATE.format(
        context=context[:1000] if context else "(no prior context)",
        input_text=text[:2000]
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.0,  # deterministic for structured tasks
        "max_tokens": 500,
        "response_format": {"type": "json_object"}
    }

    try:
        req = urllib.request.Request(
            f"{OPENROUTER_BASE}/chat/completions",
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json"
            }
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.loads(r.read())

        raw = res["choices"][0]["message"]["content"].strip()

        # Strip markdown fences if model included them anyway
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)

        # Validate schema
        return {
            "summary": result.get("summary", "")[:300],
            "tags": result.get("tags", [])[:3],
            "entities": result.get("entities", [])[:6],
            "domain": result.get("domain", "agentic-ai"),
            "energy": result.get("energy", "Spark")
        }

    except Exception as e:
        print(f"  ⚠ Extraction failed: {e}, using fallback", file=sys.stderr)
        return _fallback_extract(text)


def _fallback_extract(text: str) -> dict:
    """Deterministic fallback extraction when LLM is unavailable."""
    words = text.lower().split()

    # Simple tag inference from keywords
    tag_keywords = {
        "agentic-ai": ["agent", "agentic", "llm", "gpt", "claude", "prompt"],
        "rag": ["rag", "retrieval", "embedding", "vector", "weaviate"],
        "enterprise": ["enterprise", "sap", "deployment", "customer", "business"],
        "career": ["career", "fde", "academy", "role", "position"],
        "systems": ["system", "architecture", "pipeline", "infrastructure"],
        "learning": ["learn", "study", "course", "boot.dev", "python"],
        "creativity": ["creative", "idea", "brainstorm", "spark"],
    }

    scores = {}
    for tag, keywords in tag_keywords.items():
        scores[tag] = sum(1 for k in keywords if k in text.lower())

    top_tags = sorted(scores, key=scores.get, reverse=True)[:3]
    if not top_tags or scores[top_tags[0]] == 0:
        top_tags = ["general", "idea", "seed"]

    return {
        "summary": text[:200].split(".")[0] + ".",
        "tags": top_tags,
        "entities": [],
        "domain": top_tags[0] if top_tags[0] not in ("rag",) else "agentic-ai",
        "energy": "Spark"
    }


def batch_extract(texts: list[str], contexts: list[str] = None) -> list[dict]:
    """
    Extract from multiple texts. Processes serially to respect rate limits.
    contexts: optional parallel list of context strings for each text.
    """
    if contexts is None:
        contexts = [""] * len(texts)

    results = []
    for i, (text, ctx) in enumerate(zip(texts, contexts)):
        print(f"  Extracting [{i+1}/{len(texts)}]...", file=sys.stderr)
        result = extract(text, context=ctx)
        results.append(result)

    return results


# ── Quick test ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    test = """Knowledge graphs improve LLM accuracy by 3-5x and cut token costs by up to 97%. 
    For Freddy's FDE career at enterprise software, mastering knowledge graphs can accelerate the development 
    of reliable agentic systems in enterprise environments. The system combines vector search 
    with graph traversal using Weaviate."""
    
    result = extract(test)
    print(json.dumps(result, indent=2, ensure_ascii=False))
