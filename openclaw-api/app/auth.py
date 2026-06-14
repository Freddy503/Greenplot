import hashlib
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.database import get_db
from sqlalchemy.orm import Session
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/login", auto_error=False)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def get_password_hash(pw: str) -> str:
    return pwd_context.hash(pw)

def create_access_token(data: dict, expires_minutes: int = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def _pw_fingerprint(password_hash: str) -> str:
    # Bind a reset token to the current password — once it changes, the token dies.
    return hashlib.sha256((password_hash or "").encode()).hexdigest()[:16]

def create_password_reset_token(user, expires_minutes: int = 60) -> str:
    payload = {
        "sub": str(user.id),
        "purpose": "pwreset",
        "pwf": _pw_fingerprint(user.password_hash),
        "exp": datetime.utcnow() + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def verify_password_reset_token(token: str, db: Session):
    """Return the User for a valid, unexpired, single-use reset token, else None.
    The token is bound to the password it was issued for, so it can't be reused
    after the password changes."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("purpose") != "pwreset":
        return None
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user or payload.get("pwf") != _pw_fingerprint(user.password_hash):
        return None
    return user

def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

API_KEY_PREFIX = "gp_live_"

def user_from_api_key(token: str, db: Session) -> User:
    """Resolve a gp_live_... API key (MCP / programmatic access) to its user."""
    import hashlib
    from app.models import ApiKey
    key_hash = hashlib.sha256(token.encode()).hexdigest()
    key = db.query(ApiKey).filter(ApiKey.key_hash == key_hash, ApiKey.revoked == False).first()  # noqa: E712
    if not key:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key",
                            headers={"WWW-Authenticate": "Bearer"})
    user = db.query(User).filter(User.id == key.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="API key owner not found")
    key.last_used_at = datetime.utcnow()
    db.commit()
    return user

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if token.startswith(API_KEY_PREFIX):
        return user_from_api_key(token, db)
    payload = decode_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def get_tenant_id(current_user: User = Depends(get_current_user)) -> str:
    return str(current_user.tenant_id)

def get_optional_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Return authenticated user if valid token provided, else raise 401.
    Named 'optional' for legacy reasons — auth is now always required."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if token.startswith(API_KEY_PREFIX):
        return user_from_api_key(token, db)
    payload = decode_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
