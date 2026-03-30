"""
chunker.py
Recursive semantic text chunking for embeddings.

Split strategy:
1. Paragraph boundaries (\n\n)
2. Sentence boundaries (. ! ?)
3. Clause boundaries (, ; :)

Target: 400-600 tokens per chunk (~1600-2400 chars)
Overlap: 1 sentence between adjacent chunks
"""

import re
from typing import Optional


# Rough token estimation: ~4 chars per token for English
CHARS_PER_TOKEN = 4
MIN_CHUNK_TOKENS = 100
MAX_CHUNK_TOKENS = 600
TARGET_CHUNK_TOKENS = 500
OVERLAP_SENTENCES = 1

# Approximate character limits
MIN_CHUNK_CHARS = MIN_CHUNK_TOKENS * CHARS_PER_TOKEN  # 400
MAX_CHUNK_CHARS = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN  # 2400
TARGET_CHUNK_CHARS = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN  # 2000


def estimate_tokens(text: str) -> int:
    """Rough token count estimation."""
    return len(text) // CHARS_PER_TOKEN


def split_paragraphs(text: str) -> list[str]:
    """Split on double newlines (paragraph boundaries)."""
    parts = re.split(r'\n\s*\n', text.strip())
    return [p.strip() for p in parts if p.strip()]


def split_sentences(text: str) -> list[str]:
    """Split on sentence boundaries."""
    # Match sentence endings followed by space or end of string
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def split_clauses(text: str) -> list[str]:
    """Fallback: split on clause boundaries."""
    parts = re.split(r'(?<=[,;:])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def get_sentences(text: str) -> list[str]:
    """Extract all sentences from text for overlap extraction."""
    paragraphs = split_paragraphs(text)
    sentences = []
    for p in paragraphs:
        sentences.extend(split_sentences(p))
    return sentences


def extract_overlap(text: str, n_sentences: int = OVERLAP_SENTENCES) -> str:
    """Extract the last n sentences from text for overlap."""
    sentences = get_sentences(text)
    if len(sentences) <= n_sentences:
        return text  # Text is short enough to be the overlap itself
    return ' '.join(sentences[-n_sentences:])


def merge_small_chunks(chunks: list[str], min_chars: int = MIN_CHUNK_CHARS) -> list[str]:
    """Merge chunks that are too small with their neighbors."""
    if not chunks:
        return chunks

    merged = []
    i = 0
    while i < len(chunks):
        current = chunks[i]

        # If current chunk is too small and not the last one
        if len(current) < min_chars and i < len(chunks) - 1:
            # Merge with next chunk
            next_chunk = chunks[i + 1]
            combined = current + '\n\n' + next_chunk

            if len(combined) <= MAX_CHUNK_CHARS:
                merged.append(combined)
                i += 2  # Skip next chunk (already merged)
                continue

        # If current chunk is too small and it's the last one
        if len(current) < min_chars and merged:
            # Merge with previous chunk
            prev = merged[-1]
            combined = prev + '\n\n' + current

            if len(combined) <= MAX_CHUNK_CHARS:
                merged[-1] = combined
                i += 1
                continue

        merged.append(current)
        i += 1

    return merged


def chunk_text(text: str, max_chars: int = MAX_CHUNK_CHARS, overlap: bool = True) -> list[dict]:
    """
    Main chunking function.

    Returns list of dicts:
    {
        "text": str,
        "chunk_index": int,
        "char_start": int,  # approximate position in original
        "char_end": int
    }
    """
    text = text.strip()
    if not text:
        return []

    # If text fits in a single chunk, return as-is
    if len(text) <= max_chars:
        return [{
            "text": text,
            "chunk_index": 0,
            "char_start": 0,
            "char_end": len(text),
            "token_estimate": estimate_tokens(text)
        }]

    # Step 1: Split into paragraphs
    paragraphs = split_paragraphs(text)

    # Step 2: Build chunks from paragraphs
    raw_chunks = []
    current_chunk = ""
    current_start = 0

    for para in paragraphs:
        candidate = current_chunk + ('\n\n' if current_chunk else '') + para

        if len(candidate) <= max_chars:
            # Paragraph fits, add to current chunk
            current_chunk = candidate
        else:
            # Paragraph doesn't fit
            if current_chunk:
                # Save current chunk
                raw_chunks.append((current_chunk, current_start))
                current_start += len(current_chunk) + 2  # +2 for \n\n

            # If paragraph itself exceeds max, split it further
            if len(para) > max_chars:
                sentences = split_sentences(para)
                sub_chunk = ""
                for sent in sentences:
                    sub_candidate = sub_chunk + (' ' if sub_chunk else '') + sent
                    if len(sub_candidate) <= max_chars:
                        sub_chunk = sub_candidate
                    else:
                        if sub_chunk:
                            raw_chunks.append((sub_chunk, current_start))
                            current_start += len(sub_chunk) + 1
                        sub_chunk = sent

                if sub_chunk:
                    current_chunk = sub_chunk
                else:
                    current_chunk = ""
            else:
                current_chunk = para

    # Don't forget the last chunk
    if current_chunk:
        raw_chunks.append((current_chunk, current_start))

    # Step 3: Merge chunks that are too small
    chunk_texts = [c[0] for c in raw_chunks]
    chunk_texts = merge_small_chunks(chunk_texts)

    # Step 4: Add overlap (prepend last sentence of previous chunk)
    if overlap and len(chunk_texts) > 1:
        overlapped = [chunk_texts[0]]
        for i in range(1, len(chunk_texts)):
            prev_overlap = extract_overlap(chunk_texts[i - 1])
            overlapped.append(prev_overlap + '\n' + chunk_texts[i])
        chunk_texts = overlapped

    # Step 5: Build result
    result = []
    char_pos = 0
    for i, chunk in enumerate(chunk_texts):
        result.append({
            "text": chunk,
            "chunk_index": i,
            "char_start": char_pos,
            "char_end": char_pos + len(chunk),
            "token_estimate": estimate_tokens(chunk)
        })
        char_pos += len(chunk)

    return result


def should_chunk(text: str, threshold_chars: int = MAX_CHUNK_CHARS) -> bool:
    """Check if text needs chunking."""
    return len(text.strip()) > threshold_chars
