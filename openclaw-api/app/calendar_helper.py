"""
Calendar helper — token refresh and shared constants.
"""
from datetime import datetime, timedelta
from typing import Optional
import httpx
import os

from app.config import settings

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


def get_fresh_token(conn, db) -> Optional[str]:
    """Get a valid access token, refreshing proactively 5 min before expiry."""
    buffer = timedelta(minutes=5)
    if conn.token_expiry and conn.token_expiry > datetime.utcnow() + buffer:
        return conn.access_token

    if not conn.refresh_token:
        return None

    # Refresh the token
    resp = httpx.post(GOOGLE_TOKEN_URL, data={
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "refresh_token": conn.refresh_token,
        "grant_type": "refresh_token",
    })

    if resp.status_code != 200:
        return None

    data = resp.json()
    conn.access_token = data.get("access_token")
    expires_in = data.get("expires_in", 3600)
    conn.token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)
    db.commit()
    return conn.access_token
