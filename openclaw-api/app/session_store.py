"""
session_store.py — Chat session persistence.

Stores session snapshots for debugging, replay, and audit trails.
Based on claw-code's persist_session() pattern.
"""

from __future__ import annotations
import json
import os
import datetime
from typing import Optional

from app.models_frozen import SessionSnapshot, SessionEvent

STORAGE_DIR = os.environ.get("SESSION_STORAGE_DIR", "/root/.openclaw/workspace/sessions")


def _ensure_dir():
    os.makedirs(STORAGE_DIR, exist_ok=True)


def save_session(snapshot: SessionSnapshot) -> str:
    """
    Persist a session snapshot to disk.
    Returns the file path.
    """
    _ensure_dir()
    date_str = snapshot.start_time[:10]  # YYYY-MM-DD
    filename = f"{date_str}_{snapshot.session_id[:8]}.json"
    filepath = os.path.join(STORAGE_DIR, filename)

    data = {
        "session_id": snapshot.session_id,
        "user_id": snapshot.user_id,
        "tenant_id": snapshot.tenant_id,
        "prompt": snapshot.prompt,
        "events": [
            {"timestamp": e.timestamp, "kind": e.kind, "name": e.name, "data": e.data}
            for e in snapshot.events
        ],
        "tools_called": list(snapshot.tools_called),
        "start_time": snapshot.start_time,
        "end_time": snapshot.end_time,
        "status": snapshot.status,
    }

    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return filepath


def load_session(session_id: str) -> Optional[SessionSnapshot]:
    """Load a session snapshot by ID."""
    _ensure_dir()
    for filename in os.listdir(STORAGE_DIR):
        if session_id[:8] in filename:
            filepath = os.path.join(STORAGE_DIR, filename)
            with open(filepath) as f:
                data = json.load(f)
            return SessionSnapshot(
                session_id=data["session_id"],
                user_id=data["user_id"],
                tenant_id=data["tenant_id"],
                prompt=data["prompt"],
                events=tuple(
                    SessionEvent(timestamp=e["timestamp"], kind=e["kind"], name=e["name"], data=e["data"])
                    for e in data["events"]
                ),
                tools_called=tuple(data["tools_called"]),
                start_time=data["start_time"],
                end_time=data["end_time"],
                status=data.get("status", "completed"),
            )
    return None


def list_sessions(tenant_id: str, limit: int = 10) -> list[dict]:
    """List recent sessions for a tenant."""
    _ensure_dir()
    sessions = []
    for filename in sorted(os.listdir(STORAGE_DIR), reverse=True):
        if not filename.endswith(".json"):
            continue
        filepath = os.path.join(STORAGE_DIR, filename)
        try:
            with open(filepath) as f:
                data = json.load(f)
            if data.get("tenant_id") == tenant_id:
                sessions.append({
                    "session_id": data["session_id"],
                    "prompt": data["prompt"][:100],
                    "start_time": data["start_time"],
                    "status": data.get("status", "completed"),
                    "tools_called": data.get("tools_called", []),
                })
                if len(sessions) >= limit:
                    break
        except (json.JSONDecodeError, KeyError):
            continue
    return sessions


class SessionRecorder:
    """
    Context manager for recording a chat session.
    
    Usage:
        async with SessionRecorder(user_id, tenant_id, prompt) as recorder:
            recorder.event("tool_call", "search_seeds", query)
            result = await execute_tool(...)
            recorder.event("tool_result", "search_seeds", result[:200])
    """
    
    def __init__(self, user_id: str, tenant_id: str, prompt: str):
        import uuid
        self.session_id = str(uuid.uuid4())
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.prompt = prompt
        self.events: list[SessionEvent] = []
        self.tools_called: list[str] = []
        self.start_time = datetime.datetime.now().isoformat()
        self.status = "active"
    
    def event(self, kind: str, name: str, data: str = ""):
        """Record a session event."""
        self.events.append(SessionEvent(
            timestamp=datetime.datetime.now().isoformat(),
            kind=kind,
            name=name,
            data=data[:500],
        ))
        if kind == "tool_call" and name not in self.tools_called:
            self.tools_called.append(name)
    
    def snapshot(self) -> SessionSnapshot:
        """Create an immutable snapshot."""
        return SessionSnapshot(
            session_id=self.session_id,
            user_id=self.user_id,
            tenant_id=self.tenant_id,
            prompt=self.prompt,
            events=tuple(self.events),
            tools_called=tuple(self.tools_called),
            start_time=self.start_time,
            end_time=datetime.datetime.now().isoformat(),
            status=self.status,
        )
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.status = "error"
            self.event("error", str(exc_type.__name__), str(exc_val)[:200])
        snapshot = self.snapshot()
        save_session(snapshot)
        return False
