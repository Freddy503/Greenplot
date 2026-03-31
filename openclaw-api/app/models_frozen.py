"""
models.py — Frozen dataclasses for Seedify.

Immutable by default. Prevents accidental mutation.
Based on claw-code's pattern of frozen dataclasses for everything.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


# ── Tool Models ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ToolDefinition:
    """Immutable tool definition."""
    name: str
    description: str
    parameters: dict
    required_permissions: tuple[str, ...] = ()
    simple_mode: bool = True  # Available in simple/chat mode

    def to_openai(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            }
        }


@dataclass(frozen=True)
class ToolExecution:
    """Result of a tool execution."""
    name: str
    success: bool
    result: str
    latency_ms: int = 0
    error: Optional[str] = None


# ── Enrichment Models ────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Entity:
    """Extracted entity from enrichment."""
    name: str
    type: str  # person, project, concept, org, tool, location
    confidence: float = 0.0


@dataclass(frozen=True)
class Backlink:
    """Connection to another seed."""
    notion_id: str
    title: str
    score: float
    reason: str = ""


@dataclass(frozen=True)
class EnrichmentResult:
    """Result of seed enrichment."""
    summary: str
    tags: tuple[str, ...]
    entities: tuple[Entity, ...]
    domain: str
    energy: str
    backlinks: tuple[Backlink, ...]

    def to_weaviate_properties(self) -> dict:
        import json
        return {
            "summary": self.summary,
            "tags": ", ".join(self.tags),
            "entities": json.dumps([{"name": e.name, "type": e.type, "confidence": e.confidence} for e in self.entities]),
            "domain": self.domain,
            "energy": self.energy,
            "backlinks": json.dumps([{"notion_id": b.notion_id, "title": b.title, "score": b.score, "reason": b.reason} for b in self.backlinks]),
        }


# ── Session Models ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class SessionEvent:
    """Single event in a session."""
    timestamp: str
    kind: str  # tool_call, tool_result, error, message
    name: str
    data: str = ""


@dataclass(frozen=True)
class SessionSnapshot:
    """Full snapshot of a chat session."""
    session_id: str
    user_id: str
    tenant_id: str
    prompt: str
    events: tuple[SessionEvent, ...]
    tools_called: tuple[str, ...]
    start_time: str
    end_time: str
    status: str = "completed"  # completed, error, timeout

    def as_markdown(self) -> str:
        lines = [
            f"# Session {self.session_id}",
            f"User: {self.user_id} | Tenant: {self.tenant_id}",
            f"Time: {self.start_time} → {self.end_time}",
            f"Status: {self.status}",
            "",
            f"## Prompt",
            self.prompt,
            "",
            "## Events",
        ]
        for event in self.events:
            lines.append(f"- [{event.kind}] {event.name}: {event.data[:100]}")
        lines.append("")
        lines.append(f"Tools called: {', '.join(self.tools_called) or 'none'}")
        return "\n".join(lines)


# ── Permission Models ────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PermissionContext:
    """Controls which tools a user can access."""
    tenant_id: str
    role: str = "user"  # user, admin
    blocked_tools: tuple[str, ...] = ()
    allowed_tools: Optional[tuple[str, ...]] = None  # None = all except blocked

    def can_use(self, tool_name: str) -> bool:
        if tool_name in self.blocked_tools:
            return False
        if self.allowed_tools is not None:
            return tool_name in self.allowed_tools
        return True

    @staticmethod
    def admin(tenant_id: str) -> "PermissionContext":
        return PermissionContext(tenant_id=tenant_id, role="admin")

    @staticmethod
    def user(tenant_id: str) -> "PermissionContext":
        return PermissionContext(
            tenant_id=tenant_id,
            role="user",
            blocked_tools=("rate_seed",),  # Users can't rate seeds directly
        )


# ── Usage Models ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class UsageSummary:
    """Token usage tracking."""
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0

    def add(self, input_tokens: int, output_tokens: int, cost: float = 0.0) -> "UsageSummary":
        return UsageSummary(
            input_tokens=self.input_tokens + input_tokens,
            output_tokens=self.output_tokens + output_tokens,
            cost_usd=self.cost_usd + cost,
        )
