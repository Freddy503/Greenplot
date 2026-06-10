# Full MCP Server Support — PRD

**Status:** ready · **Owner:** Freddy · **Target:** 1–1.5 weeks

## Problem Alignment

The current MCP server (`openclaw-api/mcp_server.py`) works but is a stdio script with 7 tools, manual token setup, and no resources, prompts, or remote access. "Full MCP support" means any MCP client (Claude Code, Claude Desktop, Cursor, ChatGPT desktop) can connect with minimal friction and operate the whole loop — search knowledge, read papers, pull specs, write seeds/articles, and report build progress — making Greenplot the persistent memory layer for coding agents.

## Solution Summary

Ship a first-class MCP server in two transports: the existing **stdio** script (improved) and a new **Streamable HTTP** endpoint mounted on the FastAPI backend (`/mcp`), authenticated by per-user API keys. Cover the full MCP surface: tools (complete set mirroring chat tools), resources (specs, wiki articles, papers as `greenplot://` URIs), and prompts (develop_idea, spec review). One-command setup via `npx`-style docs and a settings page that mints scoped API keys.

## System Architecture

- **Transport A — stdio (existing, keep):** for local clients; thin wrapper that calls the REST API. Upgrade to the official `mcp` Python SDK instead of the hand-rolled JSON-RPC loop (gets protocol-version negotiation, schema validation, and SSE-free streaming for free).
- **Transport B — Streamable HTTP (new):** `fastapi_mcp`-style mount at `https://api.greenplot.ink/mcp`. Remote clients connect directly — no local Python needed. Auth: `Authorization: Bearer gp_live_...` per-user API keys (new `api_keys` table: id, user_id, name, hash, scopes, last_used_at). Keys minted/revoked in Settings → Integrations.
- **Tool set (full):** query_seeds, query_wiki, search_paper_content, capture_thought, create_seed, update_seed, create_article, update_article, list_specs, get_spec, report_build_progress, ingest_paper, develop_idea (interrogate/finalize), generate_diagram. All delegate to `TOOL_HANDLERS` via a shared adapter so chat and MCP can never drift.
- **Resources:** `greenplot://specs/{id}`, `greenplot://wiki/{id}`, `greenplot://papers/{seed_id}` (full parsed text once the paper pipeline lands), with list endpoints for discovery. Lets clients attach a PRD as context without a tool call.
- **Prompts:** `develop-idea`, `review-spec` (dual-voice CEO/engineering review) exposed as MCP prompts so any client gets the gstack flows.
- **Rate limiting / budget:** per-key daily token budget reusing the existing usage table; 429 with reset time.

## Scope & Capabilities

**In:** both transports, full tool parity, resources + prompts, API-key management UI, docs page with copy-paste configs for Claude Code / Desktop / Cursor, per-key budgets.
**Out (v1):** OAuth dynamic client registration, multi-workspace keys, MCP sampling (server-initiated LLM calls), webhooks.

## Delivery Risks & Open Questions

- Streamable HTTP through the Cloudflare tunnel: verify long-lived streaming responses aren't buffered (tunnel supports SSE; test early).
- Key security: store only hashes; show key once at mint time. Rotate doc'd.
- Protocol drift: pin MCP SDK version; CI smoke test does initialize → tools/list → one call.
- Open: should `report_build_progress` post a chat notification? (Nice loop-closing touch — propose yes, via existing activity feed.)

## Milestones

1. Migrate stdio server to official MCP SDK + full tool parity (2 days)
2. API-key table + Settings UI + auth dependency (2 days)
3. Streamable HTTP mount + tunnel streaming validation (2 days)
4. Resources + prompts + docs page (2 days)
