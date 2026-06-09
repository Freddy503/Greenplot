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

Get your token: POST https://api.greenplot.ink/api/v1/auth/login
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
        meta = s.get("metadata") or {}
        header = (
            f"# {s.get('title', 'Untitled')}\n"
            f"Build status: {meta.get('build_status', 'draft')}"
            + (f" | PR: {meta.get('build_pr_url')}" if meta.get("build_pr_url") else "")
            + (f" | Diagram: {meta.get('diagram_url')}" if meta.get("diagram_url") else "")
        )
        return f"{header}\n\n{s.get('content', '')}"


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
