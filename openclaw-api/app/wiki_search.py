"""
search_wiki tool — search local wiki markdown files for relevant knowledge.

The wiki markdown files are synced from Weaviate WikiArticles by:
  python3 scripts/sync_wiki_markdown.py

This tool searches the local markdown files for content relevant to the user's query.
"""
import os
import json
import re
from typing import Optional

WIKI_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'wiki')
INDEX_FILE = os.path.join(WIKI_DIR, 'index.json')


def _load_index() -> list[dict]:
    """Load the wiki index."""
    if os.path.exists(INDEX_FILE):
        with open(INDEX_FILE, 'r') as f:
            return json.load(f)
    return []


def _read_article(filename: str) -> str:
    """Read a wiki article markdown file."""
    filepath = os.path.join(WIKI_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    return ''


def _keyword_score(query_terms: list[str], text: str) -> float:
    """Simple keyword overlap score."""
    if not query_terms:
        return 0.0
    text_lower = text.lower()
    matches = sum(1 for t in query_terms if t in text_lower)
    return matches / len(query_terms)


def search_wiki(query: str, limit: int = 3) -> list[dict]:
    """
    Search wiki markdown files for relevant content.
    Returns list of {title, summary, snippet, filename} dicts.
    """
    index = _load_index()
    if not index:
        return []

    query_lower = query.lower()
    query_terms = [w for w in re.split(r'\W+', query_lower) if len(w) > 2]

    results = []
    for entry in index:
        filename = entry.get('filename', '')
        title = entry.get('title', '')
        summary = entry.get('summary', '')

        # Score based on title + summary
        text_to_search = f"{title} {summary}"
        score = _keyword_score(query_terms, text_to_search)

        if score > 0:
            # Read a snippet from the article
            content = _read_article(filename)
            # Find the best matching chunk
            snippet = ''
            if content:
                lines = content.split('\n')
                best_chunk = ''
                best_chunk_score = 0
                for i in range(0, len(lines) - 3, 4):
                    chunk = '\n'.join(lines[i:i+6])
                    cs = _keyword_score(query_terms, chunk)
                    if cs > best_chunk_score:
                        best_chunk_score = cs
                        best_chunk = chunk
                snippet = best_chunk[:500] if best_chunk else summary

            results.append({
                'title': title,
                'summary': summary,
                'snippet': snippet[:500],
                'filename': filename,
                'score': round(score, 3),
            })

    # Sort by score descending
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:limit]


async def search_wiki_tool(args: dict, user, db) -> str:
    """Tool handler for the chat endpoint."""
    query = args.get('query', '')
    limit = args.get('limit', 3)

    if not query.strip():
        return json.dumps({
            'status': 'error',
            'message': 'Query is required.'
        })

    results = search_wiki(query, limit=limit)

    if not results:
        return json.dumps({
            'status': 'empty',
            'message': 'No wiki articles found matching your query.'
        })

    return json.dumps({
        'status': 'ok',
        'results': results,
        'count': len(results),
    })
