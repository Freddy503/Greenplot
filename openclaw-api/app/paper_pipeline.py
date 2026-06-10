"""
Research paper parsing pipeline: fetch → parse → chunk → index.

Spec: docs/specs/paper-parsing-pipeline.md

Paper seeds only carry the abstract/digest description. This module pulls the
full text (arXiv HTML preferred, PDF fallback, Exa for publisher pages),
splits it into section-aware ~800-token chunks, embeds them, and stores them
in the Weaviate PaperChunk class so retrieval can quote actual methods and
results — not just abstracts.

Runs on the enrichment worker (task type 'paper_parse'); inline fallback when
Redis is unavailable.
"""

import logging
import re
from datetime import datetime
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Seed
from app.weaviate_client import weaviate_client

logger = logging.getLogger(__name__)

# ~800 tokens ≈ 3200 chars; 100-token ≈ 400-char overlap; cap per spec
CHUNK_CHARS = 3200
CHUNK_OVERLAP = 400
MAX_CHUNKS = 60

SECTION_STOP = {"references", "bibliography", "acknowledgments", "acknowledgements", "appendix"}


# ── Fetch ─────────────────────────────────────────────────────────────────────

def _arxiv_id_from_url(url: str) -> str:
    m = re.search(r"arxiv\.org/(?:abs|pdf|html)/(\d{4}\.\d{4,5})", url or "")
    return m.group(1) if m else ""


def fetch_paper(source_url: str, pdf_url: str = "") -> tuple[str, str]:
    """Fetch paper content. Returns (kind, payload) where kind is 'html' | 'pdf' | 'text'.

    Preference order: arXiv HTML (cleanest structure) → PDF bytes → Exa text.
    """
    arxiv_id = _arxiv_id_from_url(source_url) or _arxiv_id_from_url(pdf_url)
    headers = {"User-Agent": "Greenplot/1.0 (research paper indexing; contact: contact@example.com)"}

    with httpx.Client(timeout=45, follow_redirects=True, headers=headers) as client:
        if arxiv_id:
            # 1. arXiv HTML (available for most recent papers)
            try:
                resp = client.get(f"https://arxiv.org/html/{arxiv_id}")
                if resp.status_code == 200 and len(resp.text) > 5000:
                    return "html", resp.text
            except Exception as e:
                logger.info(f"[paper_pipeline] arXiv HTML unavailable for {arxiv_id}: {e}")
            # 2. arXiv PDF
            try:
                resp = client.get(f"https://arxiv.org/pdf/{arxiv_id}")
                if resp.status_code == 200 and resp.content[:4] == b"%PDF":
                    return "pdf", resp.content
            except Exception as e:
                logger.warning(f"[paper_pipeline] arXiv PDF fetch failed for {arxiv_id}: {e}")

        # 3. Direct pdf_url if provided (non-arXiv)
        if pdf_url:
            try:
                resp = client.get(pdf_url)
                if resp.status_code == 200 and resp.content[:4] == b"%PDF":
                    return "pdf", resp.content
            except Exception:
                pass

        # 4. Exa contents for publisher pages
        if settings.EXA_API_KEY and source_url:
            try:
                resp = client.post(
                    "https://api.exa.ai/contents",
                    headers={"x-api-key": settings.EXA_API_KEY, "Content-Type": "application/json"},
                    json={"urls": [source_url], "text": {"maxCharacters": 60000}},
                )
                results = resp.json().get("results", []) if resp.status_code == 200 else []
                if results and results[0].get("text"):
                    return "text", results[0]["text"]
            except Exception as e:
                logger.warning(f"[paper_pipeline] Exa fallback failed for {source_url}: {e}")

    raise RuntimeError(f"Could not fetch paper content from {source_url or pdf_url}")


# ── Parse ─────────────────────────────────────────────────────────────────────

def parse_html(html: str) -> list[dict]:
    """arXiv HTML → ordered [{section, text}]. Uses heading tags for structure."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "figure", "math"]):
        tag.decompose()

    article = soup.find("article") or soup.body or soup
    sections: list[dict] = []
    current = {"section": "Abstract", "text": ""}
    for el in article.find_all(["h1", "h2", "h3", "p", "li"]):
        if el.name in ("h1", "h2", "h3"):
            heading = el.get_text(" ", strip=True)
            if not heading:
                continue
            if current["text"].strip():
                sections.append(current)
            current = {"section": heading[:120], "text": ""}
        else:
            txt = el.get_text(" ", strip=True)
            if txt:
                current["text"] += txt + "\n"
    if current["text"].strip():
        sections.append(current)
    return _drop_tail_sections(sections)


def parse_pdf(pdf_bytes: bytes) -> list[dict]:
    """PDF → ordered [{section, text}]. Heading detection via font-size heuristic."""
    import fitz  # pymupdf

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    sections: list[dict] = []
    current = {"section": "Abstract", "text": ""}

    # Median font size across the doc separates headings from body
    sizes: list[float] = []
    pages = [page.get_text("dict") for page in doc]
    for p in pages:
        for block in p.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if span.get("text", "").strip():
                        sizes.append(span.get("size", 10))
    body_size = sorted(sizes)[len(sizes) // 2] if sizes else 10

    for p in pages:
        for block in p.get("blocks", []):
            for line in block.get("lines", []):
                spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
                if not spans:
                    continue
                text = " ".join(s["text"].strip() for s in spans)
                max_size = max(s.get("size", 10) for s in spans)
                is_heading = (
                    max_size > body_size * 1.15
                    and len(text) < 100
                    and not text.endswith(".")
                )
                if is_heading:
                    if current["text"].strip():
                        sections.append(current)
                    current = {"section": re.sub(r"^[\dIVX.]+\s*", "", text)[:120] or text[:120], "text": ""}
                else:
                    current["text"] += text + " "
    if current["text"].strip():
        sections.append(current)
    doc.close()
    return _drop_tail_sections(sections)


def parse_text(text: str) -> list[dict]:
    """Plain text (Exa) → single-section fallback split on markdown-ish headings."""
    sections: list[dict] = []
    current = {"section": "Content", "text": ""}
    for line in text.split("\n"):
        stripped = line.strip()
        if re.match(r"^#{1,3}\s+\S", stripped) or (stripped.isupper() and 3 < len(stripped) < 80):
            if current["text"].strip():
                sections.append(current)
            current = {"section": stripped.lstrip("# ")[:120], "text": ""}
        else:
            current["text"] += stripped + "\n"
    if current["text"].strip():
        sections.append(current)
    return _drop_tail_sections(sections)


def _drop_tail_sections(sections: list[dict]) -> list[dict]:
    """Cut everything from References/Appendix onward — noise for retrieval."""
    out = []
    for s in sections:
        name = s["section"].lower().strip()
        if any(stop in name for stop in SECTION_STOP):
            break
        if len(s["text"].strip()) > 80:
            out.append({"section": s["section"], "text": s["text"].strip()})
    return out


# ── Chunk ─────────────────────────────────────────────────────────────────────

def chunk_sections(sections: list[dict]) -> list[dict]:
    """Section-aware splitter: ~CHUNK_CHARS chars with CHUNK_OVERLAP overlap."""
    chunks: list[dict] = []
    for sec in sections:
        text = sec["text"]
        start = 0
        while start < len(text) and len(chunks) < MAX_CHUNKS:
            end = min(start + CHUNK_CHARS, len(text))
            # Break on a sentence boundary when possible
            if end < len(text):
                dot = text.rfind(". ", start + CHUNK_CHARS // 2, end)
                if dot != -1:
                    end = dot + 1
            piece = text[start:end].strip()
            if len(piece) > 100:
                chunks.append({"section": sec["section"], "text": piece})
            if end >= len(text):
                break
            start = max(end - CHUNK_OVERLAP, start + 1)
    return chunks[:MAX_CHUNKS]


# ── Orchestrator ──────────────────────────────────────────────────────────────

def parse_paper_for_seed(seed_id: str, tenant_id: str, db: Session) -> dict:
    """Full pipeline for one paper seed. Updates seed metadata with parse status."""
    seed = db.query(Seed).filter(Seed.id == UUID(seed_id)).first()
    if not seed:
        return {"status": "error", "message": f"Seed {seed_id} not found"}

    meta = dict(seed.seed_metadata or {})
    source_url = meta.get("paper_url") or meta.get("source_url") or ""
    pdf_url = meta.get("pdf_url") or ""

    def _set_status(status: str, **extra):
        m = dict(seed.seed_metadata or {})
        m["parse_status"] = status
        m["parsed_at"] = datetime.utcnow().isoformat()
        m.update(extra)
        seed.seed_metadata = m
        db.commit()

    try:
        _set_status("parsing")
        kind, payload = fetch_paper(source_url, pdf_url)
        if kind == "html":
            sections = parse_html(payload)
        elif kind == "pdf":
            sections = parse_pdf(payload)
        else:
            sections = parse_text(payload)

        chunks = chunk_sections(sections)
        if not chunks:
            _set_status("failed", parse_error="no extractable content")
            return {"status": "error", "message": "No extractable content"}

        # Re-parse safety: clear previous chunks first
        weaviate_client.delete_paper_chunks(seed_id)

        from app.enricher_v2 import embed_text
        citation = meta.get("citation", "") or seed.title
        indexed = 0
        for i, chunk in enumerate(chunks):
            try:
                embedding = embed_text(f"{seed.title} — {chunk['section']}\n{chunk['text'][:1500]}")
                weaviate_client.add_paper_chunk(
                    tenant_id=tenant_id,
                    user_id=str(seed.user_id),
                    seed_id=seed_id,
                    paper_title=seed.title,
                    section=chunk["section"],
                    chunk_index=i,
                    text=chunk["text"],
                    citation=citation,
                    embedding=embedding,
                )
                indexed += 1
            except Exception as e:
                logger.warning(f"[paper_pipeline] chunk {i} index failed for {seed_id}: {e}")

        # Doc tree for reasoning-based retrieval (tree-retrieval.md); silent
        # degradation — the vector path remains when tree building fails
        doc_tree = None
        try:
            from app.tree_retrieval import build_doc_tree
            sec_counts: dict = {}
            for ch in chunks:
                sec_counts[ch["section"]] = sec_counts.get(ch["section"], 0) + 1
            tree_sections = []
            seen = set()
            for s in sections:
                name = s.get("section") or ""
                if name in seen:
                    continue
                seen.add(name)
                tree_sections.append({"section": name, "text": s.get("text", ""),
                                      "chunk_count": sec_counts.get(name, 1)})
            doc_tree = build_doc_tree(tree_sections)
        except Exception as e:
            logger.warning(f"[paper_pipeline] tree build failed for {seed_id}: {e}")

        extra = {"chunk_count": indexed, "parse_source": kind}
        if doc_tree:
            extra["doc_tree"] = doc_tree
            extra["tree_built_at"] = datetime.utcnow().isoformat()
        _set_status("parsed" if indexed else "failed", **extra)
        logger.info(f"[paper_pipeline] {seed.title[:50]}: {indexed} chunks indexed ({kind}), tree: {len(doc_tree) if doc_tree else 0} nodes")

        # Autopilot: digest papers that parsed successfully may earn a draft PRD
        # (relevance-gated + daily-capped inside auto_prd_for_paper).
        if indexed and seed.created_via == "academic_digest":
            try:
                from app.auto_prd import auto_prd_for_paper
                auto_result = auto_prd_for_paper(seed_id, tenant_id, db)
                logger.info(f"[auto_prd] {seed.title[:40]}: {auto_result.get('status')} ({auto_result.get('reason', auto_result.get('title', ''))})")
            except Exception as e:
                logger.warning(f"[auto_prd] failed for {seed_id}: {e}")

        return {"status": "ok", "seed_id": seed_id, "chunks": indexed, "source": kind}

    except Exception as e:
        logger.error(f"[paper_pipeline] parse failed for seed {seed_id}: {e}")
        try:
            _set_status("failed", parse_error=str(e)[:300])
        except Exception:
            db.rollback()
        return {"status": "error", "message": str(e)[:300]}


def enqueue_or_run_parse(seed_id: str, tenant_id: str, db: Session = None) -> str:
    """Queue the parse on the worker; if Redis is down and a db session is at
    hand, fall back to running inline so the feature degrades gracefully."""
    try:
        from app.task_broker import enqueue_paper_parse
        return enqueue_paper_parse(seed_id, tenant_id)
    except Exception as e:
        logger.warning(f"[paper_pipeline] queue unavailable ({e})" + (" — parsing inline" if db else ""))
        if db is not None:
            parse_paper_for_seed(seed_id, tenant_id, db)
        return ""
