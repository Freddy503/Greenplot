"""Lightweight, EU-local product analytics — no third-party tool.

`touch_active` stamps User.last_active_at (throttled) so we can see who actually
returns; `log_event` appends to the UserEvent table for the activation funnel.
Both are best-effort and never raise into the request path.
"""
from datetime import datetime

_THROTTLE_SECONDS = 300  # don't write last_active more than once per 5 min/user


def touch_active(db, user) -> None:
    try:
        now = datetime.utcnow()
        la = getattr(user, "last_active_at", None)
        if la is None or (now - la).total_seconds() > _THROTTLE_SECONDS:
            user.last_active_at = now
            db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


def log_event(db, user_id, event: str, meta: dict | None = None, first_only: bool = False) -> None:
    """Record a product event. If first_only, skip when this user already has one."""
    try:
        from app.models import UserEvent
        if first_only:
            exists = db.query(UserEvent.id).filter(
                UserEvent.user_id == user_id, UserEvent.event == event
            ).first()
            if exists:
                return
        db.add(UserEvent(user_id=user_id, event=event, meta=meta or {}))
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
