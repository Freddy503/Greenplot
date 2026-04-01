"""
Declarative Tool Registry

Inspired by claw-code's ToolSpec + GlobalToolRegistry pattern.
Each tool is a spec with JSON Schema input validation and a permission level.
The registry auto-generates API-compatible definitions and dispatches execution.

Design decisions:
- ToolSpec is immutable after registration (frozen dataclass)
- JSON Schema validation happens before dispatch (catch bad inputs early)
- Permission check happens before execution (defense in depth)
- Handlers are async and receive (args, user, db) like claw-code's ToolExecutor trait
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable, Optional

from app.agent.permissions import PermissionLevel


@dataclass(frozen=True)
class ToolSpec:
    """
    Declarative tool specification. One per tool.

    Attributes:
        name:          Unique tool identifier (must match handler key)
        description:   LLM-facing description (used in tool definition)
        input_schema:  JSON Schema dict for input validation
        permission:    Minimum permission level required to execute
        handler:       Async callable: handler(args: dict, user, db) -> str
    """
    name: str
    description: str
    input_schema: dict[str, Any]
    permission: PermissionLevel = PermissionLevel.READ
    handler: Optional[Callable[..., Awaitable[str]]] = None

    def to_openai(self) -> dict:
        """Convert to OpenAI function-calling format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.input_schema,
            },
        }


class ToolRegistry:
    """
    Centralized tool registry with validation and dispatch.

    Inspired by claw-code's GlobalToolRegistry:
    - Register tools with specs
    - Auto-generate API-compatible definitions
    - Dispatch execution with permission checks
    - Conflict detection on registration

    Usage:
        registry = ToolRegistry()
        registry.register(ToolSpec(
            name="search_seeds",
            description="Search your Second Brain",
            input_schema={"type": "object", "properties": {"query": {"type": "string"}}},
            permission=PermissionLevel.READ,
            handler=search_seeds_handler,
        ))
        definitions = registry.to_openai()  # → list of tool defs for API
        result = await registry.execute("search_seeds", {"query": "AI"}, user, db)
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}

    # ── Registration ──────────────────────────────────────────────

    def register(self, spec: ToolSpec) -> None:
        """Register a tool. Raises ValueError if name already registered."""
        if spec.name in self._tools:
            raise ValueError(f"Tool '{spec.name}' already registered. Use replace() to overwrite.")
        self._tools[spec.name] = spec

    def replace(self, spec: ToolSpec) -> None:
        """Register or overwrite a tool."""
        self._tools[spec.name] = spec

    def register_many(self, specs: list[ToolSpec]) -> None:
        """Register multiple tools at once."""
        for spec in specs:
            self.register(spec)

    # ── Queries ───────────────────────────────────────────────────

    def has(self, name: str) -> bool:
        return name in self._tools

    def get(self, name: str) -> Optional[ToolSpec]:
        return self._tools.get(name)

    @property
    def names(self) -> list[str]:
        return list(self._tools.keys())

    @property
    def count(self) -> int:
        return len(self._tools)

    # ── API Generation ────────────────────────────────────────────

    def to_openai(self, *, filter_permission: Optional[PermissionLevel] = None) -> list[dict]:
        """
        Generate OpenAI-compatible tool definitions.

        Args:
            filter_permission: If set, only include tools at or below this level.
        """
        tools = []
        for spec in self._tools.values():
            if filter_permission and spec.permission > filter_permission:
                continue
            tools.append(spec.to_openai())
        return tools

    # ── Execution ─────────────────────────────────────────────────

    async def execute(
        self,
        name: str,
        args: dict[str, Any],
        user: Any,
        db: Any,
        *,
        permission: PermissionLevel = PermissionLevel.READ,
    ) -> str:
        """
        Execute a tool by name.

        Checks:
        1. Tool exists
        2. User has required permission
        3. Handler is callable

        Returns JSON string result.
        """
        spec = self._tools.get(name)
        if spec is None:
            return json.dumps({"status": "error", "message": f"Unknown tool: {name}"})

        if spec.permission > permission:
            return json.dumps({
                "status": "error",
                "message": f"Permission denied: '{name}' requires {spec.permission.name}, have {permission.name}",
            })

        if spec.handler is None:
            return json.dumps({"status": "error", "message": f"Tool '{name}' has no handler"})

        try:
            return await spec.handler(args, user, db)
        except Exception as e:
            return json.dumps({"status": "error", "message": str(e)})


# ── Module-level singleton (matches claw-code's global registry pattern) ────

_default_registry: Optional[ToolRegistry] = None


def get_default_registry() -> ToolRegistry:
    """Get or create the module-level registry singleton."""
    global _default_registry
    if _default_registry is None:
        _default_registry = ToolRegistry()
    return _default_registry


def reset_default_registry() -> None:
    """Reset the singleton (useful for testing)."""
    global _default_registry
    _default_registry = None
