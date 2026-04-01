"""
Default Tool Registration

Wires existing tool handlers (from tool_executor.py) into the new
declarative ToolRegistry. This is the bridge between old handlers
and the new architecture.

Usage:
    from app.agent.setup import setup_default_registry
    registry = setup_default_registry()
"""
from __future__ import annotations

from app.agent.registry import ToolRegistry, ToolSpec
from app.agent.permissions import PermissionLevel


def setup_default_registry() -> ToolRegistry:
    """
    Create and populate the default tool registry.

    Imports handlers lazily to avoid circular imports.
    """
    from app.tool_executor import TOOL_HANDLERS

    registry = ToolRegistry()

    # ── Core Idea Tools ───────────────────────────────────────────

    registry.register(ToolSpec(
        name="search_seeds",
        description="Search the user's Second Brain for relevant seeds (ideas, notes, insights) using semantic similarity.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language search query to find relevant seeds.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5).",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("search_seeds"),
    ))

    registry.register(ToolSpec(
        name="create_seed",
        description="Create a new seed (idea/note) in the user's Second Brain. Use when the user wants to capture or save an idea.",
        input_schema={
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Concise title for the seed.",
                },
                "content": {
                    "type": "string",
                    "description": "Rich elaboration of the idea (1-3 paragraphs).",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tags for categorization.",
                },
            },
            "required": ["title", "content"],
        },
        permission=PermissionLevel.WRITE,
        handler=TOOL_HANDLERS.get("create_seed"),
    ))

    registry.register(ToolSpec(
        name="list_recent_seeds",
        description="List the most recent seeds in the user's Second Brain.",
        input_schema={
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of recent seeds to return (default 5).",
                    "default": 5,
                },
            },
            "required": [],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("list_recent_seeds"),
    ))

    registry.register(ToolSpec(
        name="get_daily_briefing",
        description="Get the user's daily briefing: weather, calendar highlights, recent seeds, and a creative prompt.",
        input_schema={
            "type": "object",
            "properties": {},
            "required": [],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("get_daily_briefing"),
    ))

    # ── Search & Research ─────────────────────────────────────────

    registry.register(ToolSpec(
        name="web_search",
        description="Search the web for current information. Use when the user asks about recent events, news, or topics outside the knowledge base.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant web results.",
                },
                "num_results": {
                    "type": "integer",
                    "description": "Number of results to return (default 3).",
                    "default": 3,
                },
            },
            "required": ["query"],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("web_search"),
    ))

    registry.register(ToolSpec(
        name="search_seeds_filtered",
        description="Search seeds with specific filters: domain, tags, energy level.",
        input_schema={
            "type": "object",
            "properties": {
                "domain": {
                    "type": "string",
                    "description": "Filter by domain.",
                    "enum": ["agentic-ai", "career", "enterprise", "systems", "learning", "creativity"],
                },
                "tags": {
                    "type": "string",
                    "description": "Filter by tags (comma-separated, matches any).",
                },
                "energy": {
                    "type": "string",
                    "description": "Filter by energy level.",
                    "enum": ["Spark", "Hot", "Flow", "Cool"],
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results (default 5).",
                    "default": 5,
                },
            },
            "required": [],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("search_seeds_filtered"),
    ))

    # ── Seed Interaction ──────────────────────────────────────────

    registry.register(ToolSpec(
        name="get_seed_detail",
        description="Get full details of a seed including enrichment data (tags, entities, backlinks, domain).",
        input_schema={
            "type": "object",
            "properties": {
                "seed_id": {
                    "type": "string",
                    "description": "The seed ID or notion_id to look up.",
                },
            },
            "required": ["seed_id"],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("get_seed_detail"),
    ))

    registry.register(ToolSpec(
        name="rate_seed",
        description="Rate a seed from 1-5 stars.",
        input_schema={
            "type": "object",
            "properties": {
                "seed_id": {
                    "type": "string",
                    "description": "The ID of the seed to rate.",
                },
                "score": {
                    "type": "integer",
                    "description": "Rating from 1-5 stars.",
                    "minimum": 1,
                    "maximum": 5,
                },
                "feedback": {
                    "type": "string",
                    "description": "Optional feedback text explaining the rating.",
                },
            },
            "required": ["seed_id", "score"],
        },
        permission=PermissionLevel.WRITE,
        handler=TOOL_HANDLERS.get("rate_seed"),
    ))

    # ── Sub-Agent System ───────────────────────────────────────────
    from app.agent.subagents import SubagentRunner, create_subagent_tool_spec

    runner = SubagentRunner(
        registry=registry,
        api_key="",  # Set at runtime
        model="anthropic/claude-sonnet-4",
    )
    registry.register(create_subagent_tool_spec(runner))

    return registry
