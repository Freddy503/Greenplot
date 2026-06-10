#!/usr/bin/env python3
"""
Greenplot MCP Server — exposes the Greenplot knowledge base to Claude Code,
Claude Desktop, Cursor, and any MCP-compatible tool.

Calls the existing Greenplot REST API (api.greenplot.ink) — no local imports needed.

Usage (stdio, for Claude Code ~/.claude/settings.json):
  {
    "mcpServers": {
      "greenplot": {
        "command": "python3",
        "args": ["/path/to/mcp_server.py"],
        "env": {
          "GREENPLOT_API_URL": "https://api.greenplot.ink",
          "GREENPLOT_TOKEN": "Bearer <your-jwt-token>"
        }
      }
    }
  }

Get your token: POST https://api.greenplot.ink/api/v1/login
  {"email": "...", "password": "..."} → {"access_token": "..."}
"""

import os
import sys
import json
import asyncio
import httpx
import logging

logging.basicConfig(level=logging.WARNING)

API_URL = os.environ.get("GREENPLOT_API_URL", "https://api.greenplot.ink")
TOKEN = os.environ.get("GREENPLOT_TOKEN", "")


def _headers():
    h = {"Content-Type": "application/json"}
    if TOKEN:
        h["Authorization"] = TOKEN if TOKEN.startswith("Bearer ") else f"Bearer {TOKEN}"
    return h


async def query_seeds(query: str, limit: int = 5) -> str:
    """Search the Greenplot knowledge base seeds."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{API_URL}/api/v1/seeds",
            params={"query": query, "limit": limit},
            headers=_headers(),
        )
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        seeds = data.get("seeds", [])
        if not seeds:
            return "No seeds found matching that query."
        lines = []
        for s in seeds:
            title = s.get("title", "Untitled")
            summary = s.get("summary") or s.get("content", "")[:200]
            domain = s.get("domain", "")
            tags = s.get("tags", "")
            created = s.get("created_at", "")[:10] if s.get("created_at") else ""
            lines.append(f"**{title}**\n  Domain: {domain} | Tags: {tags} | Created: {created}\n  {summary}")
        return "\n\n".join(lines)


async def query_wiki(topic: str) -> str:
    """Search the Greenplot compiled wiki articles."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{API_URL}/api/v1/wiki",
            params={"search": topic, "limit": 5},
            headers=_headers(),
        )
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        articles = data.get("articles", [])
        if not articles:
            return f"No wiki articles found for '{topic}'."
        lines = []
        for a in articles:
            title = a.get("title", "Untitled")
            summary = a.get("summary", a.get("content", "")[:300])
            category = a.get("category", "")
            lines.append(f"**{title}** [{category}]\n  {summary}")
        return "\n\n".join(lines)


async def capture_thought(content: str, source: str = "mcp") -> str:
    """Save a new thought/seed to the Greenplot knowledge base."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{API_URL}/api/v1/thoughts",
            headers=_headers(),
            json={"content": content, "source": source},
        )
        if resp.status_code == 422:
            data = resp.json()
            return f"Rejected: {data.get('detail', 'Content too short or repetitive')}"
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        return f"Saved seed (id={data.get('id', '?')}). Enrichment queued."


async def list_recent_seeds(limit: int = 10) -> str:
    """List the most recently added seeds."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{API_URL}/api/v1/seeds",
            params={"limit": limit},
            headers=_headers(),
        )
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        seeds = data.get("seeds", [])
        if not seeds:
            return "No seeds yet."
        lines = [f"- **{s.get('title', 'Untitled')}** ({s.get('created_at', '')[:10]})" for s in seeds]
        return "\n".join(lines)


def _is_spec(seed: dict) -> bool:
    meta = seed.get("metadata") or {}
    tags = meta.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",")]
    return meta.get("seed_type") == "spec" or "spec" in tags or "prd" in tags


async def list_specs(limit: int = 20) -> str:
    """List PRD/spec seeds with their build status."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{API_URL}/api/v1/seeds",
            params={"limit": 100},
            headers=_headers(),
        )
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        seeds = [s for s in resp.json().get("seeds", []) if _is_spec(s)][:limit]
        if not seeds:
            return "No specs/PRDs found in the Studio."
        lines = []
        for s in seeds:
            meta = s.get("metadata") or {}
            status = meta.get("build_status", "draft")
            pr = meta.get("build_pr_url", "")
            lines.append(
                f"- **{s.get('title', 'Untitled')}** (id={s.get('id')}) — status: {status}"
                + (f" — PR: {pr}" if pr else "")
            )
        return "\n".join(lines)


async def get_spec(seed_id: str) -> str:
    """Fetch the full PRD content for a spec seed."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{API_URL}/api/v1/seeds/{seed_id}",
            headers=_headers(),
        )
        if resp.status_code == 404:
            return f"No spec found with id {seed_id}. Use list_specs to see available specs."
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        s = resp.json()
        meta = s.get("metadata") or s.get("seed_metadata") or {}
        header = (
            f"# {s.get('title', 'Untitled')}\n"
            f"Build status: {meta.get('build_status', 'draft')}"
            + (f" | PR: {meta.get('build_pr_url')}" if meta.get("build_pr_url") else "")
            + (f" | Diagram: {meta.get('diagram_url')}" if meta.get("diagram_url") else "")
        )
        body = f"{header}\n\n{s.get('content', '')}"
        # Batch design identity rides along with the spec (design-vision-doc.md)
        if meta.get("design_tokens_css"):
            body += (
                f"\n\nDESIGN TOKENS (from the batch Design Vision '{meta.get('design_vision_title', '')}' — "
                f"use these CSS variables, do not invent a palette):\n```css\n{meta['design_tokens_css']}\n```"
            )
        return body


async def report_build_progress(seed_id: str, status: str, pr_url: str = "", note: str = "") -> str:
    """Update a spec's build lifecycle status (draft → ready → building → shipped)."""
    payload = {"status": status}
    if pr_url:
        payload["pr_url"] = pr_url
    if note:
        payload["note"] = note
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(
            f"{API_URL}/api/v1/seeds/{seed_id}/build-status",
            headers=_headers(),
            json=payload,
        )
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        return f"Spec {data.get('seed_id')} marked '{data.get('build_status')}'." + (
            f" PR: {data.get('pr_url')}" if data.get("pr_url") else ""
        )


async def update_seed(seed_id: str, title: str = "", content: str = "", append: bool = False) -> str:
    """Update a seed's title/content. append=True adds to existing content."""
    async with httpx.AsyncClient(timeout=20) as client:
        body = {}
        if title:
            body["title"] = title
        if content:
            if append:
                # PATCH replaces content, so fetch + concat for append semantics
                cur = await client.get(f"{API_URL}/api/v1/seeds/{seed_id}", headers=_headers())
                if not cur.is_success:
                    return f"Error {cur.status_code}: could not load seed for append"
                existing = (cur.json().get("content") or "").rstrip()
                body["content"] = f"{existing}\n\n{content}" if existing else content
            else:
                body["content"] = content
        if not body:
            return "Nothing to update — provide title and/or content."
        resp = await client.patch(f"{API_URL}/api/v1/seeds/{seed_id}", headers=_headers(), json=body)
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        return f"Seed '{data.get('title', seed_id)}' updated" + (" (content appended)." if append and content else ".")


async def create_article(title: str, content: str, category: str = "Note") -> str:
    """Create a Library wiki article directly."""
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{API_URL}/api/v1/wiki/articles",
            headers=_headers(),
            json={"title": title, "content": content, "category": category},
        )
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        return f"Article '{title}' created in the Library (id={data.get('article_id')})."


async def update_article(article_id: str, title: str = "", content: str = "", summary: str = "") -> str:
    """Update an existing Library article."""
    body = {k: v for k, v in (("title", title), ("content", content), ("summary", summary)) if v}
    if not body:
        return "Nothing to update — provide title, content, and/or summary."
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.patch(f"{API_URL}/api/v1/wiki/{article_id}", headers=_headers(), json=body)
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        return f"Article {article_id} updated."


async def ingest_paper(arxiv_id: str = "", url: str = "") -> str:
    """Plant a research paper (arXiv id or URL) as a paper seed."""
    if not arxiv_id and not url:
        return "Provide an arxiv_id or url."
    async with httpx.AsyncClient(timeout=35) as client:
        resp = await client.post(
            f"{API_URL}/api/v1/papers/ingest",
            headers=_headers(),
            json={"arxiv_id": arxiv_id or None, "url": url or None},
        )
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        return f"Paper '{data.get('title')}' planted (seed_id={data.get('seed_id')}). {data.get('message', '')}"


async def search_paper_content(query: str, seed_id: str = "", limit: int = 5) -> str:
    """Search the full text of parsed research papers."""
    async with httpx.AsyncClient(timeout=20) as client:
        body = {"query": query, "limit": limit}
        if seed_id:
            body["seed_id"] = seed_id
        resp = await client.post(f"{API_URL}/api/v1/papers/search", headers=_headers(), json=body)
        if not resp.is_success:
            return f"Error {resp.status_code}: {resp.text[:200]}"
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return data.get("message", "No parsed paper content matched.")
        lines = []
        for r in results:
            lines.append(
                f"**{r.get('paper', '')}** — {r.get('section', '')} (relevance {r.get('relevance', 0)})\n"
                f"{(r.get('text') or '')[:800]}\n— {r.get('citation', '')}"
            )
        return "\n\n".join(lines)


# ── MCP stdio transport ───────────────────────────────────────────────────────

TOOLS_SCHEMA = [
    {
        "name": "query_seeds",
        "description": "Search Greenplot personal knowledge base seeds using semantic search.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "limit": {"type": "integer", "description": "Max results (default 5)", "default": 5},
            },
            "required": ["query"],
        },
    },
    {
        "name": "query_wiki",
        "description": "Search Greenplot compiled wiki articles on topics like agentic AI, PKM, enterprise architecture.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "Topic to search for"},
            },
            "required": ["topic"],
        },
    },
    {
        "name": "capture_thought",
        "description": "Save a new idea, insight, or note to the Greenplot knowledge base. It will be enriched with web research and compiled into the wiki.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "The thought or idea to save (min 20 chars)"},
                "source": {"type": "string", "description": "Source label (default: 'mcp')", "default": "mcp"},
            },
            "required": ["content"],
        },
    },
    {
        "name": "list_recent_seeds",
        "description": "List the most recently added seeds in the knowledge base.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Number of seeds to return (default 10)", "default": 10},
            },
        },
    },
    {
        "name": "list_specs",
        "description": "List PRDs/specs in the Greenplot Studio with their build status (draft/ready/building/shipped). Use this to find a spec to implement.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Max specs to return (default 20)", "default": 20},
            },
        },
    },
    {
        "name": "get_spec",
        "description": "Fetch the full PRD markdown for a spec seed, including build status, PR link, and architecture diagram URL. Use before implementing a spec.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "seed_id": {"type": "string", "description": "Spec seed id (from list_specs)"},
            },
            "required": ["seed_id"],
        },
    },
    {
        "name": "report_build_progress",
        "description": "Report implementation progress on a spec back to Greenplot. Set status to 'building' when starting and 'shipped' with pr_url when the PR is open/merged.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "seed_id": {"type": "string", "description": "Spec seed id"},
                "status": {"type": "string", "enum": ["draft", "ready", "building", "shipped"], "description": "New build status"},
                "pr_url": {"type": "string", "description": "Pull request URL (for 'shipped')"},
                "note": {"type": "string", "description": "Short progress note"},
            },
            "required": ["seed_id", "status"],
        },
    },
    {
        "name": "update_seed",
        "description": "Update an existing seed's title or content. Use append=true to add to the content instead of replacing — ideal for building up a PRD or notes across a long session.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "seed_id": {"type": "string", "description": "Seed id (from query_seeds/list_specs)"},
                "title": {"type": "string", "description": "New title (optional)"},
                "content": {"type": "string", "description": "New or additional content (optional)"},
                "append": {"type": "boolean", "description": "true: append to existing content; false (default): replace"},
            },
            "required": ["seed_id"],
        },
    },
    {
        "name": "create_article",
        "description": "Create a Library wiki article with markdown content — for publishing write-ups, decisions, or documentation into Greenplot.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Article title"},
                "content": {"type": "string", "description": "Full markdown content"},
                "category": {"type": "string", "description": "Category label (default 'Note')"},
            },
            "required": ["title", "content"],
        },
    },
    {
        "name": "update_article",
        "description": "Update an existing Library article's title, content, or summary by article id (find it via query_wiki).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "article_id": {"type": "string", "description": "Article id"},
                "title": {"type": "string", "description": "New title (optional)"},
                "content": {"type": "string", "description": "Replacement markdown content (optional)"},
                "summary": {"type": "string", "description": "New summary (optional)"},
            },
            "required": ["article_id"],
        },
    },
    {
        "name": "ingest_paper",
        "description": "Plant a research paper into the Greenplot garden by arXiv id (e.g. '2406.01234') or paper URL. Fetches title/authors/abstract automatically and queues full-text indexing.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "arxiv_id": {"type": "string", "description": "arXiv identifier"},
                "url": {"type": "string", "description": "Paper URL (arXiv abs/pdf or publisher page)"},
            },
        },
    },
    {
        "name": "search_paper_content",
        "description": "Search the FULL TEXT of parsed research papers (methods, results, limitations — not just abstracts). Use before grounding a spec or implementation in a paper.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to find (e.g. 'evaluation methodology')"},
                "seed_id": {"type": "string", "description": "Limit to one paper seed (optional)"},
                "limit": {"type": "integer", "description": "Max chunks (default 5)"},
            },
            "required": ["query"],
        },
    },
]


async def handle_message(msg: dict) -> dict | None:
    method = msg.get("method")
    req_id = msg.get("id")
    params = msg.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "greenplot", "version": "1.0.0"},
            },
        }

    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": TOOLS_SCHEMA},
        }

    if method == "tools/call":
        tool_name = params.get("name")
        args = params.get("arguments", {})
        try:
            if tool_name == "query_seeds":
                result = await query_seeds(args["query"], args.get("limit", 5))
            elif tool_name == "query_wiki":
                result = await query_wiki(args["topic"])
            elif tool_name == "capture_thought":
                result = await capture_thought(args["content"], args.get("source", "mcp"))
            elif tool_name == "list_recent_seeds":
                result = await list_recent_seeds(args.get("limit", 10))
            elif tool_name == "list_specs":
                result = await list_specs(args.get("limit", 20))
            elif tool_name == "get_spec":
                result = await get_spec(args["seed_id"])
            elif tool_name == "report_build_progress":
                result = await report_build_progress(
                    args["seed_id"], args["status"],
                    args.get("pr_url", ""), args.get("note", ""),
                )
            elif tool_name == "update_seed":
                result = await update_seed(
                    args["seed_id"], args.get("title", ""),
                    args.get("content", ""), bool(args.get("append", False)),
                )
            elif tool_name == "create_article":
                result = await create_article(args["title"], args["content"], args.get("category", "Note"))
            elif tool_name == "update_article":
                result = await update_article(
                    args["article_id"], args.get("title", ""),
                    args.get("content", ""), args.get("summary", ""),
                )
            elif tool_name == "ingest_paper":
                result = await ingest_paper(args.get("arxiv_id", ""), args.get("url", ""))
            elif tool_name == "search_paper_content":
                result = await search_paper_content(
                    args["query"], args.get("seed_id", ""), int(args.get("limit", 5)),
                )
            else:
                result = f"Unknown tool: {tool_name}"
        except Exception as e:
            result = f"Tool error: {e}"

        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "content": [{"type": "text", "text": result}],
            },
        }

    if method == "notifications/initialized":
        return None  # no response for notifications

    # Unknown method
    if req_id is not None:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }
    return None


async def main():
    loop = asyncio.get_event_loop()

    def write_msg(msg: dict):
        payload = json.dumps(msg)
        sys.stdout.buffer.write(f"Content-Length: {len(payload.encode())}\r\n\r\n{payload}".encode())
        sys.stdout.buffer.flush()

    buf = b""
    while True:
        chunk = await loop.run_in_executor(None, sys.stdin.buffer.read, 4096)
        if not chunk:
            break
        buf += chunk
        while b"\r\n\r\n" in buf:
            header, rest = buf.split(b"\r\n\r\n", 1)
            length = None
            for line in header.split(b"\r\n"):
                if line.lower().startswith(b"content-length:"):
                    length = int(line.split(b":", 1)[1].strip())
            if length is None:
                buf = rest
                continue
            if len(rest) < length:
                buf = header + b"\r\n\r\n" + rest
                break
            body = rest[:length]
            buf = rest[length:]
            try:
                msg = json.loads(body)
                response = await handle_message(msg)
                if response is not None:
                    write_msg(response)
            except Exception as e:
                logging.warning(f"MCP error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
