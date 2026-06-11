from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID

# Auth
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    city: Optional[str] = None
    nickname: Optional[str] = None
    interests: Optional[List[str]] = None
    digest_frequency: Optional[str] = 'once-daily'
    invite_code: Optional[str] = None
    consents: Optional[Dict[str, Any]] = None  # {enrich, web, calendar, push}
    push_choice: Optional[str] = None  # 'yes' | 'later'

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    tenant_id: UUID

# Thoughts
class ThoughtCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    source: Optional[str] = Field(None, max_length=100)

class ThoughtResponse(BaseModel):
    id: UUID
    content: str
    status: str
    created_at: datetime
    processed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Seeds
class SeedResponse(BaseModel):
    id: UUID
    title: str
    content: str
    image_url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = Field(None, alias='seed_metadata')
    created_at: datetime
    created_by: Optional[str] = None
    created_via: Optional[str] = None
    provenance_log: Optional[List[Dict[str, Any]]] = None
    last_interacted_at: Optional[datetime] = None
    interaction_count: Optional[int] = 0
    tags: Optional[str] = ""
    domain: Optional[str] = ""
    energy: Optional[str] = ""
    summary: Optional[str] = ""

    class Config:
        from_attributes = True
        populate_by_name = True

class SeedSearchResponse(BaseModel):
    seeds: List[SeedResponse]
    query: Optional[str] = None
    total: int

# Spark & Briefing
class SparkResponse(BaseModel):
    text: str

class BriefingResponse(BaseModel):
    text: str
    image_url: Optional[str] = None

# Rating
class RatingRequest(BaseModel):
    message_id: str = Field(..., min_length=1)
    score: int = Field(..., ge=1, le=5)
    consent: bool = False

class RatingResponse(BaseModel):
    id: UUID
    message_id: str
    score: int
    consent: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Usage
class UsageResponse(BaseModel):
    llm_tokens: int
    embedding_tokens: int
    images_generated: int
    vector_operations: int
    date: datetime

    class Config:
        from_attributes = True

# Admin
class HealthResponse(BaseModel):
    status: str
    checks: Dict[str, Any]

class TenantInfo(BaseModel):
    id: UUID
    email: str
    created_at: datetime
    subscription_status: Optional[str] = None

class TenantsListResponse(BaseModel):
    tenants: List[TenantInfo]
    total: int
