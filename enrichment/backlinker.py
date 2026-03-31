#!/usr/bin/env python3
"""
backlinker.py — Autonomous backlinking via vector search + LLM relevance.

Flow:
  1. For a seed, find top-k similar seeds via Weaviate vector search
  2. LLM evaluates which connections are contextually relevant (not just similar)
  3. Returns filtered backlinks with relevance scores and reasons

All data stays in Weaviate — backlinks stored as JSON property on each seed.
"""

import json
import os
import sys
import urllib.request
import urllib.error

WEAVIATE_URL = os.environ.get("WEAVIATE_URL", "http://localhost:8080")
WEAVIATE_CLASS = "IdeaSeed"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE = "https://openrouter.ai/api/v1"
RELEVANCE_MODEL = "openai/gpt-4o-mini"

# How many candidates to pull from vector search
CANDIDATE_LIMIT = 8
# Max backlinks to store per seed
MAX_BACKLINKS = 5
# Minimum relevance score to keep a link
MIN_RELEVANCE = 0.6


def weaviate_graphql(query: str, variables: dict = None) -> dict:
    """Execute a GraphQL query against Weaviate."""
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    req = urllib.request.Request(
        f"{WEAVIATE_URL}/v1/graphql",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def weaviate_request(method: str, path: str, data=None) -> dict:
    url = f"{WEAVIATE_URL}/v1{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method,
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        if r.length == 0 or r.length is None:
            return {}
        return json.loads(r.read())


def find_candidates(notion_id: str, text: str, top_k: int = CANDIDATE_LIMIT) -> list[dict]:
    """
    Find similar seeds via BM25 search, excluding the seed itself.
    Returns list of {notion_id, title, summary, distance}.
    """
    gql = """
    {
      Get {
        IdeaSeed(
          bm25: { query: "%s" }
          limit: %d
        ) {
          notion_id
          title
          text
          summary
          tags
          domain
          source
          chunk_idx
          _additional { score }
        }
      }
    }
    """ % (text[:500].replace('"', '\\"'), top_k + 5)  # fetch extra to account for self-exclusion

    try:
        result = weaviate_graphql(gql)
        hits = result.get("data", {}).get("Get", {}).get("IdeaSeed") or []

        # Deduplicate by notion_id (keep best chunk per seed) and exclude self
        seen = {}
        for hit in hits:
            nid = hit.get("notion_id", "")
            if not nid or nid == notion_id:
                continue
            if nid not in seen:
                seen[nid] = {
                    "notion_id": nid,
                    "title": hit.get("title", ""),
                    "summary": hit.get("summary", "") or hit.get("text", "")[:200],
                    "domain": hit.get("domain", ""),
                    "tags": hit.get("tags", ""),
                    "source": hit.get("source", ""),
                    "score": float(hit.get("_additional", {}).get("score", 0))
                }

        return list(seen.values())[:top_k]

    except Exception as e:
        print(f"  ⚠ Candidate search failed: {e}", file=sys.stderr)
        return []


def evaluate_relevance(seed_title: str, seed_summary: str, candidates: list[dict]) -> list[dict]:
    """
    Use LLM to evaluate which candidates are genuinely relevant (not just similar words).
    Returns filtered list with relevance scores and reasons.
    """
    if not candidates:
        return []

    if not OPENROUTER_API_KEY:
        # Fallback: return top candidates by BM25 score
        return [
            {
                "notion_id": c["notion_id"],
                "score": min(c["score"], 1.0),
                "reason": "BM25 similarity (no LLM available)"
            }
            for c in candidates[:3]
            if c["score"] > 0.3
        ]

    candidates_text = ""
    for i, c in enumerate(candidates, 1):
        candidates_text += f"\n{i}. [{c['notion_id'][:8]}] {c['title']}: {c['summary'][:150]}"

    prompt = f"""You are evaluating semantic connections between knowledge seeds.

SEED: {seed_title}
SUMMARY: {seed_summary[:300]}

CANDIDATES:{candidates_text}

For each candidate, rate relevance (0.0-1.0) based on:
- Conceptual overlap (not just keyword match)
- Whether one seed could inform or extend the other
- Whether they share a meaningful domain connection

Output JSON array only. Include only candidates with relevance >= {MIN_RELEVANCE}.
Max {MAX_BACKLINKS} links.

[
  {{"index": 1, "score": 0.85, "reason": "Both explore agentic patterns in enterprise SAP"}},
  ...
]"""

    try:
        payload = {
            "model": RELEVANCE_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.0,
            "max_tokens": 400,
            "response_format": {"type": "json_object"}
        }
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
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = json.loads(raw.strip())
        evaluations = result if isinstance(result, list) else result.get("links", result.get("backlinks", []))

        backlinks = []
        for eval_item in evaluations[:MAX_BACKLINKS]:
            idx = eval_item.get("index", 0) - 1
            if 0 <= idx < len(candidates):
                backlinks.append({
                    "notion_id": candidates[idx]["notion_id"],
                    "title": candidates[idx]["title"],
                    "score": round(eval_item.get("score", 0), 3),
                    "reason": eval_item.get("reason", "")
                })

        return [b for b in backlinks if b["score"] >= MIN_RELEVANCE]

    except Exception as e:
        print(f"  ⚠ Relevance evaluation failed: {e}", file=sys.stderr)
        # Fallback: top 3 by BM25
        return [
            {"notion_id": c["notion_id"], "title": c["title"],
             "score": round(min(c["score"], 1.0), 3), "reason": "BM25 fallback"}
            for c in sorted(candidates, key=lambda x: x["score"], reverse=True)[:3]
            if c["score"] > 0.3
        ]


def find_backlinks(notion_id: str, title: str, summary: str, text: str) -> list[dict]:
    """
    Main entry point: find and validate backlinks for a seed.
    Returns list of {notion_id, title, score, reason}.
    """
    query_text = f"{title} {summary or text[:300]}"
    candidates = find_candidates(notion_id, query_text)

    if not candidates:
        return []

    backlinks = evaluate_relevance(title, summary or text[:200], candidates)
    print(f"  Found {len(backlinks)} relevant backlinks (from {len(candidates)} candidates)")
    return backlinks


def update_backlinks_in_weaviate(weaviate_id: str, backlinks: list[dict]):
    """Update the backlinks property on a Weaviate object."""
    try:
        weaviate_request("PATCH", f"/objects/{WEAVIATE_CLASS}/{weaviate_id}", {
            "properties": {
                "backlinks": json.dumps(backlinks)
            }
        })
    except Exception as e:
        print(f"  ⚠ Failed to update backlinks: {e}", file=sys.stderr)


# ── Quick test ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    result = find_backlinks(
        notion_id="test-123",
        title="Knowledge Graphs for Agentic AI",
        summary="Knowledge graphs improve LLM accuracy and enable multi-hop reasoning in enterprise systems.",
        text="Knowledge graphs improve LLM accuracy by 3-5x..."
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
