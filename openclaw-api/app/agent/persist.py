"""
Session Persistence — Postgres-backed session storage.

Stores full ChatSession records with ContentBlock JSON messages.
Uses SQLAlchemy models from app.models and the Session/Message types
from app.agent.session for serialization.

Usage:
    store = ChatSessionStore(db)
    await store.save(session_id, messages, tenant_id, user_id, title="Chat")
    messages = await store.load(session_id)
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatSession
from app.agent.session import Session, Message


class ChatSessionStore:
    """
    Postgres-backed session store using SQLAlchemy async sessions.

    Persists conversation sessions as ChatSession rows with full
    ContentBlock JSON messages and optional compaction summaries.

    Usage:
        store = ChatSessionStore(db_session)
        await store.save(session_id="abc", messages=session.messages, ...)
        loaded = await store.load("abc")
    """

    def __init__(self, db: AsyncSession) -> None:
        """
        Args:
            db: An active SQLAlchemy AsyncSession.
        """
        self._db = db

    async def save(
        self,
        session_id: str,
        messages: list[Message],
        tenant_id: str,
        user_id: str,
        title: Optional[str] = None,
        compaction_summary: Optional[str] = None,
    ) -> str:
        """
        Create or update a chat session.

        If a session with the given session_id exists, updates its messages,
        title, and compaction summary. Otherwise creates a new row.

        Args:
            session_id: Unique session identifier (UUID string).
            messages: List of Message objects with ContentBlock content.
            tenant_id: Tenant UUID string for isolation.
            user_id: User UUID string.
            title: Optional human-readable session title.
            compaction_summary: Optional compaction summary text.

        Returns:
            The session_id string.
        """
        now = datetime.utcnow()
        messages_json = [m.to_dict() for m in messages]

        # Try to find existing session
        stmt = select(ChatSession).where(ChatSession.id == uuid.UUID(session_id))
        result = await self._db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.messages = messages_json
            existing.updated_at = now
            if title is not None:
                existing.title = title
            if compaction_summary is not None:
                existing.compaction_summary = compaction_summary
        else:
            record = ChatSession(
                id=uuid.UUID(session_id),
                tenant_id=uuid.UUID(tenant_id),
                user_id=uuid.UUID(user_id),
                title=title,
                messages=messages_json,
                compaction_summary=compaction_summary,
                created_at=now,
                updated_at=now,
            )
            self._db.add(record)

        await self._db.flush()
        return session_id

    async def load(self, session_id: str) -> Optional[list[Message]]:
        """
        Load messages for a session.

        Args:
            session_id: The session UUID string.

        Returns:
            List of Message objects, or None if session not found.
        """
        stmt = select(ChatSession).where(ChatSession.id == uuid.UUID(session_id))
        result = await self._db.execute(stmt)
        record = result.scalar_one_or_none()

        if record is None:
            return None

        return [Message.from_dict(m) for m in (record.messages or [])]

    async def load_session(self, session_id: str) -> Optional[Session]:
        """
        Load a full Session object with metadata.

        Args:
            session_id: The session UUID string.

        Returns:
            Session object, or None if not found.
        """
        stmt = select(ChatSession).where(ChatSession.id == uuid.UUID(session_id))
        result = await self._db.execute(stmt)
        record = result.scalar_one_or_none()

        if record is None:
            return None

        messages = [Message.from_dict(m) for m in (record.messages or [])]
        session = Session(messages=messages, session_id=str(record.id))
        if record.compaction_summary:
            session._compaction_summary = record.compaction_summary
        return session

    async def list_sessions(
        self,
        tenant_id: str,
        user_id: str,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """
        List session summaries for a user, ordered by most recent.

        Args:
            tenant_id: Tenant UUID string.
            user_id: User UUID string.
            limit: Maximum number of sessions to return.

        Returns:
            List of dicts with id, title, created_at, message_count.
        """
        stmt = (
            select(ChatSession)
            .where(
                ChatSession.tenant_id == uuid.UUID(tenant_id),
                ChatSession.user_id == uuid.UUID(user_id),
            )
            .order_by(ChatSession.updated_at.desc())
            .limit(limit)
        )
        result = await self._db.execute(stmt)
        records = result.scalars().all()

        summaries = []
        for record in records:
            message_count = len(record.messages) if record.messages else 0
            summaries.append({
                "id": str(record.id),
                "title": record.title,
                "created_at": record.created_at.isoformat() if record.created_at else None,
                "message_count": message_count,
            })
        return summaries

    async def delete(self, session_id: str) -> bool:
        """
        Delete a chat session.

        Args:
            session_id: The session UUID string.

        Returns:
            True if deleted, False if not found.
        """
        stmt = sa_delete(ChatSession).where(ChatSession.id == uuid.UUID(session_id))
        result = await self._db.execute(stmt)
        await self._db.flush()
        return result.rowcount > 0
