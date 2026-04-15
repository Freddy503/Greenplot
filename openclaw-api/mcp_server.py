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
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    loop = asyncio.get_event_loop()
    await loop.connect_read_pipe(lambda: protocol, sys.stdin.buffer)
    _, writer = await loop.connect_write_pipe(asyncio.BaseProtocol, sys.stdout.buffer)

    # Simpler approach using sys.stdin/stdout directly
    import io

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
