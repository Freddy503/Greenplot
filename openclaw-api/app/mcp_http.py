"""
MCP Streamable HTTP transport — `POST /mcp` on the FastAPI backend.

Spec: docs/specs/mcp-server-v2.md. Any MCP client (Claude Code, Claude
Desktop, Cursor) connects remotely with a per-user API key — no local Python
needed:

    { "mcpServers": { "greenplot": {
        "type": "http",
        "url": "https://api.greenplot.ink/mcp",
        "headers": { "Authorization": "Bearer gp_live_..." } } } }

Design notes:
- Stateless server: every POST is self-contained JSON-RPC; responses are
  plain application/json (the Streamable HTTP spec allows JSON instead of
  SSE, and plain JSON survives the Cloudflare tunnel without buffering risk).
- Tools delegate to the same ToolRegistry the chat agent uses
  (app/agent/setup.py wiring TOOL_HANDLERS), so chat and MCP can never drift.
  A few MCP-only tools (list_specs, get_spec, report_build_progress,
  get_repo_map) are registered on top, mirroring the REST endpoints.
- Resources: greenplot://specs/{id}, greenplot://wiki/{id},
  greenplot://papers/{seed_id}. Prompts: develop-idea, review-spec.
"""

import json
import logging
import uuid as uuidlib
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.auth import API_KEY_PREFIX, decode_token, user_from_api_key
from app.database import get_db
from app.models import Seed, User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["mcp"])

PROTOCOL_VERSIONS = {"2025-06-18", "2025-03-26", "2024-11-05"}
SERVER_INFO = {"name": "greenplot", "version": "2.0.0"}
INSTRUCTIONS = (
    "Greenplot is the user's knowledge garden: seeds (ideas/notes/papers) grow "
    "into wiki articles and PRD specs that coding agents build. Search before "
    "you write; report build progress on specs you implement so the garden "
    "stays current."
)

# ── Registry (chat parity + MCP-only tools) ──────────────────────────────────

_registry = None


def _is_spec(meta: dict) -> bool:
    return isinstance(meta, dict) and (
        meta.get("seed_type") == "spec" or "prd" in str(meta.get("tags", "")).lower()
    )


async def _list_specs(args: dict, user: User, db: Session) -> str:
    status_filter = (args.get("status") or "").strip().lower()
    rows = db.query(Seed).filter(
        Seed.tenant_id == user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None),  # noqa: E711,E712
    ).order_by(Seed.created_at.desc()).all()
    lines = []
    for s in rows:
        m = s.seed_metadata or {}
        if not _is_spec(m) or m.get("seed_type") == "product":
            continue
        status = m.get("build_status", "draft")
        if status_filter and status != status_filter:
            continue
        lines.append(f"- {s.title} | id={s.id} | status={status} | quality={m.get('quality', 'n/a')}")
    return "\n".join(lines) or "No specs found."


async def _get_spec(args: dict, user: User, db: Session) -> str:
    seed = db.query(Seed).filter(
        Seed.id == uuidlib.UUID(str(args["spec_id"])), Seed.tenant_id == user.tenant_id).first()
    if not seed:
        return "Spec not found."
    m = seed.seed_metadata or {}
    header = (f"# {seed.title}\nid: {seed.id} | build_status: {m.get('build_status', 'draft')}"
              + (f" | pr: {m.get('build_pr_url')}" if m.get("build_pr_url") else ""))
    return f"{header}\n\n{seed.content}"


async def _report_build_progress(args: dict, user: User, db: Session) -> str:
    status = str(args.get("status", "")).strip().lower()
    if status not in {"draft", "ready", "building", "shipped"}:
        return "Invalid status — use draft, ready, building or shipped."
    seed = db.query(Seed).filter(
        Seed.id == uuidlib.UUID(str(args["spec_id"])), Seed.tenant_id == user.tenant_id).first()
    if not seed:
        return "Spec not found."
    meta = dict(seed.seed_metadata or {})
    meta["build_status"] = status
    if args.get("pr_url"):
        meta["build_pr_url"] = str(args["pr_url"])[:500]
    if args.get("note"):
        meta["build_note"] = str(args["note"])[:1000]
    meta["build_updated_at"] = datetime.utcnow().isoformat()
    seed.seed_metadata = meta
    db.commit()
    return f"'{seed.title}' → {status}" + (f" ({args.get('pr_url')})" if args.get("pr_url") else "")


async def _get_repo_map(args: dict, user: User, db: Session) -> str:
    from app.github_sync import get_repo_map_for_tenant
    repo_map = get_repo_map_for_tenant(str(user.tenant_id), db)
    return repo_map or "No GitHub repo connected (Settings → Integrations)."


def get_mcp_registry():
    """Chat tool registry + MCP-only tools, built once per process."""
    global _registry
    if _registry is not None:
        return _registry
    from app.agent.registry import ToolSpec
    from app.agent.setup import setup_default_registry

    reg = setup_default_registry()
    reg.replace(ToolSpec(
        name="list_specs",
        description="List the user's PRD specs with id, build status and quality. Filter with status=draft|ready|building|shipped.",
        input_schema={"type": "object", "properties": {
            "status": {"type": "string", "description": "Optional build-status filter."}}},
        handler=_list_specs,
    ))
    reg.replace(ToolSpec(
        name="get_spec",
        description="Fetch a full PRD spec (markdown) by id — use list_specs to find ids.",
        input_schema={"type": "object", "properties": {
            "spec_id": {"type": "string", "description": "Spec seed id."}},
            "required": ["spec_id"]},
        handler=_get_spec,
    ))
    reg.replace(ToolSpec(
        name="report_build_progress",
        description="Update a spec's build lifecycle (draft → ready → building → shipped) and optionally attach the PR url. Call this when you start or finish implementing a spec.",
        input_schema={"type": "object", "properties": {
            "spec_id": {"type": "string"},
            "status": {"type": "string", "enum": ["draft", "ready", "building", "shipped"]},
            "pr_url": {"type": "string", "description": "Optional pull-request URL."},
            "note": {"type": "string", "description": "Optional short progress note."}},
            "required": ["spec_id", "status"]},
        handler=_report_build_progress,
    ))
    reg.replace(ToolSpec(
        name="get_repo_map",
        description="Get the cached file map of the user's connected GitHub repo — orient yourself before implementing a spec.",
        input_schema={"type": "object", "properties": {}},
        handler=_get_repo_map,
    ))
    _registry = reg
    return _registry


# ── Resources ────────────────────────────────────────────────────────────────

def _list_resources(user: User, db: Session) -> list[dict]:
    out = []
    rows = db.query(Seed).filter(
        Seed.tenant_id == user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None),  # noqa: E711,E712
    ).order_by(Seed.created_at.desc()).limit(400).all()
    specs = papers = 0
    for s in rows:
        m = s.seed_metadata or {}
        if not isinstance(m, dict):
            continue
        if _is_spec(m) and m.get("seed_type") != "product" and specs < 25:
            specs += 1
            out.append({
                "uri": f"greenplot://specs/{s.id}", "name": s.title,
                "description": f"PRD · {m.get('build_status', 'draft')}",
                "mimeType": "text/markdown",
            })
        elif m.get("seed_type") == "paper" and papers < 15:
            papers += 1
            out.append({
                "uri": f"greenplot://papers/{s.id}", "name": s.title,
                "description": "Research paper", "mimeType": "text/markdown",
            })
    try:
        from app.weaviate_client import weaviate_client
        for a in (weaviate_client.get_wiki_articles(str(user.tenant_id), limit=25) or []):
            aid = a.get("id") or (a.get("_additional") or {}).get("id")
            if aid:
                out.append({
                    "uri": f"greenplot://wiki/{aid}", "name": a.get("title", "Untitled"),
                    "description": f"Wiki · {a.get('category', '')}".strip(" ·"),
                    "mimeType": "text/markdown",
                })
    except Exception as e:
        logger.warning(f"[mcp] wiki resource listing failed: {e}")
    return out


def _read_resource(uri: str, user: User, db: Session) -> str:
    if not uri.startswith("greenplot://"):
        raise ValueError(f"Unknown URI scheme: {uri}")
    kind, _, rid = uri[len("greenplot://"):].partition("/")
    if kind in ("specs", "papers"):
        seed = db.query(Seed).filter(
            Seed.id == uuidlib.UUID(rid), Seed.tenant_id == user.tenant_id).first()
        if not seed:
            raise ValueError("Resource not found")
        m = seed.seed_metadata or {}
        body = f"# {seed.title}\n\n{seed.content}"
        if kind == "papers" and isinstance(m.get("doc_tree"), (list, dict)):
            body += "\n\n## Document outline\n```json\n" + json.dumps(m["doc_tree"])[:6000] + "\n```"
            body += "\n\n(Use the search_paper_content tool to pull full sections.)"
        return body
    if kind == "wiki":
        from app.weaviate_client import weaviate_client
        for a in (weaviate_client.get_wiki_articles(str(user.tenant_id), limit=100) or []):
            aid = a.get("id") or (a.get("_additional") or {}).get("id")
            if aid == rid:
                return f"# {a.get('title', 'Untitled')}\n\n{a.get('content', '')}"
        raise ValueError("Article not found")
    raise ValueError(f"Unknown resource kind: {kind}")


# ── Prompts ──────────────────────────────────────────────────────────────────

PROMPTS = [
    {
        "name": "develop-idea",
        "description": "Develop a raw idea into a buildable Greenplot PRD using the garden as context.",
        "arguments": [{"name": "idea", "description": "The raw idea to develop.", "required": True}],
    },
    {
        "name": "review-spec",
        "description": "Dual-voice (CEO + engineering) review of an existing PRD spec.",
        "arguments": [{"name": "spec_id", "description": "Spec id from list_specs.", "required": True}],
    },
]


def _get_prompt(name: str, args: dict, user: User, db: Session) -> dict:
    if name == "develop-idea":
        idea = args.get("idea", "")
        text = (
            f"Develop this idea into a buildable PRD: \"{idea}\"\n\n"
            "Work the Greenplot loop: 1) search_seeds and search_wiki for related "
            "prior thinking; 2) interrogate the idea — the problem, who hurts, why "
            "now, the riskiest assumption; 3) write the PRD with write_spec "
            "(problem alignment, solution, data model, API surface, milestones, "
            "acceptance evals); 4) tell me the spec id so I can review it."
        )
    elif name == "review-spec":
        spec_id = args.get("spec_id", "")
        content = "(spec not found — use list_specs)"
        try:
            seed = db.query(Seed).filter(
                Seed.id == uuidlib.UUID(str(spec_id)), Seed.tenant_id == user.tenant_id).first()
            if seed:
                content = seed.content[:24000]
        except Exception:
            pass
        text = (
            "Review this PRD in two voices, then reconcile:\n\n"
            "**CEO**: does it serve the main product's problem statement? Is the "
            "scope the smallest thing that proves the bet? What would you cut?\n"
            "**Engineering**: are the data model and API surface buildable as "
            "written? Name the riskiest integration and the missing acceptance "
            "eval.\n\nFinish with: ship as-is / re-scope / merge into another "
            f"spec — one sentence why.\n\n---\n\n{content}"
        )
    else:
        raise ValueError(f"Unknown prompt: {name}")
    return {
        "description": next((p["description"] for p in PROMPTS if p["name"] == name), ""),
        "messages": [{"role": "user", "content": {"type": "text", "text": text}}],
    }


# ── JSON-RPC plumbing ────────────────────────────────────────────────────────

def _rpc_result(req_id: Any, result: dict) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": req_id, "result": result})


def _rpc_error(req_id: Any, code: int, message: str, status: int = 200) -> JSONResponse:
    return JSONResponse(
        {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}},
        status_code=status)


def _authenticate(request: Request, db: Session) -> Optional[User]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    try:
        if token.startswith(API_KEY_PREFIX):
            return user_from_api_key(token, db)
        payload = decode_token(token)
        return db.query(User).filter(User.id == payload.get("sub")).first()
    except Exception:
        return None


@router.post("/mcp")
async def mcp_endpoint(request: Request, db: Session = Depends(get_db)):
    user = _authenticate(request, db)
    if not user:
        return JSONResponse(
            {"jsonrpc": "2.0", "id": None,
             "error": {"code": -32001, "message": "Unauthorized — pass Authorization: Bearer gp_live_... (mint a key in Settings → Integrations)"}},
            status_code=401, headers={"WWW-Authenticate": "Bearer"})

    try:
        body = await request.json()
    except Exception:
        return _rpc_error(None, -32700, "Parse error")
    if isinstance(body, list):
        return _rpc_error(None, -32600, "Batch requests are not supported")

    method = body.get("method", "")
    params = body.get("params") or {}
    req_id = body.get("id")

    # Notifications (no id) → acknowledge with 202, no body
    if req_id is None and method.startswith("notifications/"):
        return Response(status_code=202)

    try:
        if method == "initialize":
            client_version = str(params.get("protocolVersion", ""))
            version = client_version if client_version in PROTOCOL_VERSIONS else "2025-03-26"
            return _rpc_result(req_id, {
                "protocolVersion": version,
                "capabilities": {"tools": {"listChanged": False}, "resources": {}, "prompts": {}},
                "serverInfo": SERVER_INFO,
                "instructions": INSTRUCTIONS,
            })

        if method == "ping":
            return _rpc_result(req_id, {})

        if method == "tools/list":
            reg = get_mcp_registry()
            tools = [{
                "name": spec["function"]["name"],
                "description": spec["function"]["description"],
                "inputSchema": spec["function"]["parameters"],
            } for spec in reg.to_openai()]
            return _rpc_result(req_id, {"tools": tools})

        if method == "tools/call":
            reg = get_mcp_registry()
            name = params.get("name", "")
            args = params.get("arguments") or {}
            spec = reg.get(name)
            if not spec:
                return _rpc_error(req_id, -32602, f"Unknown tool: {name}")
            try:
                from app.agent.permissions import PermissionLevel
                result = await reg.execute(name, args, user, db, permission=PermissionLevel.WRITE)
                return _rpc_result(req_id, {
                    "content": [{"type": "text", "text": str(result)}], "isError": False})
            except Exception as e:
                logger.warning(f"[mcp] tool {name} failed: {e}")
                return _rpc_result(req_id, {
                    "content": [{"type": "text", "text": f"Tool error: {e}"}], "isError": True})

        if method == "resources/list":
            return _rpc_result(req_id, {"resources": _list_resources(user, db)})

        if method == "resources/templates/list":
            return _rpc_result(req_id, {"resourceTemplates": [
                {"uriTemplate": "greenplot://specs/{id}", "name": "PRD spec", "mimeType": "text/markdown"},
                {"uriTemplate": "greenplot://wiki/{id}", "name": "Wiki article", "mimeType": "text/markdown"},
                {"uriTemplate": "greenplot://papers/{seed_id}", "name": "Research paper", "mimeType": "text/markdown"},
            ]})

        if method == "resources/read":
            uri = params.get("uri", "")
            try:
                text = _read_resource(uri, user, db)
            except ValueError as e:
                return _rpc_error(req_id, -32002, str(e))
            return _rpc_result(req_id, {
                "contents": [{"uri": uri, "mimeType": "text/markdown", "text": text}]})

        if method == "prompts/list":
            return _rpc_result(req_id, {"prompts": PROMPTS})

        if method == "prompts/get":
            try:
                return _rpc_result(req_id, _get_prompt(
                    params.get("name", ""), params.get("arguments") or {}, user, db))
            except ValueError as e:
                return _rpc_error(req_id, -32602, str(e))

        return _rpc_error(req_id, -32601, f"Method not found: {method}")
    except Exception as e:
        logger.error(f"[mcp] {method} failed: {e}", exc_info=True)
        return _rpc_error(req_id, -32603, f"Internal error: {e}")


@router.get("/mcp")
async def mcp_get():
    # Stateless server: no server-initiated SSE stream.
    return Response(status_code=405, headers={"Allow": "POST, DELETE"})


@router.delete("/mcp")
async def mcp_delete():
    # Session termination is a no-op for a stateless server.
    return Response(status_code=200)
