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


def setup_default_registry(api_key: str = "", model: str = "anthropic/claude-sonnet-4") -> ToolRegistry:
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
        description="Search the web for current information. ALWAYS call search_seeds and search_wiki FIRST before calling this tool — only use web_search if internal results are insufficient or the user explicitly asks for web/news results.",
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

    # ── Wiki Search ──────────────────────────────────────────────
    registry.register(ToolSpec(
        name="search_wiki",
        description="Search the user's wiki knowledge base (synthesized articles from seeds and sources). Use when answering complex or conceptual questions that benefit from the user's own documented knowledge. This is the highest-quality context layer.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query to find relevant wiki articles by title, content, or summary.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return (default 3).",
                    "default": 3,
                },
            },
            "required": ["query"],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("search_wiki"),
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

    registry.register(ToolSpec(
        name="visualize_garden",
        description="Generate a visual knowledge graph of the user's Garden seeds. Use when the user asks to visualize, map, or see connections in their garden. Returns graph data rendered as an interactive network in the chat.",
        input_schema={
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of seeds to include (default 40, max 80).",
                    "default": 40,
                },
            },
            "required": [],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("visualize_garden"),
    ))

    # ── Calendar ──────────────────────────────────────────────────

    registry.register(ToolSpec(
        name="get_calendar_events",
        description="Fetch upcoming Google Calendar events. Use when the user asks what's on their calendar, what meetings they have, or to check their schedule.",
        input_schema={
            "type": "object",
            "properties": {
                "hours": {
                    "type": "integer",
                    "description": "How many hours ahead to look (default 24, use 48 for tomorrow, 168 for this week).",
                    "default": 24,
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of events to return (default 10).",
                    "default": 10,
                },
            },
            "required": [],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("get_calendar_events"),
    ))

    registry.register(ToolSpec(
        name="create_calendar_event",
        description="Create a new event in the user's Google Calendar. Use when the user asks to schedule something, block time, add a meeting, or set a reminder.",
        input_schema={
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Event title.",
                },
                "start_time": {
                    "type": "string",
                    "description": "Start datetime in ISO 8601 format, e.g. '2025-06-10T14:00:00'. Use the user's local timezone.",
                },
                "end_time": {
                    "type": "string",
                    "description": "End datetime in ISO 8601 format. Default to 1 hour after start if not specified.",
                },
                "description": {
                    "type": "string",
                    "description": "Optional event notes or agenda.",
                },
                "location": {
                    "type": "string",
                    "description": "Optional location or meeting link.",
                },
            },
            "required": ["summary", "start_time", "end_time"],
        },
        permission=PermissionLevel.WRITE,
        handler=TOOL_HANDLERS.get("create_calendar_event"),
    ))

    # ── Image Generation ──────────────────────────────────────────

    registry.register(ToolSpec(
        name="generate_image",
        description="Generate an image using BFL FLUX AI. ALWAYS call this tool immediately when the user asks to create, generate, or visualize an image. Do NOT respond with text — call this tool directly.",
        input_schema={
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Detailed description of the image to generate.",
                },
                "width": {
                    "type": "integer",
                    "description": "Image width in pixels (256-2048, default 1024).",
                    "default": 1024,
                },
                "height": {
                    "type": "integer",
                    "description": "Image height in pixels (256-2048, default 1024).",
                    "default": 1024,
                },
            },
            "required": ["prompt"],
        },
        permission=PermissionLevel.READ,
        handler=TOOL_HANDLERS.get("generate_image"),
    ))

    # ── Spec / PRD Tools ─────────────────────────────────────────

    registry.register(ToolSpec(
        name="write_spec",
        description=(
            "Save a Product Requirements Document (PRD) to the user's Studio and Library. "
            "Call this whenever the user asks to 'create a PRD', 'write a spec', 'document this feature', "
            "or after completing the 11-question gstack spec flow. "
            "Use the full gstack markdown structure: # Title — PRD, ## Problem Alignment, ## Solution Summary, "
            "## System Architecture, ## Scope & Capabilities, ## Delivery Risks & Open Questions. "
            "The System Architecture section must name the concrete components (services, data stores, "
            "external APIs, frontend surfaces), the data flows between them, and the chosen stack — "
            "it doubles as the brief for the auto-generated architecture diagram. "
            "Each section must have 3-5 sentences of substantive prose. "
            "Provide the complete structured PRD markdown in `content`."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short feature name for the PRD (e.g. 'Real-time Collaboration').",
                },
                "content": {
                    "type": "string",
                    "description": "Full PRD in structured markdown (all sections from Problem Alignment through Risks).",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional tags. Defaults to ['prd', 'spec'].",
                },
            },
            "required": ["title", "content"],
        },
        permission=PermissionLevel.WRITE,
        handler=TOOL_HANDLERS.get("write_spec"),
    ))

    registry.register(ToolSpec(
        name="ingest_paper",
        description=(
            "Ingest a research paper into the garden as a 'paper' seed. "
            "Accepts an arXiv id (e.g. '2406.01234') or any paper URL. "
            "Fetches title, authors, and abstract automatically. "
            "Use when the user shares a paper or asks to save one — afterwards, "
            "offer develop_idea to turn the paper into a buildable project spec."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "arxiv_id": {
                    "type": "string",
                    "description": "arXiv identifier, e.g. '2406.01234' (with or without version suffix).",
                },
                "url": {
                    "type": "string",
                    "description": "Paper URL (arXiv abs/pdf link or publisher page).",
                },
            },
        },
        permission=PermissionLevel.WRITE,
        handler=TOOL_HANDLERS.get("ingest_paper"),
    ))

    registry.register(ToolSpec(
        name="update_seed",
        description=(
            "Update an existing seed's title, content, or tags. Use append=true to add to the "
            "existing content instead of replacing it — ideal for long-running work that builds "
            "up a seed (e.g. mapping out a complex PRD) across multiple turns. "
            "Find the seed_id via search_seeds first."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "seed_id": {"type": "string", "description": "UUID of the seed to update."},
                "title": {"type": "string", "description": "New title (optional)."},
                "content": {"type": "string", "description": "New or additional content (optional)."},
                "append": {"type": "boolean", "description": "true: append content to the existing text. false (default): replace it."},
                "tags": {"type": "array", "items": {"type": "string"}, "description": "Replace the seed's tags (optional)."},
            },
            "required": ["seed_id"],
        },
        permission=PermissionLevel.WRITE,
        handler=TOOL_HANDLERS.get("update_seed"),
    ))

    registry.register(ToolSpec(
        name="create_article",
        description=(
            "Create a Library wiki article directly with the given markdown content. "
            "Use when the user asks to write up, document, or publish something to their Library "
            "without going through spec mode."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Article title."},
                "content": {"type": "string", "description": "Full article content in markdown."},
                "category": {"type": "string", "description": "Category label (default 'Note')."},
                "summary": {"type": "string", "description": "1-2 sentence summary (auto-derived if omitted)."},
            },
            "required": ["title", "content"],
        },
        permission=PermissionLevel.WRITE,
        handler=TOOL_HANDLERS.get("create_article"),
    ))

    registry.register(ToolSpec(
        name="update_article",
        description=(
            "Update an existing Library article's title, content, or summary. "
            "Use query_wiki/search to find the article first; pass its article_id. "
            "Ideal for iterating on a living document across a long session."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "article_id": {"type": "string", "description": "Weaviate id of the article."},
                "title": {"type": "string", "description": "New title (optional)."},
                "content": {"type": "string", "description": "Replacement markdown content (optional)."},
                "summary": {"type": "string", "description": "New summary (optional)."},
            },
            "required": ["article_id"],
        },
        permission=PermissionLevel.WRITE,
        handler=TOOL_HANDLERS.get("update_article"),
    ))

    # ── Sub-Agent System ───────────────────────────────────────────
    from app.agent.subagents import SubagentRunner, create_subagent_tool_spec

    runner = SubagentRunner(
        registry=registry,
        api_key=api_key,
        model=model,
    )
    registry.register(create_subagent_tool_spec(runner))

    return registry
