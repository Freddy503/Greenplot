# Connecting Coding Agents to Greenplot (MCP)

Greenplot ships an MCP server (`openclaw-api/mcp_server.py`) that gives Claude Code,
Claude Desktop, Cursor, and any MCP-compatible coding agent direct access to your
knowledge base and Studio specs. This closes the Idea-to-Build loop:

> seed / research paper → PRD with architecture diagram (Studio) → coding agent
> pulls the spec via MCP → builds it → reports the PR back → spec marked **shipped**

## Setup (Claude Code)

1. Get a token:

```bash
curl -s https://api.greenplot.ink/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "you@example.com", "password": "..."}'
# → {"access_token": "eyJ..."}
```

2. Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "greenplot": {
      "command": "python3",
      "args": ["/absolute/path/to/Seedify/openclaw-api/mcp_server.py"],
      "env": {
        "GREENPLOT_API_URL": "https://api.greenplot.ink",
        "GREENPLOT_TOKEN": "Bearer <access_token>"
      }
    }
  }
}
```

The server only needs `httpx` (`pip install httpx`) — it talks to the REST API,
no database access required.

## Tools

| Tool | Purpose |
|---|---|
| `query_seeds` | Semantic search over your seeds |
| `query_wiki` | Search compiled Library articles |
| `capture_thought` | Save a new idea (enrichment queued) |
| `list_recent_seeds` | Browse recent captures |
| `list_specs` | List Studio PRDs with build status (draft/ready/building/shipped) |
| `get_spec` | Fetch full PRD markdown + architecture diagram URL for implementation |
| `report_build_progress` | Update a spec's lifecycle; pass `pr_url` when shipped |
| `update_seed` | Edit a seed's title/content; `append: true` builds up notes/PRDs across turns |
| `create_article` | Publish a markdown write-up straight into the Library |
| `update_article` | Iterate on an existing Library article |
| `ingest_paper` | Plant a research paper by arXiv id or URL (full text auto-indexed) |
| `search_paper_content` | Search the full text of parsed papers — methods, results, limitations |

Roadmap to full MCP support (Streamable HTTP transport, per-user API keys,
`greenplot://` resources, prompts): see `docs/specs/mcp-server-v2.md`.

## Recommended agent workflow

1. `list_specs` → pick a spec marked **ready**
2. `get_spec` → read the full PRD (includes the System Architecture section and diagram)
3. `report_build_progress(status="building")`
4. Implement; `query_seeds` / `query_wiki` for domain context as needed
5. `report_build_progress(status="shipped", pr_url="https://github.com/...")`

The Studio UI shows the live status badge on each PRD and links to the PR.
