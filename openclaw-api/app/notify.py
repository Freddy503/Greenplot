"""Standalone notification helper usable from the worker (no FastAPI import).

Appends a per-user notification to the shared bell store that the API serves at
GET /api/v1/push/notifications, and best-effort fires a Web Push. The api and
enrichment-worker containers share the `./data:/app/data` volume, so the JSON
store is the same files for both. (VAPID keys come from env.)
"""
import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

_DATA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_NOTIFS_FILE = os.path.join(_DATA, "push_notifications.json")
_SUBS_FILE = os.path.join(_DATA, "push_subscriptions.json")


def notify_user(user_id, title: str, body: str, url: str = "/chat") -> None:
    """Bell notification (always) + best-effort Web Push."""
    uid = str(user_id)
    try:
        os.makedirs(_DATA, exist_ok=True)
        try:
            with open(_NOTIFS_FILE) as f:
                notifs = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            notifs = []
        notifs.append({
            "id": f"paper_{uid[:8]}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "user_id": uid, "title": title, "body": body[:160], "url": url,
            "prompt": "", "timestamp": datetime.utcnow().isoformat(), "read": False,
        })
        with open(_NOTIFS_FILE, "w") as f:
            json.dump(notifs[-200:], f, indent=2)
    except Exception as e:
        logger.warning(f"[notify] bell write failed: {e}")
    try:
        _web_push(uid, title, body, url)
    except Exception as e:
        logger.info(f"[notify] web push skipped: {e}")


def _web_push(uid: str, title: str, body: str, url: str) -> None:
    from app.config import settings
    pem = getattr(settings, "VAPID_PRIVATE_KEY", None) or os.environ.get("VAPID_PRIVATE_KEY")
    if not pem:
        return
    try:
        import base64
        from cryptography.hazmat.primitives import serialization
        # PEM → raw base64url private key (pywebpush wants the raw key)
        key = serialization.load_pem_private_key(pem.encode(), password=None)
        raw = key.private_numbers().private_value.to_bytes(32, "big")
        vapid_key = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    except Exception:
        return
    try:
        with open(_SUBS_FILE) as f:
            subs = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return
    payload = json.dumps({"title": title, "body": body[:120], "url": url, "prompt": ""})
    from pywebpush import webpush
    for entry in subs:
        if str(entry.get("user_id", "")) != uid:
            continue
        info = entry.get("subscription", {})
        if not info.get("endpoint"):
            continue
        try:
            contact = os.environ.get("CONTACT_EMAIL", "")
            claims = {"sub": f"mailto:{contact}"} if contact else {}
            webpush(subscription_info=info, data=payload, vapid_private_key=vapid_key,
                    vapid_claims=claims)
        except Exception:
            pass
