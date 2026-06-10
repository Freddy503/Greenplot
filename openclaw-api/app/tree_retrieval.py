"""
Tree retrieval — reasoning-based paper navigation (PageIndex pattern).

Spec: docs/specs/tree-retrieval.md

Per-paper doc trees (section nodes + LLM summaries) let one small LLM call
answer "which sections?" — replacing similarity-as-relevance for in-document
retrieval. Vectors keep cross-corpus recall; this is stage 2 of the hybrid.
"""

import json
import logging

from app.config import settings
from app.weaviate_client import weaviate_client

logger = logging.getLogger(__name__)

MAX_TREE_NODES = 40
MIN_TREE_NODES = 3

TREE_SUMMARY_PROMPT = """You index research papers. For each section below, write a 1-2 sentence
summary of what it actually contains (findings, numbers, named methods — not vague topic labels).
Reply with ONLY valid JSON: {"summaries": ["<summary for section 1>", "<summary for section 2>", ...]}
in the same order as the input sections."""

NAVIGATE_PROMPT = """You navigate a research paper via its table of contents to answer a query.
Pick the 1-3 sections most likely to contain the answer — reason about relevance, not word overlap
(e.g. a query about 'evaluation methodology' usually needs the Results/Experiments section, not the
Abstract). Reply with ONLY valid JSON: {"node_ids": [<int>, ...]}"""


def build_doc_tree(sections: list[dict]) -> list[dict] | None:
    """One batched LLM call → [{id, title, summary, chunk_count}]. None if too flat."""
    from app.briefings import _call_llm

    sections = [s for s in sections if (s.get("text") or "").strip()][:MAX_TREE_NODES]
    if len(sections) < MIN_TREE_NODES:
        return None

    listing = "\n\n".join(
        f"[{i}] {s.get('section') or s.get('title') or f'Section {i}'}\n{(s.get('text') or '')[:300]}"
        for i, s in enumerate(sections)
    )
    raw = _call_llm(f"SECTIONS:\n\n{listing[:14000]}", system=TREE_SUMMARY_PROMPT,
                    max_tokens=2500, model=settings.CHAT_MODEL)
    summaries = []
    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        summaries = list(json.loads(cleaned).get("summaries", []))
    except Exception:
        pass

    tree = []
    for i, s in enumerate(sections):
        tree.append({
            "id": i,
            "title": (s.get("section") or s.get("title") or f"Section {i}")[:120],
            "summary": (summaries[i] if i < len(summaries) else "")[:300],
            "chunk_count": s.get("chunk_count", 1),
        })
    return tree


def navigate_tree(tree: list[dict], query: str) -> list[int]:
    """One small LLM call: which sections answer the query? Returns node ids."""
    from app.briefings import _call_llm

    toc = "\n".join(f"[{n['id']}] {n['title']} — {n['summary']}" for n in tree)
    raw = _call_llm(f"TABLE OF CONTENTS:\n{toc[:6000]}\n\nQUERY: {query}",
                    system=NAVIGATE_PROMPT, max_tokens=900, model=settings.CHAT_MODEL)
    try:
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        ids = [int(i) for i in json.loads(cleaned).get("node_ids", [])]
    except Exception:
        # Salvage any digits the model emitted
        ids = [int(t) for t in raw.replace(",", " ").split() if t.strip("[]").isdigit()][:3] if raw else []
    valid = {n["id"] for n in tree}
    return [i for i in ids if i in valid][:3] or ([0] if tree else [])


def fetch_sections(tenant_id: str, seed_id: str, node_titles: list[str]) -> list[dict]:
    """Reassemble full section text from stored chunks, in document order."""
    chunks = weaviate_client.get_paper_chunks(seed_id)
    wanted = {t.lower() for t in node_titles}
    out: dict[str, list] = {}
    for c in sorted(chunks, key=lambda x: x.get("chunk_index", 0)):
        sec = (c.get("section") or "").strip()
        if sec.lower() in wanted:
            out.setdefault(sec, []).append(c.get("text", ""))
    return [{"section": sec, "text": "\n".join(parts), "paper_title": chunks[0].get("paper_title", "") if chunks else ""}
            for sec, parts in out.items()]


def tree_from_chunks(seed_id: str) -> list[dict] | None:
    """Backfill path: rebuild sections from Weaviate chunks (no re-download)."""
    chunks = weaviate_client.get_paper_chunks(seed_id)
    if not chunks:
        return None
    by_section: dict[str, list] = {}
    order: list[str] = []
    for c in sorted(chunks, key=lambda x: x.get("chunk_index", 0)):
        sec = (c.get("section") or "Body").strip()
        if sec not in by_section:
            by_section[sec] = []
            order.append(sec)
        by_section[sec].append(c.get("text", ""))
    sections = [{"section": sec, "text": "\n".join(by_section[sec]), "chunk_count": len(by_section[sec])}
                for sec in order]
    return build_doc_tree(sections)
