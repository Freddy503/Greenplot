import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func, or_
from typing import Optional, List
from pydantic import BaseModel, Field
import os
import logging

logger = logging.getLogger(__name__)
import base64
import mimetypes
from app.database import engine, get_db
from app.models import Base, User, Thought, Seed, Usage, CalendarConnection, ChatSession, Rating, WikiArticle
from app.schemas import (
    RegisterRequest, LoginRequest, AuthResponse,
    ThoughtCreate, ThoughtResponse, SeedResponse, SeedSearchResponse,
    SparkResponse, BriefingResponse, UsageResponse, HealthResponse, TenantsListResponse,
    RatingRequest, RatingResponse
)
from app.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, get_tenant_id, get_optional_user
)
from app.config import settings
from app.weaviate_client import weaviate_client
from app.garden_insights import router as garden_insights_router
from app.garden_skimmer import router as garden_skimmer_router
from app.wiki_lint import router as wiki_lint_router
from app.wiki_pipeline import router as wiki_pipeline_router
from app import briefings
from app import email_sender
import httpx
import json
from datetime import datetime, date, timedelta
import uuid
import asyncio

# --- Web Push (VAPID) ---
VAPID_PRIVATE_KEY = None
print("DEBUG: VAPID loading starting...", flush=True)
VAPID_CLAIMS = {"sub": "mailto:contact@example.com"}

# Priority: 1) VAPID_PRIVATE_KEY_BASE64 env var (cleanest for Docker/CI)
#           2) VAPID_PRIVATE_KEY_PATH env var pointing to a PEM file
#           3) Default PEM path alongside the package
_vapid_key_b64 = os.environ.get("VAPID_PRIVATE_KEY_BASE64")
_vapid_key_path = os.environ.get(
    "VAPID_PRIVATE_KEY_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), ".vapid_private.pem")
)
try:
    print(f"DEBUG: _vapid_key_b64 = {_vapid_key_b64[:50] if _vapid_key_b64 else 'EMPTY'}", flush=True)
    if _vapid_key_b64:
        import base64
        print(f"DEBUG: Decoding base64...", flush=True)
        VAPID_PRIVATE_KEY = base64.b64decode(_vapid_key_b64.strip()).decode('utf-8')
        print(f"DEBUG: Decoded key starts with: {VAPID_PRIVATE_KEY[:30]}", flush=True)
        logger.info("✅ VAPID private key loaded from VAPID_PRIVATE_KEY_BASE64 env var")
    elif os.path.exists(_vapid_key_path):
        with open(_vapid_key_path, "r") as f:
            VAPID_PRIVATE_KEY = f.read().strip()
        logger.info(f"✅ VAPID private key loaded from {_vapid_key_path}")
    else:
        logger.warning("⚠️ VAPID private key not found — set VAPID_PRIVATE_KEY_BASE64 env var or place .vapid_private.pem alongside the app")
except Exception as e:
    print(f"DEBUG: Exception in VAPID loading: {e}", flush=True)
    logger.error(f"❌ Failed to load VAPID key: {e}", exc_info=True)

def extract_text(msg: dict) -> str:
    if "content" in msg and msg["content"]:
        return msg["content"]
    parts = []
    for part in msg.get("parts", []):
        if part.get("type") == "text":
            parts.append(part.get("text", ""))
    return "".join(parts)

# Create tables (in production use Alembic)
Base.metadata.create_all(bind=engine)

# Lightweight migration: add columns that didn't exist when tables were first created
with engine.connect() as conn:
    result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='city'"))
    if not result.fetchone():
        conn.execute(text("ALTER TABLE users ADD COLUMN city VARCHAR"))
        conn.commit()
    result2 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='digest_frequency'"))
    if not result2.fetchone():
        conn.execute(text("ALTER TABLE users ADD COLUMN digest_frequency VARCHAR DEFAULT 'once-daily'"))
        conn.commit()
    # Create calendar_connections table if it doesn't exist
    result3 = conn.execute(text("SELECT tablename FROM pg_tables WHERE tablename='calendar_connections'"))
    if not result3.fetchone():
        conn.execute(text("""
            CREATE TABLE calendar_connections (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
                tenant_id UUID NOT NULL,
                provider VARCHAR(32) DEFAULT 'google',
                access_token TEXT,
                refresh_token TEXT,
                token_expiry TIMESTAMP,
                calendar_timezone VARCHAR(64),
                enabled BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX idx_calendar_tenant ON calendar_connections(tenant_id)"))
        conn.commit()

    # Seed visit tracking columns
    result4 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='seeds' AND column_name='last_visited'"))
    if not result4.fetchone():
        conn.execute(text("ALTER TABLE seeds ADD COLUMN last_visited TIMESTAMP"))
        conn.commit()
    result5 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='seeds' AND column_name='visit_count'"))
    if not result5.fetchone():
        conn.execute(text("ALTER TABLE seeds ADD COLUMN visit_count INTEGER DEFAULT 0"))
        conn.commit()
    # Quality scoring + archive columns
    result6 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='seeds' AND column_name='quality_score'"))
    if not result6.fetchone():
        conn.execute(text("ALTER TABLE seeds ADD COLUMN quality_score FLOAT"))
        conn.commit()
    result7 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='seeds' AND column_name='archived'"))
    if not result7.fetchone():
        conn.execute(text("ALTER TABLE seeds ADD COLUMN archived BOOLEAN DEFAULT FALSE"))
        conn.commit()
    # User profile columns: nickname + interests
    result8 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='nickname'"))
    if not result8.fetchone():
        conn.execute(text("ALTER TABLE users ADD COLUMN nickname VARCHAR(100)"))
        conn.commit()
    result9 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='interests'"))
    if not result9.fetchone():
        conn.execute(text("ALTER TABLE users ADD COLUMN interests JSONB DEFAULT '[]'::jsonb"))
        conn.commit()

# --- Sentry ---
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )

# --- HARVEST_API_KEY guard ---
if not settings.HARVEST_API_KEY:
    import sys
    logger.warning("HARVEST_API_KEY not set — harvest endpoints will return 503")

app = FastAPI(title="OpenClaw API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "..", "static"), html=True), name="static")

@app.get("/")
def read_root():
    return FileResponse(os.path.join(os.path.dirname(__file__), "..", "static", "index.html"))

# --- Auth endpoints ---

@app.post("/api/v1/register", response_model=AuthResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=req.email,
        password_hash=get_password_hash(req.password),
        tenant_id=uuid.uuid4(),
        city=req.city,
        nickname=req.nickname,
        interests=req.interests or [],
        digest_frequency=req.digest_frequency or 'once-daily'
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(data={"sub": str(user.id), "tenant_id": str(user.tenant_id)})
    # Also create refresh token if needed; for MVP just return access token
    return AuthResponse(access_token=token, refresh_token=token, tenant_id=user.tenant_id)

@app.post("/api/v1/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(data={"sub": str(user.id), "tenant_id": str(user.tenant_id)})
    return AuthResponse(access_token=token, refresh_token=token, tenant_id=user.tenant_id)

# --- Profile ---

class ProfileUpdate(BaseModel):
    city: Optional[str] = None
    nickname: Optional[str] = None
    interests: Optional[List[str]] = None
    digest_frequency: Optional[str] = None  # twice-daily, once-daily, bi-weekly, weekly, calendar

@app.get("/api/v1/profile")
def get_profile(
    current_user: User = Depends(get_current_user),
):
    return {
        "status": "ok",
        "city": current_user.city or "",
        "email": current_user.email or "",
        "nickname": getattr(current_user, "nickname", "") or "",
        "interests": getattr(current_user, "interests", None) or [],
        "digest_frequency": getattr(current_user, "digest_frequency", "daily") or "daily",
    }

@app.patch("/api/v1/profile")
def update_profile(
    req: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if req.city is not None:
        current_user.city = req.city
    if req.nickname is not None:
        current_user.nickname = req.nickname
    if req.interests is not None:
        current_user.interests = req.interests
    if req.digest_frequency is not None:
        current_user.digest_frequency = req.digest_frequency
    db.commit()
    db.refresh(current_user)
    return {
        "status": "ok",
        "city": current_user.city,
        "nickname": current_user.nickname or "",
        "interests": current_user.interests or [],
        "digest_frequency": current_user.digest_frequency,
    }

# --- Thoughts ---

def _is_valid_thought(content: str) -> bool:
    """Minimal quality gate — rejects noise captures before they enter the PKM."""
    stripped = content.strip()
    if len(stripped) < 20:
        return False
    words = stripped.lower().split()
    unique_ratio = len(set(words)) / max(len(words), 1)
    if unique_ratio < 0.25:
        return False  # >75% repeated words
    return True


@app.post("/api/v1/thoughts", response_model=ThoughtResponse)
def create_thought(
    req: ThoughtCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not _is_valid_thought(req.content):
        raise HTTPException(
            status_code=422,
            detail="Thought too short or too repetitive to be useful. Add more detail."
        )
    thought = Thought(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        content=req.content,
        source=req.source or 'manual',
        status='pending'
    )
    db.add(thought)
    db.commit()
    db.refresh(thought)

    # Enrichment: queue via Redis (non-blocking, processed by task worker)
    try:
        from app.task_broker import enqueue_enrichment
        task_id = enqueue_enrichment(str(thought.id), str(current_user.tenant_id))
        thought.status = 'processing'
    except Exception:
        # Fallback: inline enrichment if Redis is down
        from app.enricher_v2 import enrich_thought_v2
        try:
            result = enrich_thought_v2(str(thought.id), str(current_user.tenant_id), db)
            thought.status = 'processed'
        except Exception as e:
            thought.status = 'error'
            thought.error_message = str(e)
    db.commit()

    return thought

@app.get("/api/v1/thoughts", response_model=list[ThoughtResponse])
def list_thoughts(
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    offset = (page - 1) * limit
    thoughts = db.query(Thought).filter(
        Thought.tenant_id == current_user.tenant_id
    ).order_by(Thought.created_at.desc()).offset(offset).limit(limit).all()
    return thoughts

# --- Seeds ---

@app.get("/api/v1/seeds", response_model=SeedSearchResponse)
def list_seeds(
    query: str = None,
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = str(current_user.tenant_id)

    if query:
        # Check Redis cache first
        from app.cache import get_cached_search, cache_search
        cached = get_cached_search(tenant_id, query)
        if cached is not None:
            return SeedSearchResponse(seeds=cached, total=len(cached))

        # Vector search via Weaviate
        from app.enricher_v2 import embed_text
        embedding = embed_text(query)
        weaviate_hits = weaviate_client.search_seeds(
            tenant_id=tenant_id,
            embedding=embedding,
            limit=limit
        )
        # Try to match Weaviate hits back to Postgres rows to get real created_at
        hit_titles = [h.get("title") for h in weaviate_hits if h.get("title")]
        pg_seeds_map: dict = {}
        if hit_titles:
            try:
                pg_rows = db.query(Seed).filter(
                    Seed.tenant_id == current_user.tenant_id,
                    Seed.title.in_(hit_titles)
                ).all()
                pg_seeds_map = {s.title: s for s in pg_rows}
            except Exception:
                pass

        seeds = []
        for hit in weaviate_hits:
            pg = pg_seeds_map.get(hit.get("title") or "")
            seed = Seed(
                id=pg.id if pg else uuid.uuid4(),
                tenant_id=current_user.tenant_id,
                user_id=current_user.id,
                thought_id=None,
                title=hit.get("title") or "Untitled",
                content=hit.get("content") or "",
                embedding_ref="",
                image_url=None,
                metadata={
                    "summary": hit.get("summary") or "",
                    "tags": hit.get("tags") or "",
                    "domain": hit.get("domain") or "",
                    "energy": hit.get("energy") or "",
                    "source": hit.get("source") or "",
                    "url": hit.get("url") or "",
                },
                created_at=pg.created_at if pg else datetime.utcnow()
            )
            seeds.append(seed)
        cache_search(tenant_id, query, [vars(s) for s in seeds])
        return SeedSearchResponse(seeds=seeds, query=query, total=len(seeds))
    else:
        # Always query Postgres directly — Redis cache reconstruction was causing
        # type errors (string id/created_at, missing new columns) that silently
        # returned empty seed lists to the frontend.
        seeds = db.query(Seed).filter(
            Seed.tenant_id == current_user.tenant_id,
            (Seed.archived == False) | (Seed.archived == None)
        ).order_by(Seed.created_at.desc()).limit(limit).all()

        # Attach metadata fields as convenience attributes for serialization.
        # Normalize tags to str — enricher_v2 stores them as list, schema expects str.
        for seed in seeds:
            metadata = seed.seed_metadata or {}
            raw_tags = metadata.get("tags", "")
            seed.tags = ", ".join(raw_tags) if isinstance(raw_tags, list) else (raw_tags or "")
            seed.domain = metadata.get("domain", "") or ""
            seed.energy = metadata.get("energy", "") or ""
            seed.summary = metadata.get("summary", "") or ""

        return SeedSearchResponse(seeds=seeds, query=None, total=len(seeds))

class SeedSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=5, ge=1, le=20)

@app.post("/api/v1/seeds/search", response_model=SeedSearchResponse)
def search_seeds_endpoint(
    req: SeedSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Semantic search over user's seeds via Weaviate."""
    from app.enricher_v2 import embed_text

    try:
        embedding = embed_text(req.query)
    except Exception as e:
        # Fallback to BM25 if embedding fails
        embedding = None

    if embedding:
        hits = weaviate_client.search_seeds(
            tenant_id=str(current_user.tenant_id),
            embedding=embedding,
            limit=req.limit,
        )
    else:
        hits = []

    seeds = []
    for hit in hits:
        seed = Seed(
            id=uuid.uuid4(),
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            thought_id=None,
            title=hit.get("title") or "Untitled",
            content=hit.get("content") or hit.get("summary") or hit.get("text") or "",
            embedding_ref="",
            image_url=None,
            seed_metadata={
                "summary": hit.get("summary") or "",
                "tags": hit.get("tags") or "",
                "domain": hit.get("domain") or "",
                "energy": hit.get("energy") or "",
                "source": hit.get("source") or "",
                "url": hit.get("url") or "",
            },
            created_at=datetime.utcnow(),
        )
        # Extract metadata fields for visualization
        seed.tags = hit.get("tags") or ""
        seed.domain = hit.get("domain") or ""
        seed.energy = hit.get("energy") or ""
        seed.summary = hit.get("summary") or ""
        seeds.append(seed)

    return SeedSearchResponse(seeds=seeds, query=req.query, total=len(seeds))

@app.get("/api/v1/seeds/{seed_id}", response_model=SeedResponse)
def get_seed(seed_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seed = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        Seed.id == seed_id
    ).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Seed not found")
    
    # Update interaction tracking
    seed.interaction_count = (seed.interaction_count or 0) + 1
    seed.last_interacted_at = datetime.utcnow()
    db.commit()
    
    # Extract metadata fields for richer response
    metadata = seed.seed_metadata or {}
    seed.tags = metadata.get("tags", "")
    seed.domain = metadata.get("domain", "")
    seed.energy = metadata.get("energy", "")
    seed.summary = metadata.get("summary", "")
    
    return seed


@app.delete("/api/v1/seeds/{seed_id}")
def delete_seed(seed_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seed = db.query(Seed).filter(Seed.id == seed_id, Seed.user_id == current_user.id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Seed not found")
    weaviate_ref = seed.embedding_ref or seed_id
    db.delete(seed)
    db.commit()
    try:
        weaviate_client.delete_seed(weaviate_ref)
    except Exception:
        pass  # Postgres deletion always wins; Weaviate is best-effort
    return {"ok": True}


@app.post("/api/v1/seeds/bulk-delete")
def bulk_delete_seeds(body: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seed_ids: list = body.get("seed_ids", [])
    if not seed_ids:
        raise HTTPException(status_code=400, detail="seed_ids required")
    seeds_to_delete = db.query(Seed).filter(
        Seed.id.in_(seed_ids),
        Seed.user_id == current_user.id
    ).all()
    weaviate_refs = [s.embedding_ref or str(s.id) for s in seeds_to_delete]
    deleted = db.query(Seed).filter(
        Seed.id.in_(seed_ids),
        Seed.user_id == current_user.id
    ).delete(synchronize_session=False)
    db.commit()
    for ref in weaviate_refs:
        try:
            weaviate_client.delete_seed(ref)
        except Exception:
            pass
    return {"ok": True, "deleted": deleted}


@app.post("/api/v1/seeds/{seed_id}/archive")
def archive_seed(seed_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seed = db.query(Seed).filter(Seed.id == seed_id, Seed.user_id == current_user.id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Seed not found")
    seed.archived = not seed.archived
    db.commit()
    return {"ok": True, "archived": seed.archived}


@app.post("/api/v1/seeds/fix-titles")
def fix_seed_titles(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Re-generate titles for seeds that have bad/missing titles:
    - Title is 'Untitled Seed', 'Untitled', blank, or null
    - Title is the same as the first 60 chars of content (raw fallback)
    Processes up to 30 seeds per call.
    """
    from app.enricher_v2 import generate_seed as _generate_seed
    from sqlalchemy.orm.attributes import flag_modified

    bad_seeds = db.query(Seed).filter(
        Seed.user_id == current_user.id,
        Seed.content != None,
        or_(
            Seed.title.ilike('Untitled%'),
            Seed.title == '',
            Seed.title == None,
            func.lower(Seed.title).in_(['insight', 'note', 'idea', 'thought', 'observation', 'summary']),
            # Title looks like truncated raw content (hard fallback artefact)
            Seed.title == func.left(Seed.content, 60),
        )
    ).limit(10).all()

    fixed = 0
    errors = []
    for seed in bad_seeds:
        try:
            content = seed.content or ""
            if len(content.strip()) < 20:
                continue
            seed_data = _generate_seed(content[:2000])
            new_title = seed_data.get("title", "").strip()
            if new_title and new_title.lower() not in ("untitled seed", "untitled", ""):
                seed.title = new_title[:200]
                # Also update domain/tags if they were blank
                meta = dict(seed.seed_metadata or {})
                if not meta.get("domain") and seed_data.get("domain"):
                    meta["domain"] = seed_data["domain"]
                if not meta.get("tags") and seed_data.get("tags"):
                    meta["tags"] = seed_data["tags"]
                seed.seed_metadata = meta
                flag_modified(seed, 'seed_metadata')
                fixed += 1
        except Exception as e:
            logger.warning(f"[fix_titles] Failed on seed {seed.id}: {e}")
            errors.append(str(e)[:100])

    db.commit()
    remaining = db.query(Seed).filter(
        Seed.user_id == current_user.id,
        Seed.title.ilike('Untitled%')
    ).count()
    return {"fixed": fixed, "remaining": remaining, "errors": errors[:3]}


class SeedLinksRequest(BaseModel):
    seed_ids: List[str]


class SeedLinkItem(BaseModel):
    source_seed_id: str
    target_seed_id: str
    link_type: str
    confidence: int


class SeedLinksResponse(BaseModel):
    links: List[SeedLinkItem]


@app.post("/api/v1/seeds/links", response_model=SeedLinksResponse)
def get_seed_links(req: SeedLinksRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Return all SeedLink records for the given seed IDs.
    Used by the Knowledge Graph frontend to draw edges from real backlinks.
    """
    from app.models import SeedLink
    from uuid import UUID

    if not req.seed_ids:
        return SeedLinksResponse(links=[])

    # Convert string IDs to UUIDs
    try:
        uuid_ids = [UUID(sid) for sid in req.seed_ids]
    except ValueError:
        return SeedLinksResponse(links=[])

    links = db.query(SeedLink).join(
        Seed, SeedLink.source_seed_id == Seed.id
    ).filter(
        Seed.tenant_id == current_user.tenant_id,
        SeedLink.source_seed_id.in_(uuid_ids)
    ).all()

    # Also get reverse links (where this seed is the target)
    reverse_links = db.query(SeedLink).join(
        Seed, SeedLink.target_seed_id == Seed.id
    ).filter(
        Seed.tenant_id == current_user.tenant_id,
        SeedLink.target_seed_id.in_(uuid_ids)
    ).all()

    all_links = links + reverse_links

    return SeedLinksResponse(links=[
        SeedLinkItem(
            source_seed_id=str(l.source_seed_id),
            target_seed_id=str(l.target_seed_id),
            link_type=l.link_type,
            confidence=l.confidence or 700,
        )
        for l in all_links
    ])



@app.get("/api/v1/seeds/garden/intelligence")
def garden_intelligence(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Garden Intelligence: trending, stale, top-rated, needing attention.
    Gives the Garden page curation and opinion.
    """
    from app.models import SeedLink, Rating
    from datetime import timedelta
    from sqlalchemy import func

    tenant_id = current_user.tenant_id
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    all_seeds = db.query(Seed).filter(Seed.tenant_id == tenant_id).order_by(Seed.created_at.desc()).limit(500).all()
    total = db.query(Seed).filter(Seed.tenant_id == tenant_id).count()

    # ── Trending: most connections created this week ──
    trending_ids = db.query(
        SeedLink.source_seed_id,
        func.count(SeedLink.id).label('link_count')
    ).join(Seed, SeedLink.source_seed_id == Seed.id).filter(
        Seed.tenant_id == tenant_id,
        SeedLink.created_at >= week_ago
    ).group_by(SeedLink.source_seed_id).order_by(
        func.count(SeedLink.id).desc()
    ).limit(5).all()

    trending_seeds = []
    if trending_ids:
        # Batch query: get all trending seeds at once instead of N queries
        trending_id_list = [seed_id for seed_id, _ in trending_ids]
        trending_objects = db.query(Seed).filter(Seed.id.in_(trending_id_list)).all()
        trending_by_id = {str(s.id): s for s in trending_objects}
        for seed_id, count in trending_ids:
            s = trending_by_id.get(str(seed_id))
            if s:
                trending_seeds.append({"id": str(s.id), "title": s.title, "connections": count, "created": s.created_at.isoformat() if s.created_at else ""})

    # ── Stale: oldest, unrated, no recent connections ──
    rated_ids = set()
    try:
        ratings = db.query(Rating.message_id).filter(Rating.tenant_id == tenant_id).all()
        rated_ids = {r[0] for r in ratings}
    except:
        pass

    stale_seeds = []
    for s in sorted(all_seeds, key=lambda x: x.created_at or now):
        if str(s.id) in rated_ids:
            continue
        age_days = (now - s.created_at).days if s.created_at else 999
        if age_days >= 7:
            stale_seeds.append({
                "id": str(s.id),
                "title": s.title,
                "age_days": age_days,
                "source": (s.seed_metadata or {}).get("source", "manual"),
            })
        if len(stale_seeds) >= 5:
            break

    # ── Top rated ──
    top_rated = []
    try:
        top_ratings = db.query(Rating).filter(
            Rating.tenant_id == tenant_id,
            Rating.score >= 4
        ).order_by(Rating.score.desc()).limit(5).all()
        for r in top_ratings:
            top_rated.append({
                "message_id": r.message_id,
                "score": r.score,
                "created": r.created_at.isoformat() if r.created_at else "",
            })
    except:
        pass

    # ── Recent: newest seeds this week ──
    recent_seeds = [s for s in all_seeds if s.created_at and s.created_at >= week_ago]
    recent_seeds.sort(key=lambda x: x.created_at, reverse=True)
    recent_items = [{"id": str(s.id), "title": s.title, "source": (s.seed_metadata or {}).get("source", "manual"),
                      "created": s.created_at.isoformat()} for s in recent_seeds[:5]]

    # ── By source type ──
    source_counts = {}
    for s in all_seeds:
        src = (s.seed_metadata or {}).get("source", "manual")
        source_counts[src] = source_counts.get(src, 0) + 1

    # ── Domain distribution ──
    domain_counts = {}
    for s in all_seeds:
        domain = (s.seed_metadata or {}).get("domain", "")
        if domain:
            domain_counts[domain] = domain_counts.get(domain, 0) + 1

    # ── Needs attention: pending thoughts ──
    pending = db.query(Thought).filter(
        Thought.tenant_id == tenant_id,
        Thought.status == 'pending'
    ).count()

    # ── Connections count ──
    total_connections = db.query(SeedLink).join(Seed, SeedLink.source_seed_id == Seed.id).filter(
        Seed.tenant_id == tenant_id
    ).count()

    return {
        "total_seeds": total,
        "total_connections": total_connections,
        "pending_enrichment": pending,
        "trending": trending_seeds,
        "stale": stale_seeds,
        "top_rated": top_rated,
        "recent": recent_items,
        "sources_breakdown": source_counts,
        "domains": domain_counts,
        "health_score": min(100, int(
            (len(recent_seeds) * 10) +          # recent activity
            (len(trending_seeds) * 5) +          # connections
            (len(top_rated) * 8) -               # engagement
            (len(stale_seeds) * 3) -             # decay penalty
            (pending * 2)                        # pending penalty
        )),
    }


@app.get("/api/v1/activity")
def get_activity_feed(
    limit: int = 20,
    hours: int = 48,
    current_user: User = Depends(get_current_user)
):
    """Get recent system activity: seeds created, sources found, connections made."""
    from app.activity import get_activity_feed as _get_feed
    events = _get_feed(str(current_user.tenant_id), limit=limit, hours=hours)
    return {"events": events, "count": len(events)}


class BulkSeedItem(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1, max_length=5000)
    source: Optional[str] = 'chat_harvest'

class BulkSeedRequest(BaseModel):
    seeds: List[BulkSeedItem]

class BulkSeedResponse(BaseModel):
    created: int
    seed_ids: List[str]

@app.post("/api/v1/seeds/bulk", response_model=BulkSeedResponse)
def create_seeds_bulk(
    req: BulkSeedRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create multiple seeds at once (from harvest / Add to Garden)."""
    seed_ids = []
    for item in req.seeds[:10]:  # Limit to 10 at a time
        seed = Seed(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            title=item.title[:200],
            content=item.content[:5000],
            seed_metadata={"source": item.source or "chat_harvest"},
        )
        db.add(seed)
        db.flush()
        seed_ids.append(str(seed.id))

        # Store in Weaviate (non-blocking)
        try:
            from app.enricher_v2 import embed_text
            embedding = embed_text(f"{item.title} {item.content}")
            weaviate_client.store_seed(
                tenant_id=str(current_user.tenant_id),
                title=item.title,
                content=item.content,
                embedding=embedding,
                metadata={"source": item.source or "chat_harvest"},
            )
        except Exception as e:
            pass  # Weaviate is best-effort for harvested seeds

    db.commit()

    # Activity log
    try:
        from app.activity import log_seed_created
        for item in req.seeds[:10]:
            log_seed_created(str(current_user.tenant_id), item.title, item.source or "chat_harvest")
    except:
        pass

    return BulkSeedResponse(created=len(seed_ids), seed_ids=seed_ids)

# --- Daily Spark & Briefing ---

@app.post("/api/v1/spark", response_model=SparkResponse)
def get_spark(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Contextual creative spark based on recent seeds."""
    # Get a recent seed to reference
    recent = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id
    ).order_by(Seed.created_at.desc()).first()

    if recent:
        spark_text = f"Your latest seed is \"{recent.title}\". What if you combined this with something from a completely different domain? Think about how the core idea could be applied somewhere unexpected."
    else:
        spark_text = "What's one idea from today that surprised you? Capture it as a seed — the best insights come from noticing what you didn't expect."
    return SparkResponse(text=spark_text)

@app.post("/api/v1/briefing", response_model=BriefingResponse)
def get_briefing(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Actionable daily briefing: seeds to review, new sources, connections, suggested actions."""
    from datetime import timedelta
    from app.models import SeedLink

    now = datetime.utcnow()
    today_cutoff = now - timedelta(hours=24)
    week_cutoff = now - timedelta(days=7)
    tenant_id = current_user.tenant_id

    # Seeds to review (oldest unreviewed)
    seeds_to_review = db.query(Seed).filter(
        Seed.tenant_id == tenant_id,
    ).order_by(Seed.created_at.asc()).limit(3).all()

    review_lines = []
    for s in seeds_to_review:
        age = (now - s.created_at).days if s.created_at else 0
        review_lines.append(f"• {s.title} ({age}d old)")

    # New seeds (last 24h)
    new_seeds = db.query(Seed).filter(
        Seed.tenant_id == tenant_id,
        Seed.created_at >= today_cutoff
    ).order_by(Seed.created_at.desc()).limit(5).all()

    # New sources
    try:
        all_links = weaviate_client.get_links(tenant_id=str(tenant_id), limit=20)
        new_sources = [l for l in all_links if l.get("created_at", "") >= today_cutoff.isoformat()]
    except:
        new_sources = []

    # Connections this week
    try:
        connections = db.query(SeedLink).join(Seed, SeedLink.source_seed_id == Seed.id).filter(
            Seed.tenant_id == tenant_id,
            SeedLink.created_at >= week_cutoff
        ).count()
    except:
        connections = 0

    # Pending
    pending = db.query(Thought).filter(
        Thought.tenant_id == tenant_id,
        Thought.status == 'pending'
    ).count()

    total_seeds = db.query(Seed).filter(Seed.tenant_id == tenant_id).count()

    # Build text
    parts = ["Good morning! 🌱 Here's your knowledge briefing:\n"]

    if review_lines:
        parts.append(f"🔍 Seeds to review:\n" + "\n".join(review_lines))

    if new_seeds:
        parts.append(f"\n🌱 {len(new_seeds)} new seeds in the last 24h:")
        for s in new_seeds[:3]:
            source = (s.seed_metadata or {}).get("source", "manual")
            parts.append(f"  • {s.title} [{source}]")

    if new_sources:
        parts.append(f"\n📎 {len(new_sources)} new sources discovered:")
        for l in new_sources[:3]:
            parts.append(f"  • {l.get('title', '')[:50]} ({l.get('domain', '')})")

    if connections:
        parts.append(f"\n🔗 {connections} connections made this week")

    if pending:
        parts.append(f"\n⏳ {pending} thoughts pending enrichment")

    parts.append(f"\n📊 Garden: {total_seeds} seeds | {len(new_sources)} sources")

    if review_lines:
        parts.append(f"\n💡 Suggested: Review \"{seeds_to_review[0].title}\" — hasn't been rated yet.")
    else:
        parts.append(f"\n💡 Suggested: Search for a topic and create a new seed.")

    image_url = None
    return BriefingResponse(text="\n".join(parts), image_url=image_url)

# --- Image Generation (BFL/FLUX) ---

BFL_API_KEY = os.environ.get("BFL_API_KEY", "")
BFL_BASE_URL = "https://api.bfl.ai"

class ImageGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)

class ImageGenerateResponse(BaseModel):
    url: str
    prompt: str

@app.post("/api/v1/images/generate", response_model=ImageGenerateResponse)
async def generate_image(
    req: ImageGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate an image via BFL FLUX.2 [pro] — async submit → poll → return URL."""
    if not BFL_API_KEY:
        raise HTTPException(status_code=503, detail="Image generation not configured (missing BFL_API_KEY)")

    import httpx
    import asyncio

    headers = {
        "Content-Type": "application/json",
        "x-key": BFL_API_KEY,
    }

    # 1. Submit generation task
    async with httpx.AsyncClient(timeout=60) as client:
        submit_resp = await client.post(
            f"{BFL_BASE_URL}/v1/flux-pro-1.1",
            headers=headers,
            json={
                "prompt": req.prompt,
                "width": req.width,
                "height": req.height,
            },
        )

        if submit_resp.status_code == 402:
            raise HTTPException(status_code=502, detail="BFL credits exhausted")
        if submit_resp.status_code == 429:
            raise HTTPException(status_code=429, detail="BFL rate limited, try again later")
        if submit_resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"BFL submit failed ({submit_resp.status_code}): {submit_resp.text[:200]}"
            )

        task = submit_resp.json()
        task_id = task.get("id")
        if not task_id:
            raise HTTPException(status_code=502, detail=f"BFL response missing task id: {task}")

        # 2. Poll for result (max ~30s)
        for _ in range(30):
            await asyncio.sleep(1)
            poll_resp = await client.get(
                f"{BFL_BASE_URL}/v1/get_result",
                headers={"x-key": BFL_API_KEY},
                params={"id": task_id},
            )

            # Non-retryable errors
            if poll_resp.status_code == 402:
                raise HTTPException(status_code=502, detail="BFL credits exhausted")
            if poll_resp.status_code == 429:
                raise HTTPException(status_code=429, detail="BFL rate limited")
            if poll_resp.status_code != 200:
                continue  # Transient error, retry

            result = poll_resp.json()
            status = result.get("status", "")

            if status == "Ready":
                sample = result.get("result", {}).get("sample")
                if sample:
                    # Track usage
                    today = date.today()
                    usage = db.query(Usage).filter(
                        Usage.tenant_id == current_user.tenant_id,
                        Usage.date >= today
                    ).first()
                    if not usage:
                        usage = Usage(
                            tenant_id=current_user.tenant_id,
                            user_id=current_user.id,
                            date=today,
                            images_generated=1,
                        )
                        db.add(usage)
                    else:
                        usage.images_generated = (usage.images_generated or 0) + 1
                    db.commit()

                    return ImageGenerateResponse(url=sample, prompt=req.prompt)

                raise HTTPException(status_code=502, detail="BFL returned Ready but no sample URL")

            if status == "Error":
                error_msg = result.get("result", "Unknown BFL error")
                raise HTTPException(status_code=502, detail=f"BFL generation failed: {error_msg}")

        raise HTTPException(status_code=504, detail="Image generation timed out (30s)")

# --- Usage ---

@app.get("/api/v1/usage/month", response_model=UsageResponse)
def get_monthly_usage(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    month_start = today.replace(day=1)
    usage = db.query(Usage).filter(
        Usage.tenant_id == current_user.tenant_id,
        Usage.date >= month_start
    ).first()
    if not usage:
        return UsageResponse(
            llm_tokens=0, embedding_tokens=0, images_generated=0, vector_operations=0, date=today
        )
    return usage

# --- Ratings ---

@app.post("/api/v1/ratings", response_model=RatingResponse)
def submit_rating(
    req: RatingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models import Rating
    # Upsert: update if exists, create if not
    existing = db.query(Rating).filter(
        Rating.tenant_id == current_user.tenant_id,
        Rating.message_id == req.message_id
    ).first()
    if existing:
        existing.score = req.score
        existing.consent = req.consent
        db.commit()
        db.refresh(existing)
        return existing
    rating = Rating(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        message_id=req.message_id,
        score=req.score,
        consent=req.consent,
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)

    # Activity log
    try:
        from app.activity import log_seed_rated
        log_seed_rated(str(current_user.tenant_id), req.message_id[:50], req.score)
    except:
        pass

    return rating

# --- Unified GreenPlotNode API ---

@app.get("/api/v1/nodes")
def list_nodes(
    node_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    """List unified nodes, optionally filtered by type (seed|link|wiki|chat-insight)."""
    tenant_id = str(current_user.tenant_id)
    nodes = weaviate_client.get_nodes(
        tenant_id=tenant_id, node_type=node_type, search=search, limit=limit
    )
    return {"nodes": nodes, "total": len(nodes)}


@app.post("/api/v1/nodes")
def create_node(
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """Create a unified node. Body: { node_type, title, content?, summary?, domain?, tags?, source?, url?, data? }"""
    tenant_id = str(current_user.tenant_id)
    user_id = str(current_user.id)

    node_type = body.get("node_type", "seed")
    if node_type not in ("seed", "link", "wiki", "chat-insight"):
        raise HTTPException(status_code=400, detail="Invalid node_type")

    node_id = weaviate_client.add_node(
        node_type=node_type,
        tenant_id=tenant_id,
        user_id=user_id,
        title=body.get("title", "Untitled"),
        content=body.get("content", ""),
        summary=body.get("summary", ""),
        domain=body.get("domain", ""),
        tags=body.get("tags", ""),
        source=body.get("source", "chat"),
        status=body.get("status", "raw"),
        url=body.get("url", ""),
        entities=body.get("entities", ""),
        energy=body.get("energy", ""),
        starred=body.get("starred", False),
        favicon=body.get("favicon", ""),
        data=body.get("data", {}),
    )
    return {"id": node_id, "node_type": node_type, "ok": True}


@app.post("/api/v1/nodes/search")
def search_nodes_endpoint(
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """Vector search across unified nodes. Body: { query, node_type?, limit? }"""
    tenant_id = str(current_user.tenant_id)
    query = body.get("query", "")
    node_type = body.get("node_type")
    limit = body.get("limit", 10)

    if not query:
        return {"nodes": [], "total": 0}

    # Get embedding for query
    import httpx
    try:
        resp = httpx.post(
            "https://openrouter.ai/api/v1/embeddings",
            json={"input": query[:2000], "model": "openai/text-embedding-ada-002"},
            headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            timeout=30,
        )
        embedding = resp.json()["data"][0]["embedding"]
    except Exception as e:
        return {"nodes": [], "total": 0, "error": "embedding_failed"}

    nodes = weaviate_client.search_nodes(
        tenant_id=tenant_id, embedding=embedding,
        node_type=node_type, limit=limit
    )
    return {"nodes": nodes, "total": len(nodes)}


@app.patch("/api/v1/nodes/{node_id}")
def update_node_endpoint(
    node_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """Update a unified node."""
    ok = weaviate_client.update_node(node_id, **body)
    if not ok:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"ok": True}


@app.delete("/api/v1/nodes/{node_id}")
def delete_node_endpoint(
    node_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a unified node."""
    ok = weaviate_client.delete_node(node_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"ok": True}


@app.post("/api/v1/nodes/{node_id}/connect/{target_id}")
def connect_nodes(
    node_id: str,
    target_id: str,
    current_user: User = Depends(get_current_user),
):
    """Add bidirectional connection between two nodes."""
    ok = weaviate_client.add_node_connection(node_id, target_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Node not found")
    return {"ok": True}


@app.post("/api/v1/nodes/migrate")
def migrate_nodes(
    current_user: User = Depends(get_current_user),
):
    """Migrate existing seeds, links, wiki articles to unified GreenPlotNode class."""
    tenant_id = str(current_user.tenant_id)
    user_id = str(current_user.id)
    stats = weaviate_client.migrate_to_unified(tenant_id, user_id)
    return {"ok": True, "migrated": stats}


# --- Public health endpoint (no auth required) ---

@app.get("/api/v1/health")
def public_health():
    """Quick liveness check for load balancers and monitoring."""
    from app.database import engine
    services: dict = {}
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        services["postgres"] = "ok"
    except Exception:
        services["postgres"] = "down"
    try:
        weaviate_client.client.is_live()
        services["weaviate"] = "ok"
    except Exception:
        services["weaviate"] = "down"
    all_ok = all(v == "ok" for v in services.values())
    return {"status": "ok" if all_ok else "degraded", "services": services}


# --- Invite flow ---

class InviteRequest(BaseModel):
    emails: List[str]

@app.post("/api/v1/admin/invite")
def admin_send_invites(
    req: InviteRequest,
    x_api_key: str = Header(default=""),
):
    """Send magic-link invite emails to waitlist users. Requires HARVEST_API_KEY."""
    expected = settings.HARVEST_API_KEY
    if not expected:
        raise HTTPException(status_code=503, detail="Invite API not configured")
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")

    from app.auth import create_access_token
    from app.email_sender import send_briefing_email

    sent, failed = [], []
    for email in req.emails[:50]:  # cap at 50 per call
        email = email.strip().lower()
        if not email or "@" not in email:
            failed.append(email)
            continue
        try:
            # 7-day invite token with special 'invite' claim
            token = create_access_token(
                data={"invite_email": email, "type": "invite"},
                expires_minutes=60 * 24 * 7,
            )
            invite_url = f"{settings.FRONTEND_URL}/invite?token={token}"
            briefing = {
                "type": "invite",
                "title": "You're invited to Seedify",
                "subtitle": "Your personal AI knowledge garden is ready",
                "sections": [
                    {
                        "title": "Get started",
                        "icon": "eco",
                        "content": (
                            f"You've been invited to Seedify — an AI-powered second brain "
                            f"that captures, enriches, and synthesizes your ideas into a living knowledge garden.\n\n"
                            f"[Accept your invite and create your account]({invite_url})\n\n"
                            f"This invite link expires in 7 days."
                        ),
                    }
                ],
            }
            send_briefing_email(email, briefing)
            sent.append(email)
        except Exception as e:
            logger.error(f"Invite failed for {email}: {e}")
            failed.append(email)

    return {"sent": sent, "failed": failed}


@app.get("/api/v1/auth/validate-invite")
def validate_invite(token: str):
    """Validate a magic-link invite token. Returns the pre-filled email on success."""
    from app.auth import decode_token
    try:
        payload = decode_token(token)
        if payload.get("type") != "invite":
            raise HTTPException(status_code=400, detail="Invalid invite token")
        email = payload.get("invite_email", "")
        if not email:
            raise HTTPException(status_code=400, detail="Malformed invite token")
        return {"valid": True, "email": email}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired invite token")


# --- Admin (protected by is_admin check; for MVP we'll skip and use direct DB)

@app.get("/api/v1/admin/health")
def admin_health():
    # Check Weaviate, Postgres, LLM APIs, Redis
    status = {"weaviate": "unknown", "postgres": "unknown", "openrouter": "unknown", "redis": "unknown"}
    try:
        # Weaviate (v4 client)
        weaviate_client.client.is_live()
        status["weaviate"] = "ok"
    except:
        status["weaviate"] = "down"
    try:
        # Postgres
        from app.database import engine
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        status["postgres"] = "ok"
    except:
        status["postgres"] = "down"
    # OpenRouter
    try:
        import httpx
        r = httpx.get("https://openrouter.ai/api/v1/models", timeout=5)
        status["openrouter"] = "ok" if r.status_code == 200 else "down"
    except:
        status["openrouter"] = "down"
    # Redis + Task Queue
    queue_depth = 0
    cache_stats = {}
    try:
        from app.task_broker import get_queue_depth
        from app.cache import get_cache_stats
        queue_depth = get_queue_depth()
        cache_stats = get_cache_stats()
        status["redis"] = "ok"
    except:
        status["redis"] = "down"
    overall = "ok" if all(status[k] == "ok" for k in ["weaviate", "postgres", "openrouter", "redis"]) else "degraded"
    return {
        "status": overall,
        "checks": status,
        "queue_depth": queue_depth,
        "cache": cache_stats,
    }

@app.get("/api/v1/admin/tenants", response_model=TenantsListResponse)
def admin_list_tenants(db: Session = Depends(get_db)):
    # For MVP, simple list; later add admin role check
    tenants = db.query(User).with_entities(User.id, User.email, User.created_at, User.subscription_status).all()
    info = [TenantsListResponse.TenantInfo(id=t.id, email=t.email, created_at=t.created_at, subscription_status=t.subscription_status) for t in tenants]
    return TenantsListResponse(tenants=info, total=len(info))

# --- Attachments helper ---

def process_attachments(attachments: list, max_size_mb: int = 10) -> list:
    """Convert base64 attachments to OpenRouter-compatible content parts."""
    image_types = settings.ALLOWED_IMAGE_TYPES.split(",")
    content_parts = []
    for att in attachments:
        b64 = att.get("data") or att.get("base64")
        filename = att.get("name", "attachment")
        mime = att.get("mimeType") or att.get("type") or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        if not b64:
            continue
        # Validate size
        size_bytes = len(base64.b64decode(b64))
        if size_bytes > max_size_mb * 1024 * 1024:
            content_parts.append({
                "type": "text",
                "text": f"[Skipped {filename}: exceeds {max_size_mb}MB limit]"
            })
            continue
        if mime in image_types:
            data_url = f"data:{mime};base64,{b64}"
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": data_url}
            })
        else:
            # Text-based: decode and include as text
            try:
                text = base64.b64decode(b64).decode("utf-8", errors="replace")
                content_parts.append({
                    "type": "text",
                    "text": f"[File: {filename}]\n{text[:5000]}"
                })
            except Exception as e:
                content_parts.append({
                    "type": "text",
                    "text": f"[File: {filename} ({mime}) - binary, not displayable]"
                })
    return content_parts


# --- Heartbeat (multi-modal ingestion coordination) ---

@app.post("/api/v1/heartbeat")
async def heartbeat(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Internal heartbeat endpoint for coordinating multi-modal ingestion.
    Accepts text, voice (audio base64), and image data for processing.
    """
    body = await request.json() if await request.body() else {}
    mode = body.get("mode", "poll")  # poll | ingest
    attachments = body.get("attachments", [])

    result = {
        "status": "ok",
        "mode": mode,
        "tenant_id": str(current_user.tenant_id),
        "processed": [],
    }

    if mode == "ingest" and attachments:
        for att in attachments:
            att_type = att.get("type", "unknown")
            att_name = att.get("name", "unnamed")
            mime = att.get("mimeType", "")

            if att_type == "image" or mime.startswith("image/"):
                result["processed"].append({"name": att_name, "type": "image", "status": "queued"})
            elif att_type == "audio" or mime.startswith("audio/"):
                result["processed"].append({"name": att_name, "type": "audio", "status": "queued"})
            elif att_type == "text" or mime.startswith("text/"):
                result["processed"].append({"name": att_name, "type": "text", "status": "queued"})
            else:
                result["processed"].append({"name": att_name, "type": att_type, "status": "unsupported"})

    # Pipeline status (to be expanded)
    result["pipeline"] = {
        "text_ingestion": "active",
        "voice_ingestion": "active",
        "image_ingestion": "active",
        "garden_pipeline": "linked",
    }
    return result


# --- Ingestion endpoints ---

from fastapi import UploadFile, File

@app.post("/api/v1/ingest/voice")
async def ingest_voice_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Voice ingestion: audio → Whisper transcript → Thought → enrich_v2 → Seed"""
    from app.ingest import ingest_voice
    result = await ingest_voice(file, current_user, db)
    return result


@app.post("/api/v1/ingest/image")
async def ingest_image_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Image ingestion: image → Vision extract → Thought → enrich_v2 → BFL concept art → Seed"""
    from app.ingest import ingest_image
    result = await ingest_image(file, current_user, db)
    return result


# --- Chat v2 (refactored agent architecture) ---

@app.post("/api/v1/chat/v2")
async def chat_v2_endpoint(
    request: Request,
    current_user = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """
    Chat endpoint using the new agent architecture.

    Features:
    - Declarative ToolRegistry with JSON Schema + permissions
    - Typed Session with ContentBlocks + persistence
    - SystemPromptBuilder for dynamic context
    - Auto-compaction for long sessions
    - SSE streaming (text/event-stream)

    Request body:
        messages: Chat history (OpenAI format)
        session_id: Optional — resume an existing session
        attachments: Optional file attachments

    Response: SSE stream with typed events
    """
    from app.agent.setup import setup_default_registry
    from app.agent.agent import SeedifyAgent
    from app.agent.persist import ChatSessionStore
    from app.agent.prompt import SystemPromptBuilder
    from app.agent.compact import CompactionConfig, should_compact, compact_session, estimate_tokens
    from app.agent.session import Session, Message
    from app.session_store import SessionRecorder

    body = await request.json()
    messages = body.get("messages", [])
    attachments = body.get("attachments", [])
    session_id = body.get("session_id", "")

    # Input validation
    if messages:
        last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
        if last_user:
            content = last_user.get("content", "") or ""
            if isinstance(content, str) and len(content) > 10_000:
                raise HTTPException(status_code=422, detail="Message too long (max 10,000 characters)")

    # Daily token budget check
    if current_user and settings.DAILY_TOKEN_LIMIT > 0:
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        from app.models import Usage as UsageModel
        today_usage = db.query(func.coalesce(func.sum(UsageModel.llm_tokens), 0)).filter(
            UsageModel.user_id == current_user.id,
            UsageModel.date >= today_start,
        ).scalar() or 0
        if today_usage >= settings.DAILY_TOKEN_LIMIT:
            reset_time = (today_start + timedelta(days=1)).isoformat() + "Z"
            raise HTTPException(
                status_code=429,
                detail=f"Daily token limit reached ({settings.DAILY_TOKEN_LIMIT:,} tokens). Resets at {reset_time}.",
                headers={"X-RateLimit-Reset": reset_time},
            )

    # ── Session Persistence ───────────────────────────────────────
    store = ChatSessionStore(db)
    agent_session = None

    if session_id and current_user:
        agent_session = store.load_session(session_id)

    if agent_session is None:
        import uuid as _uuid
        session_id = str(_uuid.uuid4())
        agent_session = Session(session_id=session_id)
    else:
        session_id = agent_session.session_id

    # ── Build System Prompt ───────────────────────────────────────
    prompt_builder = SystemPromptBuilder()

    if current_user:
        prompt_builder = prompt_builder.with_user_profile(
            name=getattr(current_user, "email", "User"),
            timezone="UTC",
            preferences={},
        )

    # Garden stats (best-effort)
    try:
        from app.models import Seed
        seed_count = db.query(Seed).filter(
            Seed.tenant_id == current_user.tenant_id
        ).count() if current_user else 0
        recent = db.query(Seed).filter(
            Seed.tenant_id == current_user.tenant_id
        ).order_by(Seed.created_at.desc()).limit(3).all() if current_user else []
        recent_titles = [s.title for s in recent]
        prompt_builder = prompt_builder.with_garden_stats(
            seed_count=seed_count,
            recent_seeds=recent_titles,
            domains=[],
        )

        # Inject briefing context for new sessions (weather + recent seeds)
        if not session_id or not (agent_session and agent_session.messages):
            briefing_parts = []
            if current_user.city:
                try:
                    import httpx as _httpx
                    weather_resp = _httpx.get(
                        f"https://wttr.in/{current_user.city}",
                        params={"format": "%c+%t+%C", "lang": "en"},
                        timeout=5,
                    )
                    if weather_resp.status_code == 200:
                        briefing_parts.append(f"☀️ Weather in {current_user.city}: {weather_resp.text.strip()}")
                except Exception as e:
                    pass
            if recent_titles:
                briefing_parts.append(f"🌱 Recent seeds: {', '.join(recent_titles[:3])}")
            if briefing_parts:
                prompt_builder = prompt_builder.with_context(
                    "Daily Context:\n" + "\n".join(briefing_parts)
                )
    except Exception as e:
        pass

    # ── Source Context: auto-surface relevant sources for the conversation ──
    # Extract last user prompt for source matching
    _last_prompt = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            _last_prompt = extract_text(msg)
            break

    if current_user and _last_prompt:
        try:
            user_sources = weaviate_client.get_links(tenant_id=str(current_user.tenant_id), limit=100)
            if user_sources:
                # Match sources to the user's message by keyword overlap
                prompt_words = set(_last_prompt.lower().split())
                scored = []
                for link in user_sources:
                    title = (link.get("title") or "").lower()
                    domain = (link.get("domain") or "").lower()
                    tags = (link.get("tags") or "").lower()
                    summary = (link.get("summary") or "").lower()
                    source_text = f"{title} {domain} {tags} {summary}"
                    source_words = set(source_text.split())
                    overlap = len(prompt_words & source_words)
                    if overlap >= 2:
                        scored.append((overlap, link))
                scored.sort(key=lambda x: -x[0])

                if scored:
                    source_lines = []
                    for _, link in scored[:3]:
                        source_lines.append(f"  • {link.get('title', '')[:60]} ({link.get('domain', '')}) — {link.get('url', '')}")
                    source_context = (
                        f"📎 The user has {len(user_sources)} saved sources. "
                        f"Relevant sources for this topic:\n" + "\n".join(source_lines) +
                        "\nMention these when relevant — the user may not remember they saved them. Use read_source to fetch full content when answering complex questions about these topics."
                    )
                    prompt_builder = prompt_builder.with_context(source_context)
        except Exception:
            pass

    system_prompt = prompt_builder.render()

    # ── Setup Agent ───────────────────────────────────────────────
    registry = setup_default_registry(
        api_key=settings.OPENROUTER_API_KEY,
        model=settings.CHAT_MODEL,
    )
    agent = SeedifyAgent(
        registry=registry,
        api_key=settings.OPENROUTER_API_KEY,
        model=settings.CHAT_MODEL,
        max_rounds=8,
        system_prompt=system_prompt,
    )

    # ── Compaction Check ──────────────────────────────────────────
    config = CompactionConfig(preserve_recent=10, max_tokens=8000)

    # If we have a loaded session with prior messages, prepend them
    if agent_session and agent_session.messages:
        # Check if compaction is needed
        if should_compact(agent_session, config):
            compaction_result = compact_session(agent_session, config)
            agent_session = compaction_result.compacted_session

        # Prepend prior session messages to the current messages
        prior_messages = agent_session.to_llm_messages()
        # Only add prior messages if they're not already in the current messages
        if prior_messages and len(prior_messages) > 1:
            messages = prior_messages + messages

    # ── Session Recording ─────────────────────────────────────────
    last_prompt = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            last_prompt = extract_text(msg)
            break
    recorder = SessionRecorder(
        user_id=str(current_user.id) if current_user else "anonymous",
        tenant_id=str(current_user.tenant_id) if current_user else "",
        prompt=last_prompt[:500],
    )

    async def generate():
        import json as _json

        # Send session_id as first event
        yield f"data: {_json.dumps({'type': 'session', 'session_id': session_id})}\n\n"

        async for event in agent.run(messages, current_user, db, attachments=attachments):
            d = event.to_dict()

            # Record events
            if event.type.value == "content":
                recorder.event("content", "assistant", d.get("text", "")[:100])
            elif event.type.value == "tool_call":
                recorder.event("tool_call", d.get("name", ""), d.get("input", "")[:200])
            elif event.type.value == "tool_result":
                recorder.event("tool_result", d.get("id", ""), d.get("result", "")[:200])

            # SSE format
            # SSE format
            yield f"data: {_json.dumps(d, ensure_ascii=False)}\n\n"

            # Save session when done event fires
            if event.type.value == "done" and current_user:
                try:
                    actual_session = agent.last_session
                    if actual_session and actual_session.messages:
                        from app.database import SessionLocal
                        from app.agent.persist import ChatSessionStore
                        save_db = SessionLocal()
                        try:
                            save_store = ChatSessionStore(save_db)
                            save_store.save(
                                session_id=session_id,
                                messages=actual_session.messages,
                                tenant_id=str(current_user.tenant_id),
                                user_id=str(current_user.id),
                                title=last_prompt[:50] if last_prompt else None,
                            )
                            save_db.commit()
                            logger.info(f"Session {session_id} saved ({len(actual_session.messages)} messages)")
                        except Exception as e:
                            logger.error(f"Session save failed for {session_id}: {e}")
                            save_db.rollback()
                        finally:
                            save_db.close()
                    else:
                        logger.warning(f"Session {session_id}: no session to save")
                except Exception as e:
                    logger.error(f"Session persistence error for {session_id}: {e}")

    return StreamingResponse(generate(), media_type="text/event-stream")



# --- Session Management ---

@app.get("/api/v1/sessions")
def list_sessions(
    limit: int = 20,
    current_user: User = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """List user's chat sessions, ordered by most recent."""
    if not current_user:
        return []
    from app.agent.persist import ChatSessionStore
    store = ChatSessionStore(db)
    return store.list_sessions(
        tenant_id=str(current_user.tenant_id),
        user_id=str(current_user.id),
        limit=limit,
    )


@app.get("/api/v1/sessions/{session_id}")
def get_session(
    session_id: str,
    current_user: User = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """Load a chat session with full message history."""
    if not current_user:
        return {"error": "Not authenticated"}
    from app.agent.persist import ChatSessionStore
    store = ChatSessionStore(db)
    session = store.load_session(session_id)
    if session is None:
        return {"error": "Session not found"}
    return {
        "session_id": session.session_id,
        "messages": session.to_dict()["messages"],
    }


@app.delete("/api/v1/sessions/{session_id}")
def delete_session(
    session_id: str,
    current_user: User = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """Delete a chat session."""
    if not current_user:
        return {"error": "Not authenticated"}
    from app.agent.persist import ChatSessionStore
    store = ChatSessionStore(db)
    ok = store.delete(session_id)
    db.commit()
    return {"deleted": ok}


# --- Chat Harvest: Create seeds from chat insights ---

@app.post("/api/v1/chat/harvest-all")
def harvest_all(
    x_api_key: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """
    System endpoint: Harvest ALL users' recent chat sessions.
    Requires X-API-Key header matching HARVEST_API_KEY env var.
    """
    harvest_key = settings.HARVEST_API_KEY
    if not harvest_key:
        raise HTTPException(status_code=503, detail="Harvest API not configured")
    if x_api_key != harvest_key:
        raise HTTPException(status_code=401, detail="Invalid API key")

    from app.agent.persist import ChatSessionStore
    store = ChatSessionStore(db)

    # Get all users with recent sessions
    from app.models import ChatSession as ChatSessionModel
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(hours=2)
    fallback_cutoff = datetime.utcnow() - timedelta(hours=48)
    sessions = db.query(ChatSessionModel).filter(
        ChatSessionModel.updated_at >= cutoff
    ).order_by(ChatSessionModel.updated_at.desc()).limit(10).all()

    # Fallback: if no chat sessions, harvest from recent Thoughts
    if not sessions:
        recent_thoughts = db.query(Thought).filter(
            Thought.created_at >= fallback_cutoff,
            Thought.source.in_(['chat', 'manual', 'pwa', 'voice', 'onboarding']),
            Thought.status == 'processed'
        ).order_by(Thought.created_at.desc()).limit(10).all()
        
        harvested = 0
        for thought in recent_thoughts:
            try:
                seed_content = thought.content[:1500] if thought.content else ""
                if len(seed_content) < 20:
                    continue
                harvest = Thought(
                    tenant_id=thought.tenant_id,
                    user_id=thought.user_id,
                    content=f"Chat Insights:\n\n{seed_content}",
                    source='auto_harvest',
                    status='pending'
                )
                db.add(harvest)
                db.flush()
                # Queue enrichment via Redis (non-blocking)
                try:
                    from app.task_broker import enqueue_enrichment
                    enqueue_enrichment(str(harvest.id), str(thought.tenant_id))
                    harvest.status = 'processing'
                except Exception:
                    # Fallback: inline if Redis is down
                    from app.enricher_v2 import enrich_thought_v2
                    try:
                        enrich_thought_v2(str(harvest.id), str(thought.tenant_id), db)
                        harvest.status = 'processed'
                    except Exception as e:
                        harvest.status = 'error'
                        harvest.error_message = str(e)
                db.commit()
                harvested += 1
            except Exception:
                db.rollback()
                continue
        return {"harvested": harvested, "sessions_checked": len(recent_thoughts), "source": "thoughts"}

    harvested = 0
    for session_row in sessions:
        try:
            session = store.load_session(str(session_row.id))
            if not session or not session.messages:
                continue

            # Extract assistant text
            assistant_texts = []
            for msg in session.messages:
                if hasattr(msg, 'role') and msg.role == 'assistant':
                    for block in (msg.content or []):
                        if hasattr(block, 'kind') and block.kind.value == 'text':
                            assistant_texts.append(block.text)
                        elif hasattr(block, 'type') and block.type == 'text':
                            assistant_texts.append(block.text)
                        elif isinstance(block, dict) and block.get('kind') == 'text':
                            assistant_texts.append(block.get('text', ''))
                        elif isinstance(block, dict) and block.get('type') == 'text':
                            assistant_texts.append(block.get('text', ''))

            if not assistant_texts:
                continue

            combined = "\n\n".join(assistant_texts[:3])
            if len(combined) > 1500:
                combined = combined[:1500] + "..."

            thought = Thought(
                tenant_id=session_row.tenant_id,
                user_id=session_row.user_id,
                content=f"Chat Insights:\n\n{combined}",
                source='auto_harvest',
                status='pending'
            )
            db.add(thought)
            db.flush()
            # Queue enrichment via Redis (non-blocking)
            try:
                from app.task_broker import enqueue_enrichment
                enqueue_enrichment(str(thought.id), str(session_row.tenant_id))
                thought.status = 'processing'
            except Exception:
                pass  # Worker will pick up pending thoughts
            db.commit()
            harvested += 1
        except Exception as e:
            db.rollback()
            continue

    return {"harvested": harvested, "sessions_checked": len(sessions)}


@app.post("/api/v1/chat/harvest")
def harvest_chat(
    session_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Extract insights from the most recent chat session and create thoughts/seeds.
    If session_id is provided, harvests that specific session.
    Otherwise harvests the user's most recent session.
    """
    from app.agent.persist import ChatSessionStore
    from app.agent.session import Message
    store = ChatSessionStore(db)

    # Load session
    if session_id:
        session = store.load_session(session_id)
    else:
        sessions = store.list_sessions(
            tenant_id=str(current_user.tenant_id),
            user_id=str(current_user.id),
            limit=1
        )
        session = sessions[0] if sessions else None

    if not session:
        raise HTTPException(status_code=404, detail="No chat session found")

    # Extract assistant text messages
    assistant_texts = []
    for msg in session.messages:
        if hasattr(msg, 'role') and msg.role == 'assistant':
            for block in (msg.content or []):
                if hasattr(block, 'type') and block.type == 'text':
                    assistant_texts.append(block.text)
                elif isinstance(block, dict) and block.get('type') == 'text':
                    assistant_texts.append(block.get('text', ''))

    if not assistant_texts:
        return {"created": 0, "message": "No assistant messages to harvest"}

    # Combine insights into a single thought
    combined = "\n\n".join(assistant_texts[:5])  # Limit to last 5 messages
    if len(combined) > 2000:
        combined = combined[:2000] + "..."

    thought_content = f"Chat Insights:\n\n{combined}"

    # Create thought
    thought = Thought(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        content=thought_content,
        source='chat_harvest',
        status='pending'
    )
    db.add(thought)
    db.commit()
    db.refresh(thought)

    # Queue enrichment via Redis (non-blocking)
    try:
        from app.task_broker import enqueue_enrichment
        task_id = enqueue_enrichment(str(thought.id), str(current_user.tenant_id))
        thought.status = 'processing'
    except Exception:
        # Fallback: inline if Redis is down
        from app.enricher_v2 import enrich_thought_v2
        try:
            enrich_thought_v2(str(thought.id), str(current_user.tenant_id), db)
            thought.status = 'processed'
        except Exception as e:
            thought.status = 'error'
            thought.error_message = str(e)
    db.commit()

    return {
        "created": 1,
        "thought_id": str(thought.id),
        "session_id": session.session_id,
        "messages_harvested": len(assistant_texts),
    }

# --- Extract Insights (for Add to Garden) ---

class ExtractInsightsRequest(BaseModel):
    conversation: str = Field(..., min_length=10, max_length=20000)

class ExtractedInsight(BaseModel):
    title: str
    content: str

class ExtractInsightsResponse(BaseModel):
    insights: List[ExtractedInsight]

@app.post("/api/v1/chat/extract-insights", response_model=ExtractInsightsResponse)
def extract_insights(
    req: ExtractInsightsRequest,
    current_user: User = Depends(get_current_user),
):
    """Extract discrete seed-worthy insights from a conversation using LLM."""
    import openai

    openai_client = openai.OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    )

    try:
        response = openai_client.chat.completions.create(
            model="minimax/minimax-m2.7",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an insight extractor. Given a conversation, identify the most valuable "
                        "insights, ideas, or learnings worth preserving as standalone knowledge seeds. "
                        "Extract 1-5 discrete insights. Each should be self-contained and meaningful on its own. "
                        "Skip greetings, small talk, and trivial exchanges. "
                        "Respond in JSON: {\"insights\": [{\"title\": string, \"content\": string}]}"
                    ),
                },
                {"role": "user", "content": req.conversation[:6000]},
            ],
            temperature=0.5,
            max_tokens=800,
        )
    except Exception as e:
        return ExtractInsightsResponse(insights=[])

    text = response.choices[0].message.content or '{"insights": []}'

    try:
        data = json.loads(text)
        insights = [
            ExtractedInsight(title=i.get("title", "Untitled"), content=i.get("content", ""))
            for i in data.get("insights", [])
            if i.get("title") and i.get("content")
        ]
        return ExtractInsightsResponse(insights=insights[:5])
    except (json.JSONDecodeError, AttributeError):
        return ExtractInsightsResponse(insights=[])

# --- Google Calendar Integration ---

import json as _json
from urllib.parse import urlencode
from app.calendar_helper import get_fresh_token, GOOGLE_CALENDAR_API as _CAL_API

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = "https://www.googleapis.com/auth/calendar.events"

class CalendarStatusResponse(BaseModel):
    connected: bool
    provider: Optional[str] = None
    timezone: Optional[str] = None

@app.get("/api/v1/calendar/status", response_model=CalendarStatusResponse)
def calendar_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if user has connected Google Calendar."""
    conn = db.query(CalendarConnection).filter(
        CalendarConnection.user_id == current_user.id
    ).first()
    if not conn:
        return CalendarStatusResponse(connected=False)
    return CalendarStatusResponse(
        connected=True,
        provider=conn.provider,
        timezone=conn.calendar_timezone,
    )

@app.get("/api/v1/calendar/auth")
def calendar_auth_url(
    current_user: User = Depends(get_current_user),
):
    """Get Google OAuth2 authorization URL."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google Calendar not configured (missing GOOGLE_CLIENT_ID)")

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": str(current_user.id),  # Pass user ID to link callback
    }
    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return {"url": url}

@app.get("/api/v1/calendar/callback")
def calendar_callback(
    code: str = None,
    state: str = None,
    error: str = None,
    db: Session = Depends(get_db)
):
    """Handle Google OAuth2 callback — exchange code for tokens."""
    if error:
        raise HTTPException(status_code=400, detail=f"OAuth error: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    # Validate state parameter (must be a real user ID)
    import uuid as _uuid
    try:
        user_id = _uuid.UUID(state)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    state_user = db.query(User).filter(User.id == user_id).first()
    if not state_user:
        raise HTTPException(status_code=400, detail="Invalid state: user not found")

    import httpx

    # Exchange code for tokens
    token_resp = httpx.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    })

    if token_resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {token_resp.text[:200]}")

    tokens = token_resp.json()
    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    if not access_token or not refresh_token:
        raise HTTPException(status_code=502, detail="Missing tokens in Google response")

    from datetime import timedelta
    token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)

    # Get calendar timezone
    calendar_tz = None
    try:
        cal_resp = httpx.get(
            f"{_CAL_API}/users/me/calendarList/primary",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if cal_resp.status_code == 200:
            calendar_tz = cal_resp.json().get("timeZone")
    except Exception as e:
        pass

    # Save or update connection
    conn = db.query(CalendarConnection).filter(
        CalendarConnection.user_id == user_id
    ).first()

    if conn:
        conn.access_token = access_token
        conn.refresh_token = refresh_token
        conn.token_expiry = token_expiry
        conn.calendar_timezone = calendar_tz
        conn.enabled = True
        conn.updated_at = datetime.utcnow()
    else:
        conn = CalendarConnection(
            user_id=user_id,
            tenant_id=state_user.tenant_id,
            provider='google',
            access_token=access_token,
            refresh_token=refresh_token,
            token_expiry=token_expiry,
            calendar_timezone=calendar_tz,
            enabled=True,
        )
        db.add(conn)

    db.commit()

    # Redirect back to frontend settings
    frontend_url = settings.APP_URL or settings.FRONTEND_URL
    return {"status": "ok", "message": "Calendar connected", "timezone": calendar_tz}

@app.delete("/api/v1/calendar/disconnect")
def calendar_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Disconnect Google Calendar."""
    conn = db.query(CalendarConnection).filter(
        CalendarConnection.user_id == current_user.id
    ).first()
    if conn:
        db.delete(conn)
        db.commit()
    return {"status": "ok", "message": "Calendar disconnected"}

# Token refresh is handled by app.calendar_helper.get_fresh_token

class FreeBusyRequest(BaseModel):
    time_min: Optional[str] = None  # ISO 8601, defaults to now
    time_max: Optional[str] = None  # ISO 8601, defaults to +24h

class FreeBusySlot(BaseModel):
    start: str
    end: str

class FreeBusyResponse(BaseModel):
    busy: List[FreeBusySlot]
    timezone: Optional[str] = None
    has_free_slots: bool

@app.post("/api/v1/calendar/free-busy", response_model=FreeBusyResponse)
def get_free_busy(
    req: FreeBusyRequest = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get free/busy slots from user's Google Calendar."""
    import httpx

    conn = db.query(CalendarConnection).filter(
        CalendarConnection.user_id == current_user.id,
        CalendarConnection.enabled == True,
    ).first()

    if not conn:
        raise HTTPException(status_code=404, detail="No calendar connected")

    token = get_fresh_token(conn, db)
    if not token:
        raise HTTPException(status_code=401, detail="Calendar token expired. Please reconnect.")

    now = datetime.utcnow()
    time_min = req.time_min if req and req.time_min else now.isoformat() + "Z"
    time_max = req.time_max if req and req.time_max else (now + timedelta(hours=24)).isoformat() + "Z"

    resp = httpx.post(
        f"{_CAL_API}/freeBusy",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "timeMin": time_min,
            "timeMax": time_max,
            "items": [{"id": "primary"}],
        },
    )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Calendar API error: {resp.text[:200]}")

    data = resp.json()
    busy_raw = data.get("calendars", {}).get("primary", {}).get("busy", [])

    busy = [FreeBusySlot(start=b.get("start", ""), end=b.get("end", "")) for b in busy_raw]

    # Check if there are gaps (free slots)
    has_free = True
    if busy:
        # Simple check: if all 24h are busy, no free slots
        # More nuanced check could be done on frontend
        pass

    return FreeBusyResponse(
        busy=busy,
        timezone=conn.calendar_timezone,
        has_free_slots=has_free,
    )

@app.get("/api/v1/calendar/events")
def get_upcoming_events(
    hours: int = 24,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get upcoming calendar events for context injection."""
    import httpx

    conn = db.query(CalendarConnection).filter(
        CalendarConnection.user_id == current_user.id,
        CalendarConnection.enabled == True,
    ).first()

    if not conn:
        return {"events": [], "connected": False}

    token = get_fresh_token(conn, db)
    if not token:
        return {"events": [], "connected": True, "error": "Token expired"}

    now = datetime.utcnow()
    time_min = now.isoformat() + "Z"
    time_max = (now + timedelta(hours=hours)).isoformat() + "Z"

    resp = httpx.get(
        f"{_CAL_API}/calendars/primary/events",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 10,
        },
    )

    if resp.status_code != 200:
        return {"events": [], "connected": True, "error": f"API error ({resp.status_code})"}

    data = resp.json()
    events = []
    for item in data.get("items", []):
        start = item.get("start", {})
        events.append({
            "summary": item.get("summary", "(No title)"),
            "start": start.get("dateTime", start.get("date", "")),
            "end": item.get("end", {}).get("dateTime", ""),
            "location": item.get("location", ""),
            "status": item.get("status", ""),
        })

    return {"events": events, "connected": True, "timezone": conn.calendar_timezone}


@app.post("/api/v1/calendar/events")
def create_calendar_event(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new event in the user's Google Calendar."""
    import httpx

    conn = db.query(CalendarConnection).filter(
        CalendarConnection.user_id == current_user.id,
        CalendarConnection.enabled == True,
    ).first()
    if not conn:
        raise HTTPException(status_code=404, detail="No calendar connected")

    token = get_fresh_token(conn, db)
    if not token:
        raise HTTPException(status_code=401, detail="Calendar token expired — reconnect Google Calendar")

    tz = body.get("timezone") or conn.calendar_timezone or "UTC"

    def _dt(iso: str) -> dict:
        """Wrap a datetime string in the Google Calendar dateTime object."""
        return {"dateTime": iso if "T" in iso else f"{iso}T00:00:00", "timeZone": tz}

    event_body = {
        "summary": body.get("summary", "New Event"),
        "start": _dt(body["start_time"]),
        "end": _dt(body["end_time"]),
    }
    if body.get("description"):
        event_body["description"] = body["description"]
    if body.get("location"):
        event_body["location"] = body["location"]

    resp = httpx.post(
        f"{_CAL_API}/calendars/primary/events",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=event_body,
    )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=f"Google Calendar error: {resp.text[:300]}")

    created = resp.json()
    return {
        "id": created.get("id"),
        "summary": created.get("summary"),
        "start": created.get("start", {}).get("dateTime"),
        "end": created.get("end", {}).get("dateTime"),
        "link": created.get("htmlLink"),
    }


# --- Push Notifications (persistent store for PWA) ---

_NOTIFS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "push_notifications.json")
_SUBS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "push_subscriptions.json")

def _load_notifs() -> list:
    try:
        with open(_NOTIFS_FILE, "r") as f:
            data = json.load(f)
            # Only keep last 50
            return data[-50:]
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def _save_notifs(notifs: list):
    os.makedirs(os.path.dirname(_NOTIFS_FILE), exist_ok=True)
    with open(_NOTIFS_FILE, "w") as f:
        json.dump(notifs[-50:], f, indent=2)

def _load_subs() -> list:
    try:
        with open(_SUBS_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def _save_subs(subs: list):
    os.makedirs(os.path.dirname(_SUBS_FILE), exist_ok=True)
    with open(_SUBS_FILE, "w") as f:
        json.dump(subs, f, indent=2)

def _get_vapid_key_b64url() -> str:
    """Convert PKCS8 PEM private key to raw base64url format required by pywebpush."""
    if not VAPID_PRIVATE_KEY:
        return ""
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        import base64
        key = load_pem_private_key(VAPID_PRIVATE_KEY.encode(), password=None)
        # Extract raw 32-byte key via private_numbers (works on all cryptography versions)
        private_int = key.private_numbers().private_value
        raw = private_int.to_bytes(32, 'big')
        b64url = base64.urlsafe_b64encode(raw).decode().rstrip("=")
        print(f"✅ VAPID key converted: {len(b64url)} chars", flush=True)
        return b64url
    except Exception as e:
        logger.error(f"❌ VAPID key conversion failed: {e}")
        return VAPID_PRIVATE_KEY  # fallback

def _send_web_push_to_all(subscription_info: dict, payload: str) -> str:
    """Send a Web Push notification to a single subscription. Returns 'ok', 'expired', or 'error'."""
    try:
        from pywebpush import webpush, WebPushException
        response = webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=_get_vapid_key_b64url(),
            vapid_claims=VAPID_CLAIMS.copy(),
        )
        return "ok" if response.status_code in (200, 201) else "error"
    except WebPushException as e:
        if e.response and e.response.status_code in (404, 410):
            logger.info(f"🗑️ Push subscription expired (endpoint gone)")
            return "expired"
        else:
            logger.error(f"❌ Web Push failed: {e}")
            return "error"
    except Exception as e:
        logger.error(f"❌ Web Push error: {e}")
        return "error"

def _broadcast_push(title: str, body: str, url: str = "/chat", prompt: str = "", briefing: dict = None):
    """Send Web Push to all active subscriptions for all tenants. Optionally includes full briefing structure."""
    if not VAPID_PRIVATE_KEY:
        logger.warning("⚠️ No VAPID key, skipping Web Push broadcast")
        return 0

    subs = _load_subs()
    if not subs:
        logger.info("📭 No push subscriptions registered")
        return 0

    # Build lightweight payload — full briefing is too large for web push (4KB limit)
    # The app fetches the full briefing via polling /api/v1/push/notifications
    payload_dict = {"title": title, "body": (body or "")[:120], "url": url, "prompt": prompt[:200] if prompt else ""}
    payload = json.dumps(payload_dict)
    print(f"🔔 Web push payload: {len(payload.encode('utf-8'))} bytes", flush=True)
    sent = 0
    expired = []

    for sub_entry in subs:
        sub_info = sub_entry.get("subscription", {})
        if not sub_info.get("endpoint"):
            continue

        result = _send_web_push_to_all(sub_info, payload)
        if result == "ok":
            sent += 1
        elif result == "expired":
            # Only remove subscriptions that returned 404/410 (truly expired)
            endpoint = sub_info.get("endpoint", "")
            if endpoint:
                expired.append(endpoint)
        # result == "error" → keep subscription, might be temporary

    # Remove expired subscriptions (404/410 only)
    if expired:
        subs = [s for s in subs if s.get("subscription", {}).get("endpoint") not in expired]
        _save_subs(subs)
        logger.info(f"🗑️ Removed {len(expired)} expired push subscriptions")

    logger.info(f"📤 Web Push sent to {sent}/{len(subs)} subscriptions")
    return sent

class PushNotificationRequest(BaseModel):
    title: str
    body: Optional[str] = None
    url: Optional[str] = "/chat"
    prompt: Optional[str] = None

@app.post("/api/v1/push/send")
def send_push_notification(req: PushNotificationRequest):
    """Store + push a notification for PWA delivery. Called by cron jobs and internal services."""
    # 1. Store in JSON (for polling fallback)
    notifs = _load_notifs()
    ts = datetime.utcnow()
    notif_id = f"push_{ts.strftime('%Y%m%d%H%M')}"
    notifs.append({
        "id": notif_id,
        "title": req.title,
        "body": req.body or "",
        "url": req.url or "/chat",
        "prompt": req.prompt or "",
        "timestamp": ts.isoformat(),
        "read": False,
    })
    _save_notifs(notifs)

    # 2. Send real Web Push (works even when PWA is closed)
    push_sent = _broadcast_push(req.title, req.body or "", req.url or "/chat", prompt=req.prompt or "")

    return {"success": True, "total": len(notifs), "push_sent": push_sent}

@app.get("/api/v1/push/notifications")
def get_push_notifications(
    all: bool = False,
    current_user: User = Depends(get_optional_user),
):
    """Get push notifications for PWA. ?all=true returns full history (read + unread)."""
    notifs = _load_notifs()
    if all:
        # Return all notifications, newest first, capped at 50
        return {"notifications": list(reversed(notifs[-50:])), "total": len(notifs)}
    unread = [n for n in notifs if not n.get("read")]
    return {"notifications": unread, "total": len(notifs)}

@app.post("/api/v1/push/mark-read")
def mark_notifications_read():
    """Mark all notifications as read."""
    notifs = _load_notifs()
    for n in notifs:
        n["read"] = True
    _save_notifs(notifs)
    return {"success": True}

@app.delete("/api/v1/push/notifications")
def clear_all_notifications(current_user: User = Depends(get_current_user)):
    """Delete all notifications (clear inbox)."""
    _save_notifs([])
    return {"success": True}

@app.delete("/api/v1/push/notifications/{notif_id}")
def dismiss_notification(notif_id: str, current_user: User = Depends(get_current_user)):
    """Dismiss a single notification by id."""
    notifs = _load_notifs()
    notifs = [n for n in notifs if n.get("id") != notif_id]
    _save_notifs(notifs)
    return {"success": True}

class PushSubscriptionRequest(BaseModel):
    subscription: dict
    userId: Optional[str] = None

@app.post("/api/v1/push/subscribe")
def register_push_subscription(
    req: PushSubscriptionRequest,
    current_user: Optional[User] = Depends(get_optional_user),
):
    """Register a Web Push subscription. Auth is optional — anonymous devices are
    stored by endpoint so they still receive broadcasts even without a JWT."""
    subscription = req.subscription
    if not subscription:
        raise HTTPException(status_code=400, detail="No subscription provided")

    endpoint = subscription.get("endpoint", "")
    if not endpoint:
        raise HTTPException(status_code=400, detail="Subscription missing endpoint")

    subs = _load_subs()
    # Deduplicate by endpoint — replace if already registered
    subs = [s for s in subs if s.get("subscription", {}).get("endpoint") != endpoint]
    subs.append({
        "user_id": str(current_user.id) if current_user else req.userId or "anonymous",
        "tenant_id": str(current_user.tenant_id) if current_user else "default",
        "subscription": subscription,
    })
    _save_subs(subs)
    logger.info(f"✅ Push subscription registered (user={'authenticated' if current_user else 'anonymous'})")
    return {"success": True}

@app.get("/api/v1/push/subscriptions")
def list_push_subscriptions(
    current_user: User = Depends(get_current_user),
):
    """List push subscriptions for the current tenant (used by cron to deliver notifications)."""
    subs = _load_subs()
    tenant_subs = [s for s in subs if s.get("tenant_id") == str(current_user.tenant_id)]
    return {"subscriptions": tenant_subs}


# --- Activity Summary (What's New) ---

@app.get("/api/v1/activity/summary")
def get_activity_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a summary of recent garden activity for display on login."""
    from datetime import timedelta
    from app.models import SeedLink

    tenant_id = current_user.tenant_id
    now = datetime.utcnow()
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)

    # Seeds in last 24h
    recent_seeds = db.query(Seed).filter(
        Seed.tenant_id == tenant_id,
        Seed.created_at >= day_ago
    ).count()

    # Total seeds
    total_seeds = db.query(Seed).filter(Seed.tenant_id == tenant_id).count()

    # New connections this week
    recent_connections = db.query(SeedLink).join(
        Seed, SeedLink.source_seed_id == Seed.id
    ).filter(
        Seed.tenant_id == tenant_id,
        SeedLink.created_at >= week_ago
    ).count()

    # Links from Weaviate
    try:
        all_links = weaviate_client.get_links(tenant_id=str(tenant_id), limit=200)
        total_links = len(all_links)
        new_links_today = len([l for l in all_links if l.get("created_at", "") >= day_ago.isoformat()])
    except Exception:
        total_links = 0
        new_links_today = 0

    # Wiki articles
    try:
        articles = weaviate_client.get_wiki_articles(tenant_id=str(tenant_id), limit=200)
        total_articles = len(articles)
    except Exception:
        total_articles = 0

    # Pending enrichment
    pending = db.query(Thought).filter(
        Thought.tenant_id == tenant_id,
        Thought.status == 'pending'
    ).count()

    # Recent activity items
    activities = []
    if recent_seeds > 0:
        activities.append({
            "icon": "eco",
            "text": f"{recent_seeds} new seed{'s' if recent_seeds > 1 else ''} added",
            "color": "text-primary",
        })
    if new_links_today > 0:
        activities.append({
            "icon": "link",
            "text": f"{new_links_today} new source{'s' if new_links_today > 1 else ''} discovered",
            "color": "text-blue-400",
        })
    if recent_connections > 0:
        activities.append({
            "icon": "hub",
            "text": f"{recent_connections} connection{'s' if recent_connections > 1 else ''} made this week",
            "color": "text-secondary",
        })
    if pending > 0:
        activities.append({
            "icon": "pending",
            "text": f"{pending} items pending enrichment",
            "color": "text-amber-400",
        })

    # If nothing happened, show a positive message
    if not activities:
        activities.append({
            "icon": "check_circle",
            "text": "Garden is up to date",
            "color": "text-primary",
        })

    return {
        "timestamp": now.isoformat(),
        "stats": {
            "total_seeds": total_seeds,
            "total_links": total_links,
            "total_articles": total_articles,
            "seeds_today": recent_seeds,
            "links_today": new_links_today,
            "connections_week": recent_connections,
            "pending": pending,
        },
        "activities": activities,
    }


# --- Memory Persistence ---

_MEM_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "memory_store.json")

def _load_mem() -> dict:
    try:
        with open(_MEM_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _save_mem(data: dict):
    os.makedirs(os.path.dirname(_MEM_FILE), exist_ok=True)
    with open(_MEM_FILE, "w") as f:
        json.dump(data, f, indent=2)

class MemoryItemRequest(BaseModel):
    key: str
    value: str
    memory_type: str = "UserMemory"
    tags: list[str] = []
    stability_score: float = 1.0

class MemoryStoreRequest(BaseModel):
    items: list[MemoryItemRequest]
    user_id: Optional[str] = None

@app.post("/api/v1/memory/store")
def sto<RESEND_API_KEY>(
    req: MemoryStoreRequest,
    current_user: User = Depends(get_current_user),
):
    """Store memory items to persistent JSON file (survives cold starts)."""
    mem = _load_mem()
    tenant_id = str(current_user.tenant_id)
    if tenant_id not in mem:
        mem[tenant_id] = []

    existing_keys = {i["key"].lower() for i in mem[tenant_id]}
    added = 0
    for item in req.items:
        if item.key.lower() in existing_keys:
            # Reinforce existing
            for existing in mem[tenant_id]:
                if existing["key"].lower() == item.key.lower():
                    existing["stability_score"] = min(existing.get("stability_score", 1.0) + 0.15, 3.0)
                    existing["access_count"] = existing.get("access_count", 0) + 1
                    break
        else:
            mem[tenant_id].append({
                "key": item.key,
                "value": item.value,
                "memory_type": item.memory_type,
                "tags": item.tags,
                "stability_score": item.stability_score,
                "access_count": 0,
                "created": datetime.utcnow().isoformat(),
            })
            existing_keys.add(item.key.lower())
            added += 1

    _save_mem(mem)
    return {"success": True, "added": added, "total": len(mem[tenant_id])}

@app.get("/api/v1/memory")
def get_memories(
    current_user: User = Depends(get_current_user),
):
    """Get all memory items for the current tenant."""
    mem = _load_mem()
    tenant_id = str(current_user.tenant_id)
    return {"items": mem.get(tenant_id, []), "count": len(mem.get(tenant_id, []))}


# --- Account Management ---

@app.delete("/api/v1/account")
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete user account and all associated data (thoughts, seeds, sessions, Weaviate data)."""
    tenant_id = str(current_user.tenant_id)

    # 1. Delete Weaviate data for this tenant
    try:
        weaviate_client.delete_tenant_seeds(tenant_id)
    except Exception as e:
        print(f"Weaviate delete warning: {e}")

    # 2. Delete push subscriptions for this tenant
    subs = _load_subs()
    subs = [s for s in subs if s.get("tenant_id") != tenant_id]
    _save_subs(subs)

    # 3. Delete memory store for this tenant
    mem = _load_mem()
    if tenant_id in mem:
        del mem[tenant_id]
        _save_mem(mem)

    # 4. Delete Postgres data — explicit deletes for tables without cascade
    db.query(ChatSession).filter(ChatSession.user_id == current_user.id).delete()
    db.query(Rating).filter(Rating.user_id == current_user.id).delete()
    db.query(CalendarConnection).filter(CalendarConnection.user_id == current_user.id).delete()
    # Seeds, Thoughts, Usage cascade from User via SQLAlchemy relationship
    db.delete(current_user)
    db.commit()

    return {"status": "ok", "message": "Account and all data deleted"}


@app.get("/api/v1/me/export")
def export_my_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """GDPR data export — returns all user data as JSON."""
    from fastapi.responses import JSONResponse

    def _ser(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, uuid.UUID):
            return str(obj)
        return str(obj)

    seeds = db.query(Seed).filter(Seed.user_id == current_user.id).all()
    thoughts = db.query(Thought).filter(Thought.user_id == current_user.id).all()
    sessions = db.query(ChatSession).filter(ChatSession.user_id == current_user.id).all()
    ratings = db.query(Rating).filter(Rating.user_id == current_user.id).all()

    export = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "user": {
            "id": str(current_user.id),
            "email": current_user.email,
            "nickname": getattr(current_user, "nickname", ""),
            "city": current_user.city or "",
            "interests": getattr(current_user, "interests", []) or [],
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        },
        "seeds": [
            {
                "id": str(s.id),
                "title": s.title,
                "content": s.content,
                "metadata": s.seed_metadata,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in seeds
        ],
        "thoughts": [
            {
                "id": str(t.id),
                "content": t.content,
                "source": t.source,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in thoughts
        ],
        "chat_sessions": [
            {
                "id": str(s.id),
                "title": s.title,
                "message_count": len(s.messages or []),
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ],
        "ratings": [
            {"message_id": r.message_id, "score": r.score, "created_at": r.created_at.isoformat() if r.created_at else None}
            for r in ratings
        ],
    }

    return JSONResponse(
        content=export,
        headers={"Content-Disposition": f'attachment; filename="seedify-export-{current_user.id}.json"'},
    )


# --- Batch Enrichment ---

class EnrichBatchRequest(BaseModel):
    limit: int = Field(default=10, le=50, description="Max seeds to enrich per batch")

@app.post("/api/v1/seeds/enrich-batch")
def enrich_seeds_batch(
    req: EnrichBatchRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Enrich seeds that are missing enrichment fields (domain, tags, summary, energy).
    Processes a batch at a time to avoid overwhelming the LLM.
    Run multiple times until all seeds are enriched.
    """
    tenant_id = str(current_user.tenant_id)

    # Find unenriched seeds in Weaviate (IsNull requires indexNullState, so filter client-side)
    try:
        result = weaviate_client.client.query.get(
            settings.WEAVIATE_CLASS,
            ["title", "text", "content", "domain", "tags", "summary", "tenant_id"]
        ).with_additional(["id"]).with_where({
            "path": ["tenant_id"],
            "operator": "Equal",
            "valueText": tenant_id,
        }).with_limit(250).do()

        all_seeds = result.get("data", {}).get("Get", {}).get(settings.WEAVIATE_CLASS, []) or []
        # Filter to only unenriched (domain is null or empty)
        seeds = [s for s in all_seeds if not s.get("domain")][:req.limit]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Weaviate query failed: {e}")

    if not seeds:
        return {"enriched": 0, "remaining": 0, "message": "All seeds already enriched"}

    from app.entity_extractor import extract_entities
    enriched = 0
    errors = 0

    for seed in seeds:
        content = seed.get("text") or seed.get("content") or seed.get("title", "")
        if not content or len(content.strip()) < 20:
            continue

        try:
            # Extract via LLM
            extraction = extract_entities(content[:3000])
            summary = extraction.get("summary", "")
            topics = extraction.get("topics", [])
            entities = extraction.get("entities", [])

            # Derive domain from topics
            domain_map = {
                "ai": "AI/ML", "agent": "AI/ML", "llm": "AI/ML", "rag": "AI/ML",
                "vector": "AI/ML", "embedding": "AI/ML", "prompt": "AI/ML",
                "web": "Web Dev", "frontend": "Web Dev", "react": "Web Dev", "next": "Web Dev",
                "api": "Backend", "server": "Backend", "database": "Backend",
                "career": "Career", "interview": "Career", "fde": "Career",
                "design": "Design", "ux": "Design", "ui": "Design",
                "product": "Product", "startup": "Product", "business": "Product",
                "devops": "DevOps", "docker": "DevOps", "deploy": "DevOps",
            }
            domain = "General"
            all_text = f"{summary} {' '.join(topics)} {seed.get('title', '')}".lower()
            for key, val in domain_map.items():
                if key in all_text:
                    domain = val
                    break

            # Energy heuristic
            energy = "medium"
            if any(w in all_text for w in ["breakthrough", "amazing", "exciting", "novel"]):
                energy = "high"
            elif any(w in all_text for w in ["todo", "fix", "bug", "issue"]):
                energy = "low"

            tags_str = ", ".join(topics[:5])
            entity_names = ", ".join([e["name"] for e in entities[:5]])

            # Update Weaviate object
            obj_id = seed.get("_additional", {}).get("id") if seed.get("_additional") else None
            if obj_id:
                weaviate_client.client.data_object.update(
                    uuid=obj_id,
                    class_name=settings.WEAVIATE_CLASS,
                    data_object={
                        "summary": summary[:300],
                        "tags": tags_str,
                        "domain": domain,
                        "energy": energy,
                        "entities": entity_names,
                    },
                )
            enriched += 1

        except Exception as e:
            errors += 1
            print(f"Enrichment error for seed '{seed.get('title', '?')}': {e}")
            continue

    # Count remaining unenriched (client-side since IsNull requires indexNullState)
    try:
        count_result = weaviate_client.client.query.get(
            settings.WEAVIATE_CLASS,
            ["domain", "tenant_id"]
        ).with_where({
            "path": ["tenant_id"],
            "operator": "Equal",
            "valueText": tenant_id,
        }).with_limit(250).do()
        all_for_count = count_result.get("data", {}).get("Get", {}).get(settings.WEAVIATE_CLASS, []) or []
        remaining = sum(1 for s in all_for_count if not s.get("domain"))
    except:
        remaining = -1

    return {
        "enriched": enriched,
        "errors": errors,
        "remaining": remaining,
        "message": f"Enriched {enriched} seeds" + (f", {remaining} remaining" if remaining > 0 else " — all done!")
    }

# --- Links & Wiki routers ---
from app.links import router as links_router
from app.wiki import router as wiki_router
from app.garden_health import router as garden_router
app.include_router(links_router)
app.include_router(wiki_router)
app.include_router(garden_router)
app.include_router(garden_insights_router)
app.include_router(garden_skimmer_router)
app.include_router(wiki_lint_router)
app.include_router(wiki_pipeline_router)


# ── Scheduled Push Notifications (APScheduler) ───────────────────────────────
# Runs inside the existing FastAPI process — no extra container needed.
# All times are CET/CEST (Europe/Berlin). Jobs call _broadcast_push() directly.

import random
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

_CET = pytz.timezone("Europe/Berlin")

_MORNING_SPARKS = [
    "What if your biggest bottleneck wasn't technical — it was a missing mental model?",
    "What if you treated every failed experiment as a seed worth planting?",
    "What if the idea you dismissed last week was actually the one worth pursuing?",
    "What if slowing down one process could speed up three others?",
    "What if the pattern you're missing is already in your garden?",
    "What if the next breakthrough comes from connecting two unrelated seeds?",
    "What if the problem isn't complexity — it's clarity?",
]

def _fetch_weather(city: str) -> str:
    """Fetch one-line weather summary from wttr.in. Returns empty string on failure."""
    try:
        r = httpx.get(f"https://wttr.in/{city}?format=3", timeout=5)
        if r.status_code == 200:
            return r.text.strip()
    except Exception:
        pass
    return ""


def _get_user_city() -> str:
    """Get city from the primary user account."""
    try:
        db = next(get_db())
        user = db.query(User).filter(User.email == "contact@example.com").first()
        city = (user.city or "Munich") if user else "Munich"
        db.close()
        return city
    except Exception:
        return "Munich"


def _job_morning_spark():
    """
    Morning Idea Spark — 08:30 CET.
    Generates multi-section briefing per user: Weather + Deep Pattern.
    """
    print("🌅 MORNING SPARK JOB CALLED", flush=True)
    logger.info("🌅 Starting morning spark job...")
    try:
        db = next(get_db())
        users = db.query(User).all()
        if not users:
            logger.warning("❌ No users found for morning spark")
            return
        logger.info(f"👥 Processing {len(users)} user(s)")

        for user in users:
            try:
                city = getattr(user, 'city', None)
                logger.info(f"📍 User {user.id}: city={city}")

                # Fetch weather per user city — skip notification if unavailable
                try:
                    weather = asyncio.run(briefings.fetch_weather(city))
                except Exception as we:
                    logger.error(f"⚠️ Weather fetch failed for {user.id}: {we}")
                    weather = None

                if not weather:
                    logger.warning(f"⏭️ Skipping morning spark for user {user.id} — no weather data")
                    continue

                # Build briefing
                briefing = briefings.build_morning_spark(
                    user_id=str(user.id),
                    db=db,
                    city=city,
                    weather=weather or f"Check weather in {city or 'your location'}"
                )
                logger.info(f"✓ Briefing built with {len(briefing.get('sections', []))} sections")

                # Store and broadcast
                _sto<RESEND_API_KEY>(briefing)
                logger.info(f"✅ Morning Spark sent to user {user.id}")
            except Exception as ue:
                logger.error(f"❌ Morning Spark failed for user {user.id}: {ue}", exc_info=True)

    except Exception as e:
        logger.error(f"❌ Morning Spark job failed: {e}", exc_info=True)


def _job_daily_briefing():
    """
    Daily Briefing — 09:30 CET.
    Generates multi-section briefing: Enterprise AI News + Academic Papers.
    """
    try:
        db = next(get_db())
        default_user = db.query(User).filter(User.email != 'admin@example.com').first()
        if not default_user:
            logger.warning("No users found for daily briefing")
            return

        # Build briefing (async)
        briefing = asyncio.run(briefings.build_daily_briefing(
            user_id=str(default_user.id),
            db=db
        ))

        # Store and broadcast
        _sto<RESEND_API_KEY>(briefing)
        # Email delivery (Enterprise Digest)
        if settings.RESEND_API_KEY and default_user.email:
            try:
                email_sender.send_briefing_email(default_user.email, briefing)
            except Exception as email_err:
                logger.error(f"Email delivery failed for daily briefing: {email_err}")
        logger.info("✅ Daily Briefing generated")
    except Exception as e:
        logger.error(f"❌ Daily Briefing failed: {e}")


def _job_afternoon_reflection():
    """
    Evening Reflection — 16:00 CET.
    Generates multi-section briefing: Contrarian View + Actionable Move.
    """
    try:
        db = next(get_db())
        default_user = db.query(User).filter(User.email != 'admin@example.com').first()
        if not default_user:
            logger.warning("No users found for reflection")
            return

        # Build briefing
        briefing = briefings.build_reflection(
            user_id=str(default_user.id),
            db=db
        )

        # Store and broadcast
        _sto<RESEND_API_KEY>(briefing)
        logger.info("✅ Evening Reflection generated")
    except Exception as e:
        logger.error(f"❌ Evening Reflection failed: {e}")


def _job_weekly_digest():
    """Weekly garden digest — Sunday 10:00 CET."""
    prompt = (
        "📚 Weekly Garden Digest\n\n"
        "Search my garden and give me a weekly summary:\n"
        "1. **This week's seeds** — What new ideas did I capture?\n"
        "2. **Top domains** — Which topics are growing most?\n"
        "3. **Connections** — Any surprising links between seeds?\n"
        "4. **To enrich** — Which seeds are still raw and worth expanding?\n\n"
        "Make it feel like a garden walk — what's growing, what needs tending?"
    )
    _sto<RESEND_API_KEY>(
        "📚 Weekly Garden Digest",
        "Your weekly knowledge summary is ready. Let's review what grew.",
        "/chat",
        prompt=prompt,
    )


def _job_weekly_eval():
    """
    Weekly Content Eval — Sundays 18:00 CET.
    Generates multi-section briefing: What Stuck + Creative Constraint.
    """
    try:
        db = next(get_db())
        default_user = db.query(User).filter(User.email != 'admin@example.com').first()
        if not default_user:
            logger.warning("No users found for weekly eval")
            return

        # Build briefing
        briefing = briefings.build_weekly_eval(
            user_id=str(default_user.id),
            db=db
        )

        # Store and broadcast
        _sto<RESEND_API_KEY>(briefing)
        # Email delivery (Content Evaluation)
        if settings.RESEND_API_KEY and default_user.email:
            try:
                email_sender.send_briefing_email(default_user.email, briefing)
            except Exception as email_err:
                logger.error(f"Email delivery failed for weekly eval: {email_err}")
        logger.info("✅ Weekly Content Eval generated")
    except Exception as e:
        logger.error(f"❌ Weekly Content Eval failed: {e}")


def _job_biweekly_challenge():
    """
    Biweekly Challenge — 1st & 15th at 10:00 CET.
    Generates multi-section briefing: Cross-domain synthesis experiment.
    """
    try:
        db = next(get_db())
        default_user = db.query(User).filter(User.email != 'admin@example.com').first()
        if not default_user:
            logger.warning("No users found for biweekly challenge")
            return

        # Build briefing
        briefing = briefings.build_biweekly_challenge(
            user_id=str(default_user.id),
            db=db
        )

        # Store and broadcast
        _sto<RESEND_API_KEY>(briefing)
        logger.info("✅ Biweekly Challenge generated")
    except Exception as e:
        logger.error(f"❌ Biweekly Challenge failed: {e}")

def _job_academic_digest(evening: bool = False):
    """
    Academic + Practical Research Digest — Daily 07:00 + 18:00 CET.
    Connects new arXiv/Semantic Scholar papers to the user's Garden seeds and Wiki,
    produces a practical synthesis and solution design seed.
    """
    try:
        db = next(get_db())
        default_user = db.query(User).filter(User.email == 'contact@example.com').first()
        if not default_user:
            logger.warning("No users found for academic digest")
            return

        briefing = asyncio.run(briefings.build_academic_digest(
            user_id=str(default_user.id),
            db=db
        ))
        # Give evening run a distinct type so dedup guard doesn't block it
        if evening:
            briefing = {**briefing, "type": "academic_digest_evening"}

        _sto<RESEND_API_KEY>(briefing)

        # Email with arXiv PDF attachments
        if settings.RESEND_API_KEY and default_user.email:
            try:
                attachments = email_sender.collect_arxiv_pdfs(briefing)
                email_sender.send_briefing_email(default_user.email, briefing, attachments)
            except Exception as email_err:
                logger.error(f"Email delivery failed for academic digest: {email_err}")

        logger.info("✅ Academic Digest generated")
    except Exception as e:
        logger.error(f"❌ Academic Digest failed: {e}", exc_info=True)


def _sto<RESEND_API_KEY>(title: str, body: str, url: str, prompt: str = ""):
    """Persist notification + push to all subscribers."""
    try:
        notifs = _load_notifs()
        notifs.append({
            "title": title,
            "body": body,
            "url": url,
            "prompt": prompt,
            "timestamp": datetime.utcnow().isoformat(),
            "read": False,
        })
        _save_notifs(notifs)
        sent = _broadcast_push(title, body, url, prompt=prompt)
        logger.info(f"🔔 Scheduled push '{title}' — delivered to {sent} subscribers")
    except Exception as e:
        logger.error(f"❌ Scheduled push failed: {e}")


def _sto<RESEND_API_KEY>(briefing: dict):
    """
    Persist multi-section briefing + push to all subscribers.
    Briefing structure: { type, title, subtitle, sections: [{title, icon, color, content, sources}], prompt }
    Dedup: if the same briefing type was already broadcast within the last 4 hours, skip the push.
    """
    from datetime import timedelta
    try:
        notifs = _load_notifs()

        # ── Dedup guard ──────────────────────────────────────────────────────
        notif_type = briefing.get("type", "briefing")
        cutoff = (datetime.utcnow() - timedelta(hours=4)).isoformat()
        already_sent = any(
            n.get("briefing", {}).get("type") == notif_type
            and n.get("timestamp", "") >= cutoff
            for n in notifs
        )
        if already_sent:
            logger.info(f"⏭️ Skipping push for '{notif_type}' — already broadcast within 4h")
            return
        # ─────────────────────────────────────────────────────────────────────

        # Extract first section body for push notification preview
        body = briefing.get("sections", [{}])[0].get("content", "")
        if isinstance(body, list):
            body = body[0] if body else briefing.get("title", "")

        # Store a clean briefing — strip the raw LLM prompt chain (too large, not useful in frontend)
        clean_briefing = {k: v for k, v in briefing.items() if k != "prompt"}
        # Derive a short chat prompt from the title + first section title
        section_titles = [s.get("title", "") for s in briefing.get("sections", []) if s.get("title")]
        short_prompt = briefing.get("title", "") + (f" — {section_titles[0]}" if section_titles else "")

        ts = datetime.utcnow()
        notif_id = f"{notif_type}_{ts.strftime('%Y%m%d%H%M')}"
        notifs.append({
            "id": notif_id,
            "title": briefing.get("title", "Briefing"),
            "body": body[:100] if body else briefing.get("subtitle", ""),
            "url": "/chat",
            "prompt": short_prompt[:200],
            "briefing": clean_briefing,
            "timestamp": ts.isoformat(),
            "read": False,
        })
        _save_notifs(notifs)
        logger.info(f"✅ Briefing '{notif_type}' stored with {len(briefing.get('sections', []))} sections")

        # Send Web Push to all subscribers
        title = briefing.get("title", "Briefing")
        sent = _broadcast_push(title, body[:100] if body else "", "/chat",
                               prompt=briefing.get("prompt", ""), briefing=briefing)
        print(f"🔔 Web push sent to {sent} subscribers", flush=True)
    except Exception as e:
        logger.error(f"❌ Briefing storage failed: {e}", exc_info=True)


def _job_enrich_pending_seeds():
    """Enrich pending seeds — runs every 30 minutes. Processes up to 5 seeds per run."""
    try:
        from app.database import get_db
        from app.models import User, Thought
        from app.task_broker import enqueue_enrichment
        db = next(get_db())
        # Find pending thoughts (seeds waiting for enrichment)
        pending = db.query(Thought).filter(
            Thought.status.in_(['pending', 'error'])
        ).order_by(Thought.created_at.asc()).limit(5).all()
        queued = 0
        for t in pending:
            try:
                enqueue_enrichment(str(t.id), str(t.tenant_id))
                queued += 1
            except Exception:
                pass
        db.close()
        if queued:
            logger.info(f"⚙️ Enrichment job: queued {queued} pending seeds")
    except Exception as e:
        logger.error(f"❌ Enrichment job failed: {e}")


def _job_wiki_lint():
    """Weekly wiki health check — runs Sunday 08:00 CET. Stores report as seed + emails user."""
    try:
        import asyncio
        from app.database import get_db
        from app.models import User
        from app.wiki_lint import lint_articles, generate_lint_report

        db = next(get_db())
        users = db.query(User).all()
        db.close()
        if not users:
            return

        seen = set()
        for u in users:
            tid = str(u.tenant_id)
            if tid in seen:
                continue
            seen.add(tid)
            try:
                articles = weaviate_client.get_wiki_articles(tenant_id=tid, limit=200)
                seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tid, limit=500)
                results = lint_articles(articles, seeds)
                if results["total_issues"] == 0:
                    logger.info(f"✅ Wiki lint: no issues for tenant {tid}")
                    continue
                report = generate_lint_report(results)

                # Store as a seed so it's queryable via chat
                db2 = next(get_db())
                from app.models import Seed as SeedModel
                import uuid as _uuid
                lint_seed = SeedModel(
                    tenant_id=u.tenant_id,
                    user_id=u.id,
                    title=f"Wiki Lint Report — {datetime.utcnow().strftime('%Y-%m-%d')}",
                    content=report,
                    seed_metadata={"source": "wiki_lint_cron", "issues": results["total_issues"]},
                    created_at=datetime.utcnow(),
                )
                db2.add(lint_seed)
                db2.commit()
                db2.close()

                # Email report
                if u.email:
                    from app.email_sender import send_briefing_email
                    briefing = {
                        "type": "wiki_lint",
                        "title": f"🔍 Weekly Wiki Health Report — {results['total_issues']} issues found",
                        "subtitle": f"Checked {len(articles)} articles, {len(seeds)} seeds",
                        "sections": [
                            {"title": "Report", "icon": "checklist", "content": report},
                        ],
                    }
                    send_briefing_email(u.email, briefing)

                # Ingest log
                from app.ingest_log import append_log_entry
                append_log_entry(tid, "wiki_lint", "cron", f"{results['total_issues']} issues found")
            except Exception as e:
                logger.error(f"Wiki lint failed for tenant {tid}: {e}")
    except Exception as e:
        logger.error(f"❌ Wiki lint job failed: {e}")


def _job_wiki_compile():
    """Compile wiki articles from enriched seeds — runs every 6 hours."""
    try:
        import asyncio
        from collections import Counter
        from app.database import get_db
        from app.models import User
        from app.tool_executor import auto_compile_for_domain

        db = next(get_db())
        users = db.query(User).all()
        db.close()
        if not users:
            return
        # Process all users (for now run once per unique tenant)
        seen_tenants = set()
        user_list = []
        for u in users:
            tid = str(u.tenant_id)
            if tid not in seen_tenants:
                seen_tenants.add(tid)
                user_list.append(u)
        user = user_list[0]  # first user drives wiki compile per tenant
        tenant_id = str(user.tenant_id)
        user_id = str(user.id)

        async def _run():
            from app.wiki_pipeline import regenerate_all_backlinks
            from app.models import Seed as SeedModel
            articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)

            # Get seeds — prefer Weaviate, fall back to Postgres
            seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
            if not seeds:
                logger.info("📚 Wiki cron: Weaviate empty, falling back to Postgres")
                db2 = next(get_db())
                pg_seeds = db2.query(SeedModel).filter(
                    SeedModel.tenant_id == user.tenant_id
                ).order_by(SeedModel.created_at.desc()).limit(500).all()
                db2.close()
                seeds = []
                _NOISE = {"none", "untagged", "agent-insight", "general", ""}
                for s in pg_seeds:
                    meta = s.seed_metadata or {}
                    tags_raw = meta.get("tags", "")
                    tags = ", ".join(tags_raw) if isinstance(tags_raw, list) else (tags_raw or "")
                    domain = (meta.get("domain", "") or "").strip().lower()
                    # Fall back to primary tag if domain missing/generic
                    if not domain or domain in _NOISE:
                        tag_list = [t.strip().lower() for t in tags.split(",") if t.strip() and len(t.strip()) > 2]
                        tag_list = [t for t in tag_list if t not in _NOISE]
                        domain = tag_list[0] if tag_list else ""
                    seeds.append({
                        "id": str(s.id),
                        "title": s.title or "",
                        "content": s.content or "",
                        "domain": domain,
                        "tags": tags,
                    })

            # Count seeds per domain — skip noise domains
            _SKIP = {'', 'none', 'untagged', 'general', 'agent-insight'}
            domain_counts = Counter(
                (s.get('domain', '') or '').strip().lower() for s in seeds
                if (s.get('domain', '') or '').strip().lower() not in _SKIP
            )
            wiki_domains = set((a.get('category', '') or '').lower() for a in articles)
            # Also check wiki titles for domain coverage
            wiki_titles_lower = set((a.get('title', '') or '').lower() for a in articles)
            gaps = []
            for d, c in domain_counts.most_common():
                if not d or d in _SKIP:
                    continue
                already_covered = (
                    d in wiki_domains
                    or any(d in wt for wt in wiki_titles_lower)
                )
                if not already_covered and c >= 2:  # lowered from 3 to 2
                    gaps.append({'domain': d, 'count': c})

            logger.info(f"📚 Wiki cron: {len(seeds)} seeds, {len(domain_counts)} domains, {len(gaps)} gaps to compile")
            compiled = 0
            for gap in gaps[:5]:  # up to 5 articles per run (was 3)
                try:
                    result = await auto_compile_for_domain(gap['domain'], tenant_id, user_id)
                    if result:
                        compiled += 1
                    await asyncio.sleep(2)
                except Exception as e:
                    logger.warning(f"📚 Wiki cron: compile failed for domain '{gap['domain']}': {e}")
            backlinks = await regenerate_all_backlinks(tenant_id)
            logger.info(f"📚 Wiki compile: {compiled} new articles, {backlinks} backlinks updated")
            try:
                from app.ingest_log import append_log_entry
                append_log_entry(tenant_id, "wiki_compile", "cron", f"{compiled} articles compiled, {backlinks} backlinks updated")
            except Exception:
                pass

        asyncio.run(_run())
    except Exception as e:
        logger.error(f"❌ Wiki compile job failed: {e}")


scheduler = None  # global reference for dynamic rescheduling

def _start_scheduler():
    global scheduler
    # Load saved schedule config
    saved = _load_schedule()
    scheduler = BackgroundScheduler(timezone=_CET)

    # Morning spark — configurable, default 08:30 CET daily
    ms = saved.get("morning_spark", {})
    scheduler.add_job(
        _job_morning_spark,
        CronTrigger(hour=ms.get("hour", 8), minute=ms.get("minute", 30), timezone=_CET),
        id="morning_spark", replace_existing=True,
    )
    # Daily briefing — configurable, default 09:30 CET daily
    db_cfg = saved.get("daily_briefing", {})
    scheduler.add_job(
        _job_daily_briefing,
        CronTrigger(hour=db_cfg.get("hour", 9), minute=db_cfg.get("minute", 30), timezone=_CET),
        id="daily_briefing", replace_existing=True,
    )
    # Afternoon reflection — configurable, default 16:00 CET daily
    ref = saved.get("reflection", {})
    scheduler.add_job(
        _job_afternoon_reflection,
        CronTrigger(hour=ref.get("hour", 16), minute=ref.get("minute", 0), timezone=_CET),
        id="afternoon_reflection", replace_existing=True,
    )
    # Weekly digest — Sunday 10:00 CET
    scheduler.add_job(
        _job_weekly_digest,
        CronTrigger(day_of_week="sun", hour=10, minute=0, timezone=_CET),
        id="weekly_digest",
        replace_existing=True,
    )
    # Weekly content eval — Sundays 18:00 CET
    scheduler.add_job(
        _job_weekly_eval,
        CronTrigger(day_of_week="sun", hour=18, minute=0, timezone=_CET),
        id="weekly_eval",
        replace_existing=True,
    )
    # Biweekly challenge — 1st and 15th at 10:00 CET
    scheduler.add_job(
        _job_biweekly_challenge,
        CronTrigger(day="1,15", hour=10, minute=0, timezone=_CET),
        id="biweekly_challenge",
        replace_existing=True,
    )
    # Academic + Practical Digest — 07:00 CET (morning) + 18:00 CET (evening)
    ad_cfg = saved.get("academic_digest", {})
    scheduler.add_job(
        _job_academic_digest,
        CronTrigger(hour=ad_cfg.get("hour", 7), minute=ad_cfg.get("minute", 0), timezone=_CET),
        id="academic_digest", replace_existing=True,
    )
    scheduler.add_job(
        lambda: _job_academic_digest(evening=True),
        CronTrigger(hour=18, minute=0, timezone=_CET),
        id="academic_digest_evening", replace_existing=True,
    )
    # Seed enrichment — every 30 minutes
    scheduler.add_job(
        _job_enrich_pending_seeds,
        CronTrigger(minute="*/30", timezone=_CET),
        id="enrich_seeds",
        replace_existing=True,
    )
    # Wiki compilation — every 6 hours
    scheduler.add_job(
        _job_wiki_compile,
        CronTrigger(hour="*/6", minute=5, timezone=_CET),
        id="wiki_compile",
        replace_existing=True,
    )
    # Wiki lint health check — weekly Sunday 08:00 CET
    scheduler.add_job(
        _job_wiki_lint,
        CronTrigger(day_of_week="sun", hour=8, minute=0, timezone=_CET),
        id="wiki_lint",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("✅ APScheduler started — spark 08:30, briefing 09:30, reflection 16:00, weekly eval Sun 18:00, challenge 1st/15th 10:00, enrich */30min, wiki compile */6h, wiki lint Sun 08:00 CET")
    return scheduler


@app.on_event("startup")
def startup_scheduler():
    _start_scheduler()


@app.get("/api/v1/scheduler/jobs")
def list_scheduler_jobs():
    """Dev/debug: list all scheduled jobs and their next run times."""
    from apscheduler.schedulers.background import BackgroundScheduler
    # Re-read from the module-level scheduler instance via atexit/global — use APScheduler state
    return {
        "jobs": [
            {"id": "morning_spark",        "schedule": "daily 08:30 CET", "type": "morning_spark"},
            {"id": "daily_briefing",       "schedule": "daily 09:30 CET", "type": "daily_briefing"},
            {"id": "afternoon_reflection", "schedule": "daily 16:00 CET", "type": "reflection"},
            {"id": "weekly_digest",        "schedule": "Sunday 10:00 CET", "type": "legacy"},
            {"id": "weekly_eval",          "schedule": "Sunday 18:00 CET", "type": "weekly_eval"},
            {"id": "biweekly_challenge",   "schedule": "1st & 15th 10:00 CET", "type": "challenge"},
        ]
    }



@app.post("/api/v1/admin/trigger/{job_id}")
def trigger_job_admin(job_id: str, x_api_key: str = Header(default="")):
    """Trigger a scheduled job via API key — for cron jobs, no user auth required."""
    expected = settings.HARVEST_API_KEY
    if not expected:
        raise HTTPException(status_code=503, detail="Harvest API not configured")
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return _run_trigger_job(job_id)


_SCHEDULE_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "schedule_config.json")

_DEFAULT_SCHEDULE = {
    "morning_spark":    {"enabled": True, "hour": 8,  "minute": 30, "label": "Morning Idea Spark"},
    "academic_digest":  {"enabled": True, "hour": 7,  "minute": 0,  "label": "Academic & Practical Digest"},
    "daily_briefing":   {"enabled": True, "hour": 9,  "minute": 30, "label": "Daily Briefing"},
    "reflection":       {"enabled": True, "hour": 16, "minute": 0,  "label": "Evening Reflection"},
    "weekly_eval":      {"enabled": True, "hour": 18, "minute": 0,  "label": "Weekly Content Eval"},
    "biweekly_challenge":{"enabled": True,"hour": 10, "minute": 0,  "label": "Biweekly Challenge"},
}

def _load_schedule() -> dict:
    try:
        with open(_SCHEDULE_FILE) as f:
            data = json.load(f)
            # Merge with defaults to handle new keys
            merged = dict(_DEFAULT_SCHEDULE)
            for k, v in data.items():
                if k in merged:
                    merged[k].update(v)
            return merged
    except (FileNotFoundError, json.JSONDecodeError):
        return dict(_DEFAULT_SCHEDULE)

def _save_schedule(config: dict):
    os.makedirs(os.path.dirname(_SCHEDULE_FILE), exist_ok=True)
    with open(_SCHEDULE_FILE, "w") as f:
        json.dump(config, f, indent=2)

def _reschedule_job(job_id: str, hour: int, minute: int, enabled: bool):
    """Dynamically reschedule or pause/resume a job in APScheduler."""
    global scheduler
    if scheduler is None:
        return
    try:
        if not enabled:
            scheduler.pause_job(job_id)
        else:
            scheduler.reschedule_job(job_id, trigger=CronTrigger(hour=hour, minute=minute, timezone=_CET))
            scheduler.resume_job(job_id)
    except Exception as e:
        logger.warning(f"Could not reschedule {job_id}: {e}")

@app.get("/api/v1/schedule")
def get_schedule(current_user: User = Depends(get_current_user)):
    """Get current notification schedule configuration."""
    return {"jobs": _load_schedule()}

@app.patch("/api/v1/schedule")
def update_schedule(body: dict, current_user: User = Depends(get_current_user)):
    """Update schedule for one or more jobs. Body: {job_id: {hour, minute, enabled}}"""
    config = _load_schedule()
    for job_id, updates in body.items():
        if job_id not in config:
            continue
        config[job_id].update({k: v for k, v in updates.items() if k in ("hour", "minute", "enabled")})
        _reschedule_job(job_id, config[job_id]["hour"], config[job_id]["minute"], config[job_id]["enabled"])
    _save_schedule(config)
    return {"ok": True, "jobs": config}


@app.post("/api/v1/digest/generate-solution-design")
def generate_solution_design_endpoint(
    body: dict,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db)
):
    """
    Expand a solution_design_seed from an academic digest into a full markdown
    solution design document. Returns the file path and the markdown content.
    Body: {"briefing": {...}} or {"solution_design_seed": "..."}
    """
    briefing = body.get("briefing", {})
    if not briefing and body.get("solution_design_seed"):
        briefing = {"_solution_design_seed": body["solution_design_seed"]}

    filepath = briefings.generate_solution_design(briefing, str(current_user.id), db)
    if not filepath:
        raise HTTPException(status_code=500, detail="Failed to generate solution design")

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        content = ""

    return {"filepath": filepath, "content": content}


class AgentRunRequest(BaseModel):
    topic: str


def _run_agent_job_bg(topic: str, user_id: str, db_gen):
    """Background task: generate a strategy paper and deliver to Inbox."""
    db = next(db_gen())
    try:
        md_content = briefings.run_agent_task(topic, user_id, db)
        if not md_content:
            logger.error(f"[agent] run_agent_task returned None for topic: {topic[:60]}")
            return

        # First 200 chars as preview body
        preview = md_content.replace("#", "").strip()[:200]

        # Build a SparkCard-compatible briefing
        sections = []
        current_title = None
        current_lines = []
        for line in md_content.split("\n"):
            if line.startswith("## "):
                if current_title:
                    sections.append({"title": current_title, "icon": "description", "color": "text-purple-400", "content": "\n".join(current_lines).strip()})
                current_title = line.lstrip("# ").strip()
                current_lines = []
            elif line.startswith("# "):
                pass  # skip top-level title line
            else:
                current_lines.append(line)
        if current_title and current_lines:
            sections.append({"title": current_title, "icon": "description", "color": "text-purple-400", "content": "\n".join(current_lines).strip()})

        # Fallback: wrap whole doc in one section if parsing failed
        if not sections:
            sections = [{"title": "Research Paper", "icon": "description", "color": "text-purple-400", "content": md_content}]

        briefing = {
            "type": f"solution_design_{topic[:20].replace(' ', '_').lower()}",
            "title": f"Strategy Paper: {topic[:60]}",
            "subtitle": "Agentic research paper — tap to read",
            "sections": sections[:8],  # cap at 8 sections for display
            "prompt": f"Let's discuss the strategy paper on: {topic}",
        }

        _sto<RESEND_API_KEY>(briefing)
        logger.info(f"[agent] Strategy paper delivered to Inbox for topic: {topic[:60]}")
    except Exception as e:
        logger.error(f"[agent] Background job failed: {e}", exc_info=True)
    finally:
        db.close()


@app.post("/api/v1/agents/run")
async def run_agent_endpoint(
    req: AgentRunRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """
    Spawn a long-running agent that produces a strategy/implementation paper.
    Returns immediately — paper is delivered to Inbox via push notification when done.
    """
    if not req.topic or not req.topic.strip():
        raise HTTPException(status_code=400, detail="topic is required")

    topic = req.topic.strip()
    background_tasks.add_task(_run_agent_job_bg, topic, str(current_user.id), get_db)
    logger.info(f"[agent] Queued research paper for user {current_user.id}, topic: {topic[:60]}")
    return {
        "status": "started",
        "message": f"Agent is researching '{topic[:60]}' — you'll receive a push notification when the paper is ready (usually 1–3 minutes).",
    }


def _run_trigger_job(job_id: str):
    """Shared logic for triggering a scheduled job by ID."""
    print(f"🔔 TRIGGER ENDPOINT CALLED: job_id={job_id}", flush=True)
    jobs = {
        "morning_spark": _job_morning_spark,
        "daily_briefing": _job_daily_briefing,
        "reflection": _job_afternoon_reflection,
        "afternoon_reflection": _job_afternoon_reflection,
        "weekly_digest": _job_weekly_digest,
        "weekly_eval": _job_weekly_eval,
        "biweekly_challenge": _job_biweekly_challenge,
        "academic_digest": _job_academic_digest,
        "wiki_compile": _job_wiki_compile,
        "academic_digest_evening": _job_academic_digest,
    }
    fn = jobs.get(job_id)
    if not fn:
        raise HTTPException(status_code=404, detail=f"Unknown job: {job_id}. Available: {list(jobs.keys())}")
    print(f"  Calling function: {fn.__name__}", flush=True)
    try:
        fn()
        print(f"  Function completed successfully", flush=True)
        return {"status": "triggered", "job": job_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/scheduler/trigger/{job_id}")
def trigger_job_now(job_id: str, current_user: User = Depends(get_current_user)):
    """Manually trigger a scheduled job (requires user auth)."""
    return _run_trigger_job(job_id)


@app.post("/api/v1/email/test")
def send_test_email(current_user: User = Depends(get_current_user)):
    """Send a test email to the authenticated user to verify Resend is configured."""
    if not settings.RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="Email not configured — add RESEND_API_KEY to server .env")
    if not current_user.email:
        raise HTTPException(status_code=400, detail="No email address on account")
    test_briefing = {
        "type": "daily_briefing",
        "title": "Seedify Email Test",
        "subtitle": "Your email delivery is working",
        "sections": [
            {
                "title": "Connection Verified",
                "icon": "check_circle",
                "content": (
                    "This is a test email from Seedify confirming that email delivery is configured correctly.\n\n"
                    "You will receive your daily digests at the scheduled times automatically."
                ),
                "sources": [],
            }
        ],
    }
    ok = email_sender.send_briefing_email(current_user.email, test_briefing)
    if ok:
        return {"status": "ok", "message": f"Test email sent to {current_user.email}"}
    raise HTTPException(status_code=500, detail="Failed to send email — check RESEND_API_KEY and sender domain")

# ── Debug: test search_wiki directly ──────────────────────
@app.get("/api/v1/debug/search_wiki")
async def debug_search_wiki(q: str = "agentic AI"):
    import logging
    logging.basicConfig(level=logging.INFO)
    
    from app.tool_executor import search_wiki
    import asyncio, json
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[DEBUG] search_wiki called with: {q}")
    
    class F: pass
    result = await search_wiki({'query': q, 'limit': 3}, F(), F())
    return json.loads(result)
