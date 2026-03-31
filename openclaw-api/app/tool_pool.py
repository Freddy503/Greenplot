"""
tool_pool.py — Permission-aware tool assembly.

Filters tools by context BEFORE the LLM sees them.
Based on claw-code's ToolPool pattern.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Callable, Awaitable

from app.models_frozen import ToolDefinition, PermissionContext, ToolExecution


# ── Tool Registry ────────────────────────────────────────────────────────────

@dataclass
class ToolPool:
    """Assembled set of tools available for a session."""
    tools: tuple[ToolDefinition, ...]
    permission_context: PermissionContext
    simple_mode: bool

    def to_openai(self) -> list[dict]:
        """Convert to OpenAI function-calling format."""
        return [t.to_openai() for t in self.tools]

    def get(self, name: str) -> Optional[ToolDefinition]:
        for t in self.tools:
            if t.name == name:
                return t
        return None

    def names(self) -> list[str]:
        return [t.name for t in self.tools]

    def as_markdown(self) -> str:
        lines = [f"Tool Pool ({len(self.tools)} tools, role={self.permission_context.role})"]
        for t in self.tools:
            lines.append(f"- {t.name}: {t.description[:60]}")
        return "\n".join(lines)


# ── Tool Definitions ─────────────────────────────────────────────────────────

ALL_TOOLS = (
    ToolDefinition(
        name="search_seeds",
        description="Search the user's Second Brain for relevant seeds using semantic similarity.",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Natural language search query."},
                "limit": {"type": "integer", "description": "Max results (default 5).", "default": 5},
            },
            "required": ["query"],
        },
        simple_mode=True,
    ),
    ToolDefinition(
        name="search_seeds_filtered",
        description="Search seeds with filters: domain, tags, energy level.",
        parameters={
            "type": "object",
            "properties": {
                "domain": {"type": "string", "enum": ["agentic-ai", "career", "enterprise", "systems", "learning", "creativity"]},
                "tags": {"type": "string", "description": "Comma-separated tags to match."},
                "energy": {"type": "string", "enum": ["Spark", "Hot", "Flow", "Cool"]},
                "limit": {"type": "integer", "default": 5},
            },
            "required": [],
        },
        simple_mode=True,
    ),
    ToolDefinition(
        name="get_seed_detail",
        description="Get full seed details including enrichment (tags, entities, backlinks).",
        parameters={
            "type": "object",
            "properties": {
                "seed_id": {"type": "string", "description": "The seed ID or notion_id."},
            },
            "required": ["seed_id"],
        },
        simple_mode=True,
    ),
    ToolDefinition(
        name="create_seed",
        description="Create a new seed (idea/note).",
        parameters={
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["title", "content"],
        },
        simple_mode=True,
    ),
    ToolDefinition(
        name="rate_seed",
        description="Rate a seed 1-5 stars.",
        parameters={
            "type": "object",
            "properties": {
                "seed_id": {"type": "string"},
                "score": {"type": "integer", "minimum": 1, "maximum": 5},
                "feedback": {"type": "string"},
            },
            "required": ["seed_id", "score"],
        },
        simple_mode=True,
    ),
    ToolDefinition(
        name="get_daily_briefing",
        description="Get daily briefing: weather, recent seeds, creative prompt.",
        parameters={"type": "object", "properties": {}, "required": []},
        simple_mode=True,
    ),
    ToolDefinition(
        name="list_recent_seeds",
        description="List recent seeds.",
        parameters={
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 5},
            },
            "required": [],
        },
        simple_mode=True,
    ),
    ToolDefinition(
        name="web_search",
        description="Search the web for current information.",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "num_results": {"type": "integer", "default": 3},
            },
            "required": ["query"],
        },
        simple_mode=True,
    ),
)


# ── Assembly ─────────────────────────────────────────────────────────────────

def assemble_tool_pool(
    permission_context: PermissionContext,
    simple_mode: bool = True,
    keyword_hints: Optional[list[str]] = None,
) -> ToolPool:
    """
    Assemble a tool pool based on permissions and context.
    
    Args:
        permission_context: Controls which tools are accessible
        simple_mode: If True, only include simple_mode tools
        keyword_hints: Keywords from prompt to boost relevant tools
    """
    filtered = []
    
    for tool in ALL_TOOLS:
        # Permission check
        if not permission_context.can_use(tool.name):
            continue
        # Simple mode check
        if simple_mode and not tool.simple_mode:
            continue
        filtered.append(tool)
    
    # Reorder based on keyword hints (boost matching tools to top)
    if keyword_hints:
        hints_lower = {h.lower() for h in keyword_hints}
        boosted = []
        rest = []
        for tool in filtered:
            if any(h in tool.name.lower() or h in tool.description.lower() for h in hints_lower):
                boosted.append(tool)
            else:
                rest.append(tool)
        filtered = boosted + rest
    
    return ToolPool(
        tools=tuple(filtered),
        permission_context=permission_context,
        simple_mode=simple_mode,
    )


def extract_keyword_hints(prompt: str) -> list[str]:
    """
    Extract keywords from prompt that hint at which tools might be useful.
    Deterministic pre-routing before LLM decides.
    """
    hints = []
    prompt_lower = prompt.lower()
    
    keyword_map = {
        "search": ["search", "find", "look", "query", "show me"],
        "create": ["create", "add", "save", "capture", "new seed", "new idea"],
        "rate": ["rate", "score", "rate", "rating", "stars"],
        "briefing": ["briefing", "daily", "overview", "summary today"],
        "web": ["search web", "google", "look up", "find online", "what is"],
        "detail": ["detail", "tell me about", "explain", "what is this seed"],
        "recent": ["recent", "latest", "last", "new seeds"],
        "filter": ["filter", "domain", "energy", "tag"],
    }
    
    for hint_key, trigger_words in keyword_map.items():
        if any(tw in prompt_lower for tw in trigger_words):
            hints.append(hint_key)
    
    return hints
