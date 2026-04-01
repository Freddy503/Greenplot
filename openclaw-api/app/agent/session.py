"""
Session & Content Block Model

Inspired by claw-code's Session + ContentBlock design:
- Typed content blocks (Text / ToolUse / ToolResult) for type-safe message handling
- Session wraps message history with serialization support
- Compaction stub for future context compression

Design decisions:
- ContentBlock uses a tagged-union style (kind field) instead of Python's match
  for broad compatibility (Python 3.10+)
- Session stores messages as dicts for JSON serialization but provides
  typed accessors
- Compaction is stubbed — the algorithm from claw-code (summarize old,
  preserve recent, merge with prior) can be added later
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Optional


# ── Content Blocks ───────────────────────────────────────────────────────────


class BlockKind(str, Enum):
    TEXT = "text"
    TOOL_USE = "tool_use"
    TOOL_RESULT = "tool_result"


@dataclass
class ContentBlock:
    """
    Tagged content block — maps to Anthropic's / OpenAI's message content.

    Usage:
        text = ContentBlock.text("Hello!")
        call = ContentBlock.tool_use("call_1", "search_seeds", {"query": "AI"})
        result = ContentBlock.tool_result("call_1", "search_seeds", '{"results": []}')
    """
    kind: BlockKind
    text: Optional[str] = None
    tool_use_id: Optional[str] = None
    tool_name: Optional[str] = None
    tool_input: Optional[dict[str, Any]] = None
    tool_output: Optional[str] = None
    is_error: bool = False

    @classmethod
    def text(cls, content: str) -> ContentBlock:
        return cls(kind=BlockKind.TEXT, text=content)

    @classmethod
    def tool_use(cls, tool_id: str, name: str, input_data: dict[str, Any]) -> ContentBlock:
        return cls(
            kind=BlockKind.TOOL_USE,
            tool_use_id=tool_id,
            tool_name=name,
            tool_input=input_data,
        )

    @classmethod
    def tool_result(
        cls,
        tool_id: str,
        name: str,
        output: str,
        is_error: bool = False,
    ) -> ContentBlock:
        return cls(
            kind=BlockKind.TOOL_RESULT,
            tool_use_id=tool_id,
            tool_name=name,
            tool_output=output,
            is_error=is_error,
        )

    def to_dict(self) -> dict[str, Any]:
        """Serialize to plain dict (for JSON storage)."""
        d: dict[str, Any] = {"kind": self.kind.value}
        if self.text is not None:
            d["text"] = self.text
        if self.tool_use_id is not None:
            d["tool_use_id"] = self.tool_use_id
        if self.tool_name is not None:
            d["tool_name"] = self.tool_name
        if self.tool_input is not None:
            d["tool_input"] = self.tool_input
        if self.tool_output is not None:
            d["tool_output"] = self.tool_output
        if self.is_error:
            d["is_error"] = True
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> ContentBlock:
        return cls(
            kind=BlockKind(d["kind"]),
            text=d.get("text"),
            tool_use_id=d.get("tool_use_id"),
            tool_name=d.get("tool_name"),
            tool_input=d.get("tool_input"),
            tool_output=d.get("tool_output"),
            is_error=d.get("is_error", False),
        )


# ── Messages ─────────────────────────────────────────────────────────────────


@dataclass
class Message:
    """A single message in the conversation."""
    role: str  # "user" | "assistant" | "tool" | "system"
    content: list[ContentBlock]
    timestamp: float = field(default_factory=time.time)

    @classmethod
    def user(cls, text: str) -> Message:
        return cls(role="user", content=[ContentBlock.text(text)])

    @classmethod
    def assistant(cls, text: str) -> Message:
        return cls(role="assistant", content=[ContentBlock.text(text)])

    @classmethod
    def assistant_with_tools(
        cls,
        text: str,
        tool_calls: list[dict[str, Any]],
    ) -> Message:
        """Assistant message with text + tool use blocks."""
        blocks = []
        if text:
            blocks.append(ContentBlock.text(text))
        for tc in tool_calls:
            fn = tc.get("function", {})
            blocks.append(ContentBlock.tool_use(
                tool_id=tc.get("id", ""),
                name=fn.get("name", "unknown"),
                input_data=json.loads(fn.get("arguments", "{}")) if isinstance(fn.get("arguments"), str) else fn.get("arguments", {}),
            ))
        return cls(role="assistant", content=blocks)

    @classmethod
    def tool_result(cls, tool_id: str, name: str, output: str, is_error: bool = False) -> Message:
        return cls(role="tool", content=[
            ContentBlock.tool_result(tool_id, name, output, is_error),
        ])

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "content": [b.to_dict() for b in self.content],
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Message:
        return cls(
            role=d["role"],
            content=[ContentBlock.from_dict(b) for b in d.get("content", [])],
            timestamp=d.get("timestamp", time.time()),
        )

    # ── Content Accessors ─────────────────────────────────────────

    @property
    def text(self) -> str:
        """Concatenated text from all TEXT blocks."""
        return " ".join(b.text for b in self.content if b.kind == BlockKind.TEXT and b.text)

    @property
    def tool_calls(self) -> list[ContentBlock]:
        """All TOOL_USE blocks."""
        return [b for b in self.content if b.kind == BlockKind.TOOL_USE]

    @property
    def tool_results(self) -> list[ContentBlock]:
        """All TOOL_RESULT blocks."""
        return [b for b in self.content if b.kind == BlockKind.TOOL_RESULT]


# ── Session ──────────────────────────────────────────────────────────────────


class Session:
    """
    Conversation session with typed message history.

    Inspired by claw-code's Session:
    - Stores messages with typed content blocks
    - Supports serialization to/from JSON
    - Provides compaction interface (stub for now)

    Usage:
        session = Session()
        session.add(Message.user("Search for AI ideas"))
        session.add(Message.assistant("Here's what I found..."))
        messages = session.to_llm_messages()  # → list of dicts for API
    """

    def __init__(self, *, messages: Optional[list[Message]] = None, session_id: str = "") -> None:
        self.session_id = session_id
        self.messages: list[Message] = messages or []
        self._compaction_summary: Optional[str] = None

    def add(self, message: Message) -> None:
        """Append a message to the session."""
        self.messages.append(message)

    @property
    def last(self) -> Optional[Message]:
        """Last message, or None if empty."""
        return self.messages[-1] if self.messages else None

    @property
    def length(self) -> int:
        return len(self.messages)

    # ── LLM Format Conversion ─────────────────────────────────────

    def to_llm_messages(self) -> list[dict[str, Any]]:
        """
        Convert to OpenAI-compatible message format.

        This is where we bridge our typed model to the flat dict format
        that OpenAI/Anthropic APIs expect.
        """
        result = []
        for msg in self.messages:
            if msg.role == "tool":
                # Tool result messages need special formatting
                for block in msg.content:
                    if block.kind == BlockKind.TOOL_RESULT:
                        result.append({
                            "role": "tool",
                            "tool_call_id": block.tool_use_id or "",
                            "content": block.tool_output or "",
                        })
            elif msg.role == "assistant":
                has_tool_calls = any(b.kind == BlockKind.TOOL_USE for b in msg.content)
                if has_tool_calls:
                    # Assistant message with tool calls
                    tool_calls = []
                    for block in msg.content:
                        if block.kind == BlockKind.TOOL_USE:
                            tool_calls.append({
                                "id": block.tool_use_id or "",
                                "type": "function",
                                "function": {
                                    "name": block.tool_name or "unknown",
                                    "arguments": json.dumps(block.tool_input or {}),
                                },
                            })
                    result.append({
                        "role": "assistant",
                        "content": msg.text or None,
                        "tool_calls": tool_calls,
                    })
                else:
                    result.append({
                        "role": "assistant",
                        "content": msg.text,
                    })
            else:
                result.append({
                    "role": msg.role,
                    "content": msg.text,
                })
        return result

    # ── Serialization ─────────────────────────────────────────────

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "messages": [m.to_dict() for m in self.messages],
            "compaction_summary": self._compaction_summary,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Session:
        return cls(
            messages=[Message.from_dict(m) for m in d.get("messages", [])],
            session_id=d.get("session_id", ""),
        )

    # ── Compaction (stub) ─────────────────────────────────────────

    def compact(self, *, keep_recent: int = 10, max_summary_tokens: int = 500) -> str:
        """
        Compact session by summarizing old messages.

        Inspired by claw-code's compact_session:
        - Preserve recent N messages verbatim
        - Summarize older messages
        - Store summary for merge with future compactions

        Returns the compaction summary. Full implementation pending —
        this is the interface contract.
        """
        if len(self.messages) <= keep_recent:
            return self._compaction_summary or ""

        old = self.messages[:-keep_recent]
        recent = self.messages[-keep_recent:]

        # Build a text summary of old messages
        summary_parts = []
        for msg in old:
            if msg.text:
                summary_parts.append(f"[{msg.role}]: {msg.text[:200]}")

        new_summary = "\n".join(summary_parts[:20])  # Cap at 20 excerpts

        # Merge with previous compaction summary
        if self._compaction_summary:
            new_summary = (
                f"{self._compaction_summary}\n\n"
                f"--- Earlier conversation ---\n{new_summary}"
            )

        # Insert summary as a system message at the front
        self.messages = [Message("system", [ContentBlock.text(new_summary)])] + recent
        self._compaction_summary = new_summary

        return new_summary
