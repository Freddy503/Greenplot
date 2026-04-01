"""
Typed Event Stream

Inspired by claw-code's AssistantEvent enum + generator streaming pattern.

Instead of scattered yield json.dumps(...) calls, we emit typed events
and serialize once. This makes the agent loop testable and the stream
format swappable (NDJSON, SSE, WebSocket).

Design decisions:
- AgentEvent is a simple dataclass with a type tag — works with JSON,
  MessagePack, or any serializer
- AgentEventType is a string enum for easy frontend parsing
- No framework dependency — pure Python generators
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class AgentEventType(str, Enum):
    """Typed events emitted by the agent loop."""

    # Lifecycle
    STATUS = "status"             # Status text (Thinking... / Searching...)
    DONE = "done"                 # Stream complete
    ERROR = "error"               # Fatal error

    # Content
    CONTENT = "content"           # Text delta from LLM
    TOOL_CALL = "tool_call"       # Tool invocation starting
    TOOL_RESULT = "tool_result"   # Tool execution complete

    # Metadata
    USAGE = "usage"               # Token usage info
    ROUND = "round"               # Agent loop round number


@dataclass
class AgentEvent:
    """
    A single event in the agent's output stream.

    Usage:
        yield AgentEvent.status("Thinking...")
        yield AgentEvent.content("Hello!")
        yield AgentEvent.tool_call("call_1", "search_seeds", '{"query":"AI"}')
        yield AgentEvent.tool_result("call_1", '{"results":[...]}')
        yield AgentEvent.done()
    """
    type: AgentEventType
    data: dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

    # ── Convenience constructors ──────────────────────────────────

    @classmethod
    def status(cls, text: str) -> AgentEvent:
        return cls(type=AgentEventType.STATUS, data={"text": text})

    @classmethod
    def content(cls, text: str) -> AgentEvent:
        return cls(type=AgentEventType.CONTENT, data={"text": text})

    @classmethod
    def tool_call(cls, tool_id: str, name: str, input_preview: str = "") -> AgentEvent:
        return cls(type=AgentEventType.TOOL_CALL, data={
            "id": tool_id,
            "name": name,
            "input": input_preview[:200],
        })

    @classmethod
    def tool_result(cls, tool_id: str, result: str) -> AgentEvent:
        return cls(type=AgentEventType.TOOL_RESULT, data={
            "id": tool_id,
            "result": result[:8000],
        })

    @classmethod
    def error(cls, message: str) -> AgentEvent:
        return cls(type=AgentEventType.ERROR, data={"message": message})

    @classmethod
    def usage(cls, prompt_tokens: int, completion_tokens: int) -> AgentEvent:
        return cls(type=AgentEventType.USAGE, data={
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
        })

    @classmethod
    def round(cls, number: int, max_rounds: int) -> AgentEvent:
        return cls(type=AgentEventType.ROUND, data={
            "number": number,
            "max": max_rounds,
        })

    @classmethod
    def done(cls) -> AgentEvent:
        return cls(type=AgentEventType.DONE)

    # ── Serialization ─────────────────────────────────────────────

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"type": self.type.value, **self.data}
        return d

    def to_ndjson(self) -> str:
        """Serialize to NDJSON line (newline-delimited JSON)."""
        return json.dumps(self.to_dict(), ensure_ascii=False) + "\n"

    def to_sse(self) -> str:
        """Serialize to SSE format."""
        return f"data: {json.dumps(self.to_dict(), ensure_ascii=False)}\n\n"
