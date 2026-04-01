"""
Seedify Agent Module

Refactored agent architecture inspired by claw-code's trait-based design:

- registry.py    — Declarative ToolRegistry with JSON Schema validation
- session.py     — Session & ContentBlock model for message history
- agent.py       — SeedifyAgent loop: send -> parse -> execute -> repeat
- stream.py      — Typed event generator for SSE/NDJSON streaming
- permissions.py — Simplified read/write/admin permission model
- subagents.py   — Typed sub-agents with per-type tool restrictions

Usage:
    from app.agent import SeedifyAgent, ToolRegistry, Session
    from app.agent.subagents import SubagentRunner, SubagentType
"""
from app.agent.registry import ToolRegistry, ToolSpec
from app.agent.session import Session, ContentBlock
from app.agent.agent import SeedifyAgent
from app.agent.stream import AgentEvent, AgentEventType
from app.agent.permissions import PermissionLevel, check_permission
from app.agent.subagents import SubagentRunner, SubagentType

__all__ = [
    "SeedifyAgent",
    "ToolRegistry",
    "ToolSpec",
    "Session",
    "ContentBlock",
    "AgentEvent",
    "AgentEventType",
    "PermissionLevel",
    "check_permission",
    "SubagentRunner",
    "SubagentType",
]
