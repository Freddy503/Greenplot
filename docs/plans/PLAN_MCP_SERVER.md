# MCP Server Foundation

## Goal
Run a minimal Model Context Protocol (MCP) server alongside the existing OpenClaw API to expose core Seedify functionality (starting with `search_seeds`) for external AI agents and tools.

## Why
MCP is the standard for connecting AI models to external data and tools. By exposing Seedify as an MCP server, we enable:
- IDE copilots (Cursor, Windsurf) to query your garden for context
- Notebooks to pull relevant seeds before running experiments
- Voice assistants to answer "What did I think about X?"
- Future agent collaboration via shared context

This is the foundation—without MCP, nothing else plugs in.

## Steps
1. **Add MCP dependency**
   - Edit `openclaw-api/requirements.txt`
     Append: `mcp[server]>=1.0.0`
   - Run: `pip install -r openclaw-api/requirements.txt`

2. **Create MCP server entrypoint**
   - Create file: `openclaw-api/mcp_server.py`
   - Content:
     ```python
     from fastapi import FastAPI
     import uvicorn
     from mcp.server.fastapi import create_mcp_server
     from openclaw_api.app.weaviate_client import weaviate_client
     from openclaw_api.app.tool_executor import ToolExecutor

     app = FastAPI()
     tool_executor = ToolExecutor()

     # Create MCP server instance
     mcp_server = create_mcp_server(
         name="seedify-mcp",
         version="0.1.0",
         description="Seedify Knowledge Garden as an MCP Server"
     )

     @mcp_server.tool()
     def search_seeds(query: str) -> str:
         """Search Seedify garden for seeds matching query."""
         results = weaviate_client.query_seed(query, limit=5)
         return "\n\n".join([f"## {s.title}\n{s.summary}" for s in results])

     # Mount MCP server under /mcp
     app.mount("/mcp", mcp_server)

     if __name__ == "__main__":
         uvicorn.run(app, host="0.0.0.0", port=8002)
     ```

3. **Test the server**
   - Start: `cd openclaw-api && python mcp_server.py`
   - In another terminal:
     ```bash
     curl -X POST http://localhost:8002/mcp/tools/search_seeds \
       -H "Content-Type: application/json" \
       -d '{"query": "AI agents"}'
     ```
   - Verify it returns seed titles and summaries in plain text

4. **Ensure no conflicts**
   - Confirm main API still runs on port 8001
   - Check logs for port binding errors

## File Changes
- `openclaw-api/requirements.txt` → add `mcp[server]>=1.0.0`
- New: `openclaw-api/mcp_server.py`

## Success Criteria
- MCP server starts on port 8002 without errors
- `search_seeds` tool returns usable, formatted seed data
- Main OpenClaw API (port 8001) remains unaffected
- Response time <1s for typical queries

## Notes
- Uses existing `weaviate_client` and `tool_executor`—no new logic
- Port 8002 chosen arbitrarily; adjust if needed
- This is a minimal MVP—later phases will add more tools (create_seed, agent spawn, etc.)
- No frontend changes needed yet
