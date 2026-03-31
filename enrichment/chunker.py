#!/usr/bin/env python3
"""
chunker.py — Paragraph-aware semantic chunking for enrichment.

Unlike fixed-size chunking (800 chars), this module:
  1. Splits on paragraph boundaries (double newlines, headings)
  2. Respects semantic units (lists, code blocks, callouts)
  3. Merges small paragraphs into coherent chunks
  4. Preserves section context in chunk metadata
  5. Target: 500-1200 chars per chunk (flexible, not hard cutoff)
"""

import re
from dataclasses import dataclass, field


@dataclass
class Chunk:
    """A semantic chunk with metadata."""
    text: str
    index: int = 0
    section: str = ""  # parent section heading
    char_count: int = 0
    is_heading: bool = False

    def __post_init__(self):
        self.char_count = len(self.text)


# Minimum chunk size — smaller chunks get merged
MIN_CHUNK_SIZE = 300
# Target range
TARGET_MIN = 500
TARGET_MAX = 1200
# Hard max — split even mid-paragraph if exceeded
HARD_MAX = 2000


def split_sections(text: str) -> list[tuple[str, str]]:
    """
    Split text into (heading, body) sections.
    Returns list of (section_name, section_text) tuples.
    """
    # Match markdown headings (## or ### or ####)
    heading_pattern = re.compile(r'^(#{1,4})\s+(.+)$', re.MULTILINE)

    sections = []
    last_end = 0
    current_heading = ""

    for match in heading_pattern.finditer(text):
        # Text before this heading belongs to previous section
        body = text[last_end:match.start()].strip()
        if body:
            sections.append((current_heading, body))
        current_heading = match.group(2).strip()
        last_end = match.end()

    # Last section
    body = text[last_end:].strip()
    if body:
        sections.append((current_heading, body))

    # If no headings found, treat entire text as one section
    if not sections:
        sections.append(("", text))

    return sections


def split_paragraphs(text: str) -> list[str]:
    """
    Split text into paragraphs.
    Handles: double newlines, list items, code blocks.
    """
    # Preserve code blocks as single units
    code_blocks = {}
    def save_code(match):
        key = f"__CODE_BLOCK_{len(code_blocks)}__"
        code_blocks[key] = match.group(0)
        return key

    text_no_code = re.sub(r'```[\s\S]*?```', save_code, text)

    # Split on double newlines or list item boundaries
    raw_paragraphs = re.split(r'\n{2,}', text_no_code)

    # Also split list items if they're long
    expanded = []
    for para in raw_paragraphs:
        para = para.strip()
        if not para:
            continue
        # Restore code blocks
        for key, block in code_blocks.items():
            para = para.replace(key, block)
        expanded.append(para)

    return expanded


def merge_small_chunks(chunks: list[str], min_size: int = MIN_CHUNK_SIZE) -> list[str]:
    """
    Merge adjacent small chunks into larger coherent ones.
    """
    if not chunks:
        return chunks

    merged = []
    buffer = chunks[0]

    for chunk in chunks[1:]:
        combined = f"{buffer}\n\n{chunk}"
        if len(combined) <= TARGET_MAX and len(buffer) < min_size:
            buffer = combined
        else:
            merged.append(buffer)
            buffer = chunk

    merged.append(buffer)
    return merged


def split_long_chunk(text: str, max_size: int = HARD_MAX) -> list[str]:
    """Split an oversized chunk at sentence boundaries."""
    if len(text) <= max_size:
        return [text]

    sentences = re.split(r'(?<=[.!?])\s+', text)
    parts = []
    current = ""

    for sentence in sentences:
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) > max_size and current:
            parts.append(current.strip())
            current = sentence
        else:
            current = candidate

    if current.strip():
        parts.append(current.strip())

    return parts if parts else [text]


def chunk_text(text: str, source_title: str = "") -> list[Chunk]:
    """
    Main entry point: paragraph-aware semantic chunking.

    Returns list of Chunk objects with metadata.
    """
    if not text or not text.strip():
        return [Chunk(text="(empty)", index=0)]

    # Step 1: Split into sections
    sections = split_sections(text)

    # Step 2: Split each section into paragraphs
    raw_chunks = []
    for heading, body in sections:
        paragraphs = split_paragraphs(body)
        for para in paragraphs:
            raw_chunks.append((heading, para))

    # Step 3: Merge small paragraphs
    texts = [p for _, p in raw_chunks]
    headings = [h for h, _ in raw_chunks]
    merged_texts = merge_small_chunks(texts)

    # Re-align headings after merge (use first heading of each merged group)
    # Simplified: just use the heading from the first paragraph in each merged chunk
    aligned_headings = []
    merge_idx = 0
    for i, merged in enumerate(merged_texts):
        # Find which original paragraphs went into this merged chunk
        remaining = len(merged)
        group_headings = []
        while remaining > 0 and merge_idx < len(raw_chunks):
            group_headings.append(headings[merge_idx])
            remaining -= len(raw_chunks[merge_idx][1])
            merge_idx += 1
        # Use first non-empty heading
        heading = next((h for h in group_headings if h), "")
        aligned_headings.append(heading)

    # Step 4: Split any chunks that are still too long
    final_texts = []
    final_headings = []
    for text, heading in zip(merged_texts, aligned_headings):
        parts = split_long_chunk(text)
        final_texts.extend(parts)
        final_headings.extend([heading] * len(parts))

    # Step 5: Build Chunk objects
    chunks = []
    for i, (text, heading) in enumerate(zip(final_texts, final_headings)):
        chunks.append(Chunk(
            text=text.strip(),
            index=i,
            section=heading,
        ))

    return chunks if chunks else [Chunk(text=text[:HARD_MAX], index=0)]


def format_chunks_for_embedding(chunks: list[Chunk]) -> list[str]:
    """
    Format chunks for embedding, prepending section context.
    Returns list of strings ready for vectorization.
    """
    formatted = []
    for chunk in chunks:
        if chunk.section:
            formatted.append(f"[{chunk.section}]\n{chunk.text}")
        else:
            formatted.append(chunk.text)
    return formatted


# ── Quick test ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    test_text = """# Knowledge Graphs for Agentic AI

Knowledge graphs improve LLM accuracy by 3-5x and cut token costs by up to 97%.

## How It Works

The system combines vector search with graph traversal. When a user queries,
we first do a semantic search, then expand context via graph hops.

- Entity extraction identifies people, projects, concepts
- Relations are stored as edges
- Multi-hop traversal finds indirect connections

## Why It Matters

For Freddy's FDE career, mastering knowledge graphs can accelerate development
of reliable agentic systems in enterprise software environments.

## Next Steps

1. Define the entity schema
2. Build the extraction pipeline
3. Test with existing Garden seeds
"""

    chunks = chunk_text(test_text, "Knowledge Graphs")
    print(f"Generated {len(chunks)} chunks:\n")
    for c in chunks:
        print(f"--- Chunk {c.index} (section: '{c.section}', {c.char_count} chars) ---")
        print(c.text[:150])
        print()
