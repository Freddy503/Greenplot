"""
API key management — per-user gp_live_... keys for MCP / programmatic access.

Spec: docs/specs/mcp-server-v2.md (milestone 2). Only the sha256 hash is
stored; the plaintext key is returned exactly once at mint time. Keys are
accepted everywhere a JWT is (app.auth resolves the gp_live_ prefix), so they
also work as GREENPLOT_TOKEN for the stdio MCP server.
"""

import hashlib
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, API_KEY_PREFIX
from app.database import get_db
from app.models import ApiKey, User

router = APIRouter(prefix="/api/v1/api-keys", tags=["api-keys"])

MAX_KEYS_PER_USER = 10


class ApiKeyCreate(BaseModel):
    name: Optional[str] = None


def _serialize(k: ApiKey) -> dict:
    return {
        "id": str(k.id),
        "name": k.name,
        "prefix": k.prefix,
        "created_at": k.created_at.isoformat() if k.created_at else None,
        "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
    }


@router.get("")
def list_api_keys(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    keys = (db.query(ApiKey)
            .filter(ApiKey.user_id == user.id, ApiKey.revoked == False)  # noqa: E712
            .order_by(ApiKey.created_at.desc()).all())
    return {"keys": [_serialize(k) for k in keys]}


@router.post("")
def create_api_key(req: ApiKeyCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    active = (db.query(ApiKey)
              .filter(ApiKey.user_id == user.id, ApiKey.revoked == False)  # noqa: E712
              .count())
    if active >= MAX_KEYS_PER_USER:
        raise HTTPException(status_code=400, detail=f"Key limit reached ({MAX_KEYS_PER_USER}) — revoke one first")

    plaintext = API_KEY_PREFIX + secrets.token_hex(24)
    key = ApiKey(
        user_id=user.id,
        name=(req.name or "MCP key").strip()[:100] or "MCP key",
        key_hash=hashlib.sha256(plaintext.encode()).hexdigest(),
        prefix=plaintext[:12],  # "gp_live_" + 4 chars, enough to recognize
        scopes=["mcp"],
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    # The only time the plaintext leaves the server.
    return {**_serialize(key), "key": plaintext}


@router.delete("/{key_id}")
def revoke_api_key(key_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    key.revoked = True
    db.commit()
    return {"status": "revoked", "id": str(key.id)}
