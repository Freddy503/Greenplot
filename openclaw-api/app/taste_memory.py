"""
taste_memory.py
Persists user preference signals across chat sessions (gstack /design-shotgun pattern).

Each session can contribute preference observations (architecture choices, domain focus,
accepted/rejected recommendations). Confidence decays 5% per week. The top preferences
are injected into the system prompt to bias future recommendations.
"""
import json
import math
import os
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "taste_memory")
_DECAY_RATE_PER_WEEK = 0.05
_MAX_ENTRIES = 50


def _path(tenant_id: str) -> str:
    os.makedirs(_DATA_DIR, exist_ok=True)
    safe = tenant_id.replace("-", "")[:32]
    return os.path.join(_DATA_DIR, f"{safe}.json")


def _load(tenant_id: str) -> list[dict]:
    try:
        p = _path(tenant_id)
        if os.path.exists(p):
            with open(p) as f:
                return json.load(f)
    except Exception:
        pass
    return []


def _save(tenant_id: str, entries: list[dict]) -> None:
    try:
        with open(_path(tenant_id), "w") as f:
            json.dump(entries, f, indent=2)
    except Exception as e:
        logger.debug(f"[taste_memory] save failed: {e}")


def _decayed_confidence(confidence: float, saved_at: str) -> float:
    """Apply weekly 5% decay from saved_at to now."""
    try:
        dt = datetime.fromisoformat(saved_at)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        weeks = (datetime.now(timezone.utc) - dt).days / 7.0
        return confidence * ((1 - _DECAY_RATE_PER_WEEK) ** weeks)
    except Exception:
        return confidence


def record(tenant_id: str, key: str, value: str, confidence: float = 0.7) -> None:
    """
    Record or update a preference observation.
    If the key already exists, average the confidence with the new signal.
    """
    entries = _load(tenant_id)
    now = datetime.now(timezone.utc).isoformat()

    existing = next((e for e in entries if e.get("key") == key), None)
    if existing:
        existing["value"] = value
        existing["confidence"] = min(1.0, (existing.get("confidence", 0.5) + confidence) / 2)
        existing["updated_at"] = now
    else:
        entries.append({
            "key": key,
            "value": value,
            "confidence": confidence,
            "saved_at": now,
            "updated_at": now,
        })

    # Sort by decayed confidence, keep top N
    entries.sort(
        key=lambda e: _decayed_confidence(e.get("confidence", 0), e.get("saved_at", now)),
        reverse=True,
    )
    _save(tenant_id, entries[:_MAX_ENTRIES])


def get_top(tenant_id: str, n: int = 10) -> list[dict]:
    """Return top-n preferences by current decayed confidence."""
    entries = _load(tenant_id)
    now = datetime.now(timezone.utc).isoformat()
    scored = [
        {**e, "_score": _decayed_confidence(e.get("confidence", 0), e.get("saved_at", now))}
        for e in entries
    ]
    scored.sort(key=lambda x: x["_score"], reverse=True)
    return [{"key": e["key"], "value": e["value"], "confidence": round(e["_score"], 2)} for e in scored[:n]]


def format_for_prompt(tenant_id: str) -> Optional[str]:
    """Format top preferences as a compact prompt section."""
    prefs = get_top(tenant_id)
    if not prefs:
        return None
    lines = [f"- {p['key']}: {p['value']} (confidence {p['confidence']:.0%})" for p in prefs]
    return "**Taste Memory** (learned preferences — bias recommendations accordingly):\n" + "\n".join(lines)


def extract_and_record(tenant_id: str, messages: list[dict]) -> None:
    """
    Lightweight heuristic extraction from the last N messages.
    Looks for acceptance/rejection signals and domain focus.
    Called at session end — never raises.
    """
    try:
        # Collect the last 6 assistant messages for pattern detection
        assistant_msgs = [m for m in messages if m.get("role") == "assistant"][-6:]
        if not assistant_msgs:
            return

        combined = " ".join(str(m.get("content", "")) for m in assistant_msgs)[:3000]

        # Simple heuristic signals — no LLM call to keep this fast
        signals = []

        # Domain signals from the session
        domains = _extract_domains(combined)
        for d in domains[:2]:
            signals.append(("primary_domain", d, 0.6))

        # Tool preference signals
        if "create_seed" in combined or "planted" in combined.lower():
            signals.append(("capture_mode", "active_capture", 0.65))
        if "wiki" in combined.lower() and ("compile" in combined.lower() or "synthesis" in combined.lower()):
            signals.append(("wiki_usage", "synthesis_focused", 0.6))

        for key, value, conf in signals:
            record(tenant_id, key, value, conf)
    except Exception as e:
        logger.debug(f"[taste_memory] extract failed (non-fatal): {e}")


def _extract_domains(text: str) -> list[str]:
    """Very cheap domain keyword extraction."""
    _DOMAIN_KEYWORDS = [
        "AI", "machine learning", "software", "product", "business", "research",
        "medicine", "law", "finance", "design", "engineering", "science",
    ]
    found = []
    tl = text.lower()
    for kw in _DOMAIN_KEYWORDS:
        if kw.lower() in tl:
            found.append(kw)
    return found[:3]
