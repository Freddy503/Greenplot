"""
supabase_auth.py — Validate Supabase JWTs in FastAPI.

Replaces custom JWT auth. FastAPI just verifies the token;
Supabase handles registration, login, password reset, email verification.
"""

import os
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://kpdxrpeuzwzilonvjzcy.supabase.co")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")

# Supabase JWTs use HS256 with the project's JWT secret
security = HTTPBearer(auto_error=False)


def get_supabase_jwt_secret() -> str:
    """Get JWT secret from Supabase project settings."""
    if SUPABASE_JWT_SECRET:
        return SUPABASE_JWT_SECRET
    # Fallback: fetch from Supabase API (needs service_role key)
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="SUPABASE_JWT_SECRET not configured"
    )


def verify_supabase_token(token: str) -> dict:
    """Verify a Supabase JWT and return the payload."""
    try:
        payload = jwt.decode(
            token,
            get_supabase_jwt_secret(),
            algorithms=["HS256"],
            options={"verify_aud": False}  # Supabase uses custom aud
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_current_supabase_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """
    FastAPI dependency: extract and verify Supabase JWT.
    Returns dict with: sub (user_id), email, role, tenant metadata.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="No token provided")
    
    payload = verify_supabase_token(credentials.credentials)
    
    if payload.get("role") != "authenticated":
        raise HTTPException(status_code=403, detail="Not authenticated")
    
    return {
        "id": payload["sub"],
        "email": payload.get("email", ""),
        "role": payload.get("role", ""),
        "tenant_id": payload["sub"],  # Supabase user_id IS the tenant_id
    }


async def get_optional_supabase_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict | None:
    """Like get_current_supabase_user but returns None if no token."""
    if not credentials:
        return None
    try:
        return await get_current_supabase_user(credentials)
    except HTTPException:
        return None
