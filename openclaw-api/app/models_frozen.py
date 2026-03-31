"""models_frozen — Immutable session models for persistence."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class SessionEvent:
    timestamp: str
    kind: str
    name: str = ""
    data: str = ""


@dataclass(frozen=True)
class SessionSnapshot:
    session_id: str
    user_id: str
    tenant_id: str
    prompt: str
    events: tuple[SessionEvent, ...] = ()
    tools_called: tuple[str, ...] = ()
    start_time: str = ""
    end_time: str = ""
    status: str = "completed"
