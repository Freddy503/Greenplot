"""
Session Compaction — Summarize old messages to reduce context size.

Inspired by claw-code's compact.rs pattern:
- Preserve recent N messages verbatim
- Summarize older messages into a structured summary
- Merge with prior compaction summaries

Usage:
    config = CompactionConfig(preserve_recent=10, max_tokens=8000)
    if should_compact(session, config):
        result = compact_session(session, config)
        # result.summary — human-readable summary
        # result.compacted_session — new session with summary + recent messages
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from app.agent.session import Session, Message, ContentBlock, BlockKind


@dataclass
class CompactionConfig:
    """Configuration for session compaction.

    Attributes:
        preserve_recent: Number of recent messages to keep verbatim.
        max_tokens: Token threshold to trigger compaction (estimated).
    """
    preserve_recent: int = 10
    max_tokens: int = 8000


@dataclass
class CompactionResult:
    """Result of session compaction.

    Attributes:
        summary: Human-readable summary of removed messages.
        compacted_session: New session with system summary + recent messages.
        removed_count: Number of messages removed by compaction.
    """
    summary: str
    compacted_session: Session
    removed_count: int


def estimate_tokens(session: Session) -> int:
    """
    Rough token estimate for a session.

    Uses the approximation: 1 token ≈ 4 characters.

    Args:
        session: The session to estimate.

    Returns:
        Approximate token count.
    """
    total_chars = 0
    for msg in session.messages:
        for block in msg.content:
            if block.text:
                total_chars += len(block.text)
            if block.tool_input:
                total_chars += len(str(block.tool_input))
            if block.tool_output:
                total_chars += len(block.tool_output)
    return total_chars // 4


def should_compact(session: Session, config: CompactionConfig) -> bool:
    """
    Determine if a session needs compaction.

    Args:
        session: The session to check.
        config: Compaction configuration.

    Returns:
        True if the session exceeds token limits or has too many messages.
    """
    if len(session.messages) <= config.preserve_recent:
        return False
    return estimate_tokens(session) > config.max_tokens


def summarize_messages(messages: list[Message]) -> str:
    """
    Build a structured summary of messages.

    Produces a summary with:
    - Scope (message counts by role)
    - Tools mentioned
    - Recent user requests (last 3)
    - Pending work (keywords: todo, next, pending, follow up, remaining)
    - Key timeline (truncated block summaries, 160 chars)

    Args:
        messages: Messages to summarize.

    Returns:
        Formatted summary string.
    """
    parts: list[str] = []

    # ── Scope ─────────────────────────────────────────────────────
    role_counts: dict[str, int] = {}
    for msg in messages:
        role_counts[msg.role] = role_counts.get(msg.role, 0) + 1

    scope_lines = [f"- {role}: {count}" for role, count in role_counts.items()]
    parts.append("## Scope\n\n" + "\n".join(scope_lines))

    # ── Tools Mentioned ───────────────────────────────────────────
    tools_used: set[str] = set()
    for msg in messages:
        for block in msg.content:
            if block.kind == BlockKind.TOOL_USE and block.tool_name:
                tools_used.add(block.tool_name)

    if tools_used:
        tools_str = ", ".join(sorted(tools_used))
        parts.append(f"## Tools Used\n\n{tools_str}")

    # ── Recent User Requests (last 3) ─────────────────────────────
    user_texts = [msg.text for msg in messages if msg.role == "user" and msg.text]
    recent_requests = user_texts[-3:] if user_texts else []
    if recent_requests:
        req_lines = [f"- {req[:160]}" for req in recent_requests]
        parts.append("## Recent User Requests\n\n" + "\n".join(req_lines))

    # ── Pending Work ──────────────────────────────────────────────
    pending_keywords = re.compile(
        r'\b(todo|next|pending|follow\s*up|remaining)\b', re.IGNORECASE
    )
    pending_items: list[str] = []
    for msg in messages:
        for block in msg.content:
            if block.text and pending_keywords.search(block.text):
                # Extract the sentence or line containing the keyword
                for line in block.text.split("\n"):
                    if pending_keywords.search(line):
                        pending_items.append(line.strip()[:160])
                        if len(pending_items) >= 5:
                            break
            if len(pending_items) >= 5:
                break

    if pending_items:
        pend_lines = [f"- {item}" for item in pending_items]
        parts.append("## Pending Work\n\n" + "\n".join(pend_lines))

    # ── Key Timeline ──────────────────────────────────────────────
    timeline: list[str] = []
    for msg in messages:
        text = msg.text[:160] if msg.text else ""
        if text:
            timeline.append(f"[{msg.role}]: {text}")

    if timeline:
        # Show first few and last few for context
        if len(timeline) > 10:
            shown = timeline[:5] + ["..."] + timeline[-3:]
        else:
            shown = timeline
        parts.append("## Key Timeline\n\n" + "\n".join(shown))

    return "\n\n".join(parts)


def merge_summaries(existing: Optional[str], new: str) -> str:
    """
    Merge an existing compaction summary with a new one.

    Args:
        existing: Previous compaction summary (or None).
        new: New summary to merge.

    Returns:
        Combined summary string.
    """
    if not existing:
        return new
    return f"{existing}\n\n---\n\n## Earlier Compaction\n\n{new}"


def format_summary(summary: str) -> str:
    """
    Format a summary with clear section headers.

    If the summary already contains ## headers, returns as-is.
    Otherwise wraps it in a Summary section.

    Args:
        summary: Raw summary text.

    Returns:
        Formatted summary string.
    """
    if "## " in summary:
        return summary
    return f"## Conversation Summary\n\n{summary}"


def compact_session(
    session: Session,
    config: Optional[CompactionConfig] = None,
) -> CompactionResult:
    """
    Compact a session by summarizing old messages.

    Inspired by claw-code's compact_session:
    1. Split messages into old (to summarize) and recent (keep verbatim)
    2. Summarize old messages
    3. Merge with any existing compaction summary
    4. Build new session with system summary + recent messages

    Args:
        session: The session to compact.
        config: Compaction configuration (uses defaults if None).

    Returns:
        CompactionResult with summary, compacted session, and removed count.
    """
    if config is None:
        config = CompactionConfig()

    if len(session.messages) <= config.preserve_recent:
        # Nothing to compact
        return CompactionResult(
            summary=session._compaction_summary or "",
            compacted_session=session,
            removed_count=0,
        )

    # Split into old and recent
    old_messages = session.messages[:-config.preserve_recent]
    recent_messages = session.messages[-config.preserve_recent:]
    removed_count = len(old_messages)

    # Summarize the old messages
    new_summary = summarize_messages(old_messages)

    # Merge with existing compaction summary if present
    merged = merge_summaries(session._compaction_summary, new_summary)
    formatted = format_summary(merged)

    # Build new session: system message with summary + recent messages
    compacted = Session(session_id=session.session_id)
    compacted.add(Message("system", [ContentBlock.text(formatted)]))
    for msg in recent_messages:
        compacted.add(msg)
    compacted._compaction_summary = formatted

    return CompactionResult(
        summary=formatted,
        compacted_session=compacted,
        removed_count=removed_count,
    )
