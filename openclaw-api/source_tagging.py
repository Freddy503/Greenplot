#!/usr/bin/env python3
"""
source_tagging.py
Fetch content from source_growth seeds, extract topics/entities via LLM,
and update seed metadata in PostgreSQL + Weaviate.

Usage:
  python3 source_tagging.py --tenant-id 87959b2e-...
  python3 source_tagging.py  # auto-detect from env
"""

import os, sys, json, argparse, urllib.request
from urllib.parse import urlparse

# ── Config ──────────────────────────────────────────────────────────────────
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
WEAVIATE_URL = os.environ.get("WEAVIATE_URL", "http://localhost:8080")
import psycopg2

DB_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/openclaw")


def fetch_page_content(url: str) -> dict:
    """Fetch page and extract title, summary, keywords, raw text."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "GreenPlot Bot/1.0",
            "Accept": "text/html,application/xhtml+xml"
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                return {}
            html = resp.read().decode("utf-8", errors="replace")

        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")

        # Title
        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        if not title:
            og = soup.find("meta", property="og:title")
            if og:
                title = og.get("content", "")

        # Description
        summary = ""
        desc = soup.find("meta", attrs={"name": "description"})
        if desc:
            summary = desc.get("content", "")
        if not summary:
            og = soup.find("meta", property="og:description")
            if og:
                summary = og.get("content", "")

        # Keywords
        kw = soup.find("meta", attrs={"name": "keywords"})
        tags = []
        if kw:
            tags = [t.strip() for t in kw.get("content", "").split(",") if t.strip()][:5]

        # Raw text
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        raw_text = soup.get_text(separator=" ", strip=True)[:3000]

        return {
            "title": title,
            "summary": summary,
            "tags": tags,
            "raw_text": raw_text,
        }
    except Exception as e:
        print(f"  ⚠️ Fetch failed: {e}")
        return {}


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
- Max 10 entities, max 5 topics
- Summary: one sentence, capture the essence"""


def extract_topics(text: str) -> dict:
    """Use Nemotron Super (free) via OpenRouter to extract entities/topics."""
    if not text or len(text.strip()) < 20:
        return {"entities": [], "topics": [], "summary": ""}

    try:
        payload = {
            "model": "nvidia/nemotron-3-super-120b-a12b:free",
            "messages": [
                {"role": "system", "content": EXTRACTION_PROMPT},
                {"role": "user", "content": text[:3000]}
            ],
            "temperature": 0.3,
            "max_tokens": 800
        }
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json"
            }
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())

        raw = resp["choices"][0]["message"]["content"].strip()

        # Parse JSON (handle markdown code blocks)
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        # Fix truncated JSON
        if raw.startswith("{") and not raw.endswith("}"):
            last_complete = raw.rfind("},")
            if last_complete > 0:
                raw = raw[:last_complete + 1]
            open_brackets = raw.count("[") - raw.count("]")
            open_braces = raw.count("{") - raw.count("}")
            raw += "]" * open_brackets + "}" * open_braces

        data = json.loads(raw)

        return {
            "entities": data.get("entities", [])[:10],
            "topics": [str(t)[:50] for t in data.get("topics", [])][:5],
            "summary": str(data.get("summary", ""))[:300]
        }
    except Exception as e:
        print(f"  ⚠️ Extraction failed: {e}")
        return {"entities": [], "topics": [], "summary": ""}


def embed_text(text: str) -> list:
    """Embed text via OpenRouter."""
    payload = {"input": text, "model": "openai/text-embedding-ada-002", "truncate": "END"}
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/embeddings",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
    return res["data"][0]["embedding"]


def update_weaviate_metadata(notion_id: str, metadata: dict):
    """Update Weaviate object metadata for all chunks with this notion_id."""
    # Query for objects
    gql = """
    {
      Get {
        IdeaSeed(
          where: { operator: Equal, path: ["notion_id"], valueText: "%s" }
          limit: 10
        ) { _additional { id } }
      }
    }
    """ % notion_id
    try:
        req = urllib.request.Request(
            f"{WEAVIATE_URL}/v1/graphql",
            data=json.dumps({"query": gql}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            res = json.loads(r.read())

        objects = res.get("data", {}).get("Get", {}).get("IdeaSeed", [])
        for obj in objects:
            obj_id = obj.get("_additional", {}).get("id")
            if obj_id:
                patch_req = urllib.request.Request(
                    f"{WEAVIATE_URL}/v1/objects/IdeaSeed/{obj_id}",
                    data=json.dumps({"properties": metadata}).encode(),
                    headers={"Content-Type": "application/json"},
                    method="PATCH"
                )
                urllib.request.urlopen(patch_req, timeout=10)
    except Exception as e:
        print(f"  ⚠️ Weaviate update failed: {e}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant-id", default="87959b2e-5443-4c50-9336-2da01af82c14")
    args = parser.parse_args()

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Get source_growth seeds
    cur.execute("""
        SELECT id, title, content, seed_metadata FROM seeds
        WHERE tenant_id = %s
        AND seed_metadata->>'source' = 'source_growth'
    """, (args.tenant_id,))
    seeds = cur.fetchall()

    if not seeds:
        print("No source_growth seeds found.")
        sys.exit(0)

    print(f"Found {len(seeds)} source_growth seeds to tag.\n")

    tagged = 0
    for seed_id, title, content, metadata in seeds:
        url = content.strip()
        if not url.startswith("http"):
            print(f"⏭️ {title} — not a URL, skipping")
            continue

        print(f"🔍 {title}")
        print(f"   URL: {url[:80]}...")

        # 1. Fetch page content
        page = fetch_page_content(url)
        raw_text = page.get("raw_text", "")
        page_summary = page.get("summary", "")

        if not raw_text:
            print(f"   ⚠️ No content fetched, using title only")
            raw_text = f"{title}\n{url}"

        # 2. Extract topics via LLM
        extraction = extract_topics(raw_text)
        topics = extraction.get("topics", [])
        entities = extraction.get("entities", [])
        llm_summary = extraction.get("summary", "")

        summary = llm_summary or page_summary
        domain = urlparse(url).netloc.replace("www.", "")

        print(f"   📋 Topics: {topics}")
        print(f"   🏷️ Entities: {[e['name'] for e in entities[:5]]}")
        print(f"   📝 Summary: {summary[:100]}...")

        # 3. Update PostgreSQL metadata
        meta = metadata or {}
        meta["source"] = "source_growth"
        meta["topics"] = topics
        meta["entities"] = entities
        meta["summary"] = summary
        meta["domain"] = domain
        meta["page_tags"] = page.get("tags", [])
        meta["tagged"] = True

        cur.execute(
            "UPDATE seeds SET seed_metadata = %s WHERE id = %s",
            (json.dumps(meta), seed_id)
        )

        # 4. Update Weaviate metadata
        weaviate_id = f"hub-{title.lower().replace(' ','-')[:40]}"
        wv_meta = {
            "tags": ", ".join(topics),
            "summary": summary,
            "entities": ", ".join(e["name"] for e in entities[:5]),
            "domain": domain,
            "enrichment_version": 1,
            "source": "source_growth",
        }
        update_weaviate_metadata(weaviate_id, wv_meta)

        tagged += 1
        print(f"   ✅ Tagged\n")

    conn.commit()
    cur.close()
    conn.close()

    print(f"Done! Tagged {tagged}/{len(seeds)} source seeds.")


if __name__ == "__main__":
    main()
