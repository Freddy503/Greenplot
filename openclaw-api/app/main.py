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
from pydantic import BaseModel, EmailStr, Field
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
    if _vapid_key_b64:
        import base64
        VAPID_PRIVATE_KEY = base64.b64decode(_vapid_key_b64.strip()).decode('utf-8')
        logger.info("✅ VAPID private key loaded from VAPID_PRIVATE_KEY_BASE64 env var")
    elif os.path.exists(_vapid_key_path):
        with open(_vapid_key_path, "r") as f:
            VAPID_PRIVATE_KEY = f.read().strip()
        logger.info(f"✅ VAPID private key loaded from {_vapid_key_path}")
    else:
        logger.warning("⚠️ VAPID private key not found — set VAPID_PRIVATE_KEY_BASE64 env var or place .vapid_private.pem alongside the app")
except Exception as e:
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

    # GitHub repo connections (docs/specs/github-repo-sync.md)
    result_gh = conn.execute(text("SELECT tablename FROM pg_tables WHERE tablename='github_connections'"))
    if not result_gh.fetchone():
        conn.execute(text("""
            CREATE TABLE github_connections (
                id UUID PRIMARY KEY,
                tenant_id UUID NOT NULL UNIQUE,
                repo_full_name VARCHAR(200) NOT NULL,
                token_enc TEXT NOT NULL,
                default_branch VARCHAR(100) DEFAULT 'main',
                webhook_secret VARCHAR(64),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.commit()

    # seed_type column (idea/spec/paper/learning/log) — model has it, old tables may not
    result_st = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='seeds' AND column_name='seed_type'"))
    if not result_st.fetchone():
        conn.execute(text("ALTER TABLE seeds ADD COLUMN seed_type VARCHAR(32) DEFAULT 'idea'"))
        conn.commit()

    # Backfill paper metadata on research-paper seeds saved before the digest
    # started writing pdf_url/paper_url/seed_type — makes existing digest
    # papers viewable (embedded PDF) in Studio's "Ideas ready to develop".
    # seed_metadata is a json (not jsonb) column, so cast for ? and ||.
    try:
        conn.execute(text("""
            UPDATE seeds SET
                seed_type = 'paper',
                seed_metadata = (seed_metadata::jsonb
                    || jsonb_build_object(
                        'seed_type', 'paper',
                        'paper_url', seed_metadata->>'source_url',
                        'pdf_url', replace(seed_metadata->>'source_url', '/abs/', '/pdf/')
                    ))::json
            WHERE (seed_metadata->'tags')::jsonb ? 'research-paper'
              AND seed_metadata->>'source_url' LIKE '%arxiv.org/abs/%'
              AND COALESCE(seed_metadata->>'pdf_url', '') = ''
        """))
        conn.commit()
    except Exception as _bf_err:
        # Roll back so the aborted transaction doesn't poison the rest of the
        # startup migrations on this connection (InFailedSqlTransaction)
        conn.rollback()
        logger.warning(f"Paper metadata backfill skipped: {_bf_err}")

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
    result10 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='consents'"))
    if not result10.fetchone():
        conn.execute(text("ALTER TABLE users ADD COLUMN consents JSONB DEFAULT '{}'::jsonb"))
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

# MCP v2: per-user API keys + Streamable HTTP transport (docs/specs/mcp-server-v2.md)
from app.api_keys import router as api_keys_router  # noqa: E402
from app.mcp_http import router as mcp_router  # noqa: E402
app.include_router(api_keys_router)
app.include_router(mcp_router)

@app.get("/")
def read_root():
    return FileResponse(os.path.join(os.path.dirname(__file__), "..", "static", "index.html"))

# --- Auth endpoints ---

def _invite_code_valid(code: Optional[str]) -> bool:
    normalized = (code or "").strip().upper()
    valid = {c.strip().upper() for c in settings.INVITE_CODES.split(",") if c.strip()}
    return normalized in valid

@app.post("/api/v1/register", response_model=AuthResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if settings.INVITE_REQUIRED and not _invite_code_valid(req.invite_code):
        raise HTTPException(status_code=403, detail="A valid invite code is required")
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    consents = dict(req.consents or {})
    if req.push_choice:
        consents["push"] = req.push_choice == "yes"
    user = User(
        email=req.email,
        password_hash=get_password_hash(req.password),
        tenant_id=uuid.uuid4(),
        city=req.city,
        nickname=req.nickname,
        interests=req.interests or [],
        digest_frequency=req.digest_frequency or 'once-daily',
        consents=consents,
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
    consents: Optional[dict] = None  # {enrich, web, calendar, push}

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
        "consents": getattr(current_user, "consents", None) or {},
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
    if req.consents is not None:
        current_user.consents = {**(current_user.consents or {}), **req.consents}
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

        # True total (not capped by limit) so the Garden stat chips are accurate
        total = db.query(func.count(Seed.id)).filter(
            Seed.tenant_id == current_user.tenant_id,
            (Seed.archived == False) | (Seed.archived == None)
        ).scalar() or len(seeds)

        return SeedSearchResponse(seeds=seeds, query=None, total=total)

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
    
    # Extract metadata fields for richer response.
    # Normalize tags to str — paper/enriched seeds store them as a list, and a
    # list here 500s the response model (broke the draft-PRD status poll).
    metadata = seed.seed_metadata or {}
    raw_tags = metadata.get("tags", "")
    seed.tags = ", ".join(raw_tags) if isinstance(raw_tags, list) else (raw_tags or "")
    seed.domain = metadata.get("domain", "") or ""
    seed.energy = metadata.get("energy", "") or ""
    seed.summary = metadata.get("summary", "") or ""

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
    # Paper seeds: purge full-text chunks too (GDPR + spec requirement)
    try:
        weaviate_client.delete_paper_chunks(seed_id)
    except Exception:
        pass
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


@app.post("/api/v1/seeds/deduplicate")
def deduplicate_seeds(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Delete duplicate seeds for the current user.
    Within each group of seeds sharing the same normalized title, keeps the one with the
    richest metadata (has summary + domain) and falls back to the oldest if equal.
    """
    from collections import defaultdict

    seeds = db.query(Seed).filter(
        Seed.user_id == current_user.id
    ).order_by(Seed.created_at.asc()).all()

    # Group by normalized title
    groups: dict = defaultdict(list)
    for s in seeds:
        key = (s.title or "").lower().strip()[:120]
        groups[key].append(s)

    deleted_ids: list = []
    for key, group in groups.items():
        if len(group) < 2:
            continue
        # Score: prefer seeds with richer metadata
        def _score(s):
            meta = s.seed_metadata or {}
            return (
                bool(meta.get("summary")),
                bool(meta.get("domain") and meta["domain"] not in ("General", "")),
                bool(meta.get("tags")),
                s.created_at or 0,
            )
        group.sort(key=_score, reverse=True)
        keep = group[0]
        for dup in group[1:]:
            db.delete(dup)
            deleted_ids.append(str(dup.id))
            # Best-effort: remove from Weaviate
            try:
                ref = dup.embedding_ref or str(dup.id)
                weaviate_client.delete_seed(ref)
            except Exception:
                pass

    db.commit()
    return {"ok": True, "deduped": len(deleted_ids), "deleted_ids": deleted_ids}


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

# --- Spec Architecture Diagrams (Mermaid) ---


def _extract_architecture_section(content: str) -> str:
    """Pull the '## System Architecture' section out of a PRD, if present."""
    import re as _re
    match = _re.search(
        r'^##\s*(?:System\s+)?Architecture\b(.*?)(?=^##\s|\Z)',
        content, _re.MULTILINE | _re.DOTALL | _re.IGNORECASE,
    )
    return match.group(1).strip() if match else ""


MERMAID_DIAGRAM_PROMPT = """You generate software architecture diagrams as Mermaid flowchart code.

Rules:
- Output ONLY Mermaid code, no fences, no commentary. Start with: flowchart TB
- Three subgraphs in order: CLIENTS["Clients & Interfaces"], APP["Application & Services"], DATA["Data & Infrastructure"]. External third-party services go in a fourth subgraph EXT["External Services"].
- 6-12 nodes total. Node labels: short, specific names in double quotes, e.g. NX["Next.js Frontend"]. Use real component names from the brief.
- Edges with labels for data flows: A -->|"REST"| B. Every edge must be meaningful.
- No styling directives except: classDef ext stroke-dasharray: 5 5; applied to external nodes via class.
- Valid Mermaid only: alphanumeric node ids, all labels quoted."""


class MermaidDiagramResponse(BaseModel):
    mermaid: str
    seed_id: str


@app.post("/api/v1/specs/{seed_id}/diagram-code", response_model=MermaidDiagramResponse)
async def generate_spec_diagram_code(
    seed_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate the architecture diagram as Mermaid code (deterministic render).

    Text-native diagrams: diffusion models cannot spell or
    keep structure coherent — text-model-generated Mermaid can. ~5s, one
    small LLM call; the frontend renders it client-side.
    """
    try:
        seed_uuid = uuid.UUID(seed_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid seed id")
    seed = db.query(Seed).filter(
        Seed.id == seed_uuid,
        Seed.tenant_id == current_user.tenant_id,
    ).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Spec not found")

    content = seed.content or ""
    arch_section = _extract_architecture_section(content)
    brief = arch_section or f"{seed.title}. {content[:1200]}"

    from app.briefings import _call_llm
    code = _call_llm(
        f"ARCHITECTURE BRIEF:\n{brief[:4000]}\n\nGenerate the Mermaid diagram now.",
        system=MERMAID_DIAGRAM_PROMPT,
        max_tokens=2500,
        model=settings.CHAT_MODEL,
    )
    # Strip accidental fences and validate the shape
    code = (code or "").strip()
    code = code.removeprefix("```mermaid").removeprefix("```").removesuffix("```").strip()
    if not code.startswith(("flowchart", "graph")):
        raise HTTPException(status_code=502, detail="Diagram generation failed — try again")

    meta = dict(seed.seed_metadata or {})
    meta["diagram_mermaid"] = code
    meta["diagram_generated_at"] = datetime.utcnow().isoformat()
    seed.seed_metadata = meta
    db.commit()

    return MermaidDiagramResponse(mermaid=code, seed_id=str(seed.id))


class PaperIngestRequest(BaseModel):
    arxiv_id: Optional[str] = None
    url: Optional[str] = None


@app.post("/api/v1/papers/ingest")
async def ingest_paper_endpoint(
    req: PaperIngestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Ingest a research paper (e.g. from the Academic Digest) as a 'paper' seed.

    Same logic as the ingest_paper chat tool, exposed for the Library UI.
    """
    if not req.arxiv_id and not req.url:
        raise HTTPException(status_code=422, detail="Provide an arxiv_id or url")
    from app.tool_executor import ingest_paper
    result = json.loads(await ingest_paper(
        {"arxiv_id": req.arxiv_id or "", "url": req.url or ""}, current_user, db
    ))
    if result.get("status") == "error":
        raise HTTPException(status_code=422, detail=result.get("message", "Paper ingestion failed"))
    return result


# --- Knowledge graph v2: dual-edge payload (explicit + semantic) ---
# Spec: docs/specs/knowledge-graph-v2.md

@app.get("/api/v1/graph")
def get_knowledge_graph(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Nodes + dual edges for the graph view.

    Explicit edges come from Postgres seed_links (the user's brain);
    semantic edges from Weaviate nearest-neighbors with certainty > 0.85,
    top 2 per node (the AI's brain). Cached 5 minutes per tenant.
    """
    from app.models import SeedLink
    tenant_id = str(current_user.tenant_id)

    try:
        from app.cache import get_cached, set_cached
        cached = get_cached(f"graph:{tenant_id}")
        if cached:
            return cached
    except Exception:
        get_cached = set_cached = None  # Redis down — compute uncached

    seeds = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        (Seed.archived == False) | (Seed.archived == None)
    ).order_by(Seed.created_at.desc()).limit(300).all()

    seed_ids = {str(s.id) for s in seeds}
    ref_to_id = {s.embedding_ref: str(s.id) for s in seeds if s.embedding_ref}

    # Explicit edges — the user's brain
    links = []
    seen_pairs = set()
    degree: dict = {}
    rows = db.query(SeedLink).filter(SeedLink.source_seed_id.in_([s.id for s in seeds])).all()
    for r in rows:
        a, b = str(r.source_seed_id), str(r.target_seed_id)
        if b not in seed_ids:
            continue
        key = tuple(sorted((a, b)))
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        links.append({"source": a, "target": b, "type": "explicit", "linkType": r.link_type or "related"})
        degree[a] = degree.get(a, 0) + 1
        degree[b] = degree.get(b, 0) + 1

    # Semantic edges — the AI's brain (top 2 neighbors, certainty > 0.85)
    for s in seeds[:150]:
        if not s.embedding_ref:
            continue
        for hit in weaviate_client.near_object_seeds(tenant_id, s.embedding_ref, limit=2):
            if hit["certainty"] <= 0.85:
                continue
            other = ref_to_id.get(hit["id"])
            if not other or other == str(s.id):
                continue
            key = tuple(sorted((str(s.id), other)))
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            links.append({"source": str(s.id), "target": other, "type": "semantic", "strength": round(hit["certainty"], 3)})
            degree[str(s.id)] = degree.get(str(s.id), 0) + 1
            degree[other] = degree.get(other, 0) + 1

    nodes = []
    for s in seeds:
        meta = s.seed_metadata or {}
        sid = str(s.id)
        nodes.append({
            "id": sid,
            "title": s.title or "Untitled",
            "group": (meta.get("domain") or "untagged").strip() or "untagged",
            "size": min(6 + 2 * degree.get(sid, 0), 22),
            "seedType": s.seed_type or meta.get("seed_type") or "idea",
        })

    # Hierarchy layer: product → pillar → PRD, plus paper → PRD provenance
    # (product-atlas.md m4 — all from metadata, zero LLM calls)
    for s in seeds:
        meta = s.seed_metadata or {}
        if not isinstance(meta, dict):
            continue
        sid = str(s.id)
        if s.seed_type == "product":
            for n in nodes:
                if n["id"] == sid:
                    n["size"] = 26
            for p in (meta.get("pillars") or []):
                pid = f"pillar:{sid}:{p.get('id')}"
                nodes.append({"id": pid, "title": p.get("name", "Pillar"), "group": "pillar",
                              "size": 12, "seedType": "pillar"})
                links.append({"source": sid, "target": pid, "type": "hierarchy"})
        else:
            prod_id = meta.get("product_id")
            if prod_id and prod_id in seed_ids:
                if meta.get("pillar_id") is not None:
                    links.append({"source": f"pillar:{prod_id}:{meta['pillar_id']}", "target": sid, "type": "hierarchy"})
                else:
                    links.append({"source": prod_id, "target": sid, "type": "hierarchy"})
            src_paper = meta.get("source_paper_id")
            if src_paper and src_paper in seed_ids:
                links.append({"source": src_paper, "target": sid, "type": "derived"})

    payload = {"nodes": nodes, "links": links}
    try:
        if set_cached:
            set_cached(f"graph:{tenant_id}", payload, ttl=300)
    except Exception:
        pass
    return payload


# --- Manual seed editing (Studio PRD editor) ---

class SeedUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    content: Optional[str] = Field(default=None, max_length=50_000)


@app.patch("/api/v1/seeds/{seed_id}")
def patch_seed(
    seed_id: str,
    req: SeedUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a seed's title/content manually (Studio PRD editor)."""
    if req.title is None and req.content is None:
        raise HTTPException(status_code=422, detail="Provide title and/or content")
    try:
        seed_uuid = uuid.UUID(seed_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid seed id")

    seed = db.query(Seed).filter(
        Seed.id == seed_uuid,
        Seed.tenant_id == current_user.tenant_id,
    ).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Seed not found")

    if req.title is not None and req.title.strip():
        seed.title = req.title.strip()
    if req.content is not None:
        seed.content = req.content
    meta = dict(seed.seed_metadata or {})
    meta["edited_at"] = datetime.utcnow().isoformat()
    seed.seed_metadata = meta
    db.commit()
    db.refresh(seed)

    # Re-index in Weaviate (best-effort)
    try:
        from app.enricher_v2 import embed_text
        embedding = embed_text(f"{seed.title}\n{(seed.content or '')[:500]}")
        weaviate_client.add_seed(
            tenant_id=str(current_user.tenant_id),
            user_id=str(current_user.id),
            thought_id=None,
            title=seed.title,
            content=seed.content or "",
            embedding=embedding,
            metadata=seed.seed_metadata or {},
            image_url=seed.image_url,
            created_at=seed.created_at.isoformat() if seed.created_at else None,
        )
    except Exception as e:
        logger.warning(f"Weaviate re-index failed for edited seed {seed.id}: {e}")

    return {"status": "ok", "seed_id": str(seed.id), "title": seed.title}


# --- Research paper full-text pipeline (spec: docs/specs/paper-parsing-pipeline.md) ---

class PaperSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    seed_id: Optional[str] = None
    limit: int = Field(default=5, ge=1, le=10)


@app.post("/api/v1/papers/search")
async def search_papers_endpoint(
    req: PaperSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Semantic search over parsed paper chunks (REST face of search_paper_content)."""
    from app.tool_executor import search_paper_content
    result = json.loads(await search_paper_content(
        {"query": req.query, "seed_id": req.seed_id or "", "limit": req.limit},
        current_user, db,
    ))
    return result


@app.post("/api/v1/papers/{seed_id}/parse")
def parse_paper_endpoint(
    seed_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Queue (re-)parsing of one paper seed's full text."""
    try:
        seed_uuid = uuid.UUID(seed_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid seed id")
    seed = db.query(Seed).filter(
        Seed.id == seed_uuid,
        Seed.tenant_id == current_user.tenant_id,
    ).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Paper seed not found")

    from app.paper_pipeline import enqueue_or_run_parse
    task_id = enqueue_or_run_parse(seed_id, str(current_user.tenant_id), db=None)
    if task_id:
        return {"status": "queued", "task_id": task_id, "seed_id": seed_id}
    # Queue unavailable — run inline as a fallback (slower request, still works)
    from app.paper_pipeline import parse_paper_for_seed
    return parse_paper_for_seed(seed_id, str(current_user.tenant_id), db)


@app.post("/api/v1/papers/parse-all")
def parse_all_papers_endpoint(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Backfill: queue full-text parsing for all of the user's unparsed paper seeds."""
    seeds = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        Seed.seed_type == "paper",
    ).all()
    from app.paper_pipeline import enqueue_or_run_parse
    queued = 0
    for s in seeds:
        meta = s.seed_metadata or {}
        if meta.get("parse_status") == "parsed":
            continue
        if enqueue_or_run_parse(str(s.id), str(current_user.tenant_id)):
            queued += 1
    return {"status": "ok", "queued": queued, "total_papers": len(seeds)}


# --- Tree backfill: doc trees for already-parsed papers (tree-retrieval.md) ---

def _run_tree_backfill_job(tenant_id: str):
    from app.database import SessionLocal
    from app.tree_retrieval import tree_from_chunks
    job_db = SessionLocal()
    try:
        rows = job_db.query(Seed).filter(Seed.tenant_id == uuid.UUID(tenant_id)).all()
        built = 0
        for s in rows:
            m = s.seed_metadata or {}
            if not isinstance(m, dict) or m.get("parse_status") != "parsed" or m.get("doc_tree"):
                continue
            tree = tree_from_chunks(str(s.id))
            if tree:
                mm = dict(m)
                mm["doc_tree"] = tree
                mm["tree_built_at"] = datetime.utcnow().isoformat()
                s.seed_metadata = mm
                job_db.commit()
                built += 1
        logger.info(f"[tree_retrieval] backfill complete: {built} trees built")
    except Exception as e:
        logger.error(f"[tree_retrieval] backfill crashed: {e}")
    finally:
        job_db.close()


@app.post("/api/v1/papers/tree-all", status_code=202)
async def build_all_trees(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Build doc trees for parsed papers that lack one (from stored chunks)."""
    pending = 0
    for s in db.query(Seed).filter(Seed.tenant_id == current_user.tenant_id).all():
        m = s.seed_metadata or {}
        if isinstance(m, dict) and m.get("parse_status") == "parsed" and not m.get("doc_tree"):
            pending += 1
    background_tasks.add_task(_run_tree_backfill_job, str(current_user.tenant_id))
    return {"status": "queued", "pending_trees": pending,
            "message": f"Building doc trees for {pending} papers — watch the api logs for progress."}


# --- Auto-PRD: manual trigger for any paper (bypasses relevance gate) ---

def _run_draft_prd_job(seed_id: str, tenant_id: str, replace_draft_id: str = None):
    """Background draft generation with its own DB session (the request's
    session is closed by the time this runs)."""
    from app.database import SessionLocal
    from app.auto_prd import auto_prd_for_paper
    job_db = SessionLocal()
    try:
        result = auto_prd_for_paper(seed_id, tenant_id, job_db, force=True,
                                    replace_draft_id=replace_draft_id)
        logger.info(f"[auto_prd] manual draft for {seed_id}: {result.get('status')} ({result.get('title', result.get('reason', ''))})")
    except Exception as e:
        logger.error(f"[auto_prd] manual draft failed for {seed_id}: {e}")
        # Surface the crash to the polling UI
        try:
            s = job_db.query(Seed).filter(Seed.id == uuid.UUID(seed_id)).first()
            if s:
                m = dict(s.seed_metadata or {})
                m["auto_prd"] = "error_exception"
                m["draft_prd_error"] = str(e)[:200]
                s.seed_metadata = m
                job_db.commit()
        except Exception:
            job_db.rollback()
    finally:
        job_db.close()


@app.post("/api/v1/papers/{seed_id}/draft-prd", status_code=202)
async def draft_prd_for_paper(
    seed_id: str,
    background_tasks: BackgroundTasks,
    replace: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Queue draft-PRD generation for a paper (Studio 'Draft PRD' button).

    Generation takes ~30s — far beyond Vercel's proxy-function timeout — so
    this returns 202 immediately and the draft appears in the Studio drafts
    strip when ready. The autopilot path runs the same logic on the worker.
    """
    try:
        seed_uuid = uuid.UUID(seed_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid seed id")
    seed = db.query(Seed).filter(
        Seed.id == seed_uuid,
        Seed.tenant_id == current_user.tenant_id,
    ).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Paper not found")
    meta = seed.seed_metadata or {}
    if meta.get("parse_status") not in ("parsed", None) and not meta.get("chunk_count"):
        raise HTTPException(status_code=422, detail=f"Paper not parsed yet (status: {meta.get('parse_status')})")

    # Mark as drafting so the UI can poll this seed's metadata for the outcome
    m = dict(seed.seed_metadata or {})
    m["auto_prd"] = "drafting"
    m.pop("draft_prd_error", None)
    seed.seed_metadata = m
    db.commit()

    background_tasks.add_task(_run_draft_prd_job, seed_id, str(current_user.tenant_id), replace)
    return {"status": "queued", "seed_id": seed_id, "message": "Draft PRD generation started — it will appear in Studio drafts in about a minute."}


# --- GitHub repo sync (docs/specs/github-repo-sync.md) ---

class GitHubConnectRequest(BaseModel):
    repo_full_name: str = Field(..., pattern=r"^[\w.-]+/[\w.-]+$")
    token: str = Field(..., min_length=20, max_length=400)


@app.post("/api/v1/github/connect")
def github_connect(
    req: GitHubConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.github_sync import connect_repo
    try:
        result = connect_repo(str(current_user.tenant_id), req.repo_full_name, req.token, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitHub validation failed: {e}")
    result["webhook_url"] = "https://api.greenplot.ink/api/v1/github/webhook"
    return result


@app.get("/api/v1/github/connection")
def github_connection(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.github_sync import get_connection
    oauth_available = bool(settings.GITHUB_OAUTH_CLIENT_ID and settings.GITHUB_OAUTH_CLIENT_SECRET)
    conn = get_connection(str(current_user.tenant_id), db)
    if not conn:
        return {"connected": False, "oauth_available": oauth_available, "oauth_pending": False}
    if not conn["repo_full_name"]:
        # OAuth done, repo not picked yet
        return {"connected": False, "oauth_available": oauth_available, "oauth_pending": True}
    return {"connected": True, "oauth_available": oauth_available, "oauth_pending": False,
            "repo_full_name": conn["repo_full_name"],
            "default_branch": conn["default_branch"], "webhook_secret": conn["webhook_secret"],
            "webhook_url": "https://api.greenplot.ink/api/v1/github/webhook"}


# ── One-click GitHub connect (OAuth app flow) ────────────────────────────────

@app.get("/api/v1/github/oauth/start")
def github_oauth_start(current_user: User = Depends(get_current_user)):
    """Authorize URL for the GitHub OAuth app. State carries the user identity."""
    if not (settings.GITHUB_OAUTH_CLIENT_ID and settings.GITHUB_OAUTH_CLIENT_SECRET):
        raise HTTPException(status_code=503, detail="GitHub OAuth not configured — use a PAT instead")
    from urllib.parse import urlencode
    state = create_access_token(
        data={"sub": str(current_user.id), "tenant_id": str(current_user.tenant_id), "type": "gh_oauth"},
        expires_minutes=10,
    )
    return {"url": "https://github.com/login/oauth/authorize?" + urlencode({
        "client_id": settings.GITHUB_OAUTH_CLIENT_ID,
        "scope": "repo",
        "state": state,
        "redirect_uri": "https://api.greenplot.ink/api/v1/github/oauth/callback",
    })}


@app.get("/api/v1/github/oauth/callback")
def github_oauth_callback(code: str = "", state: str = "", db: Session = Depends(get_db)):
    """GitHub redirects here; exchange the code, park the token, send the
    browser back to Settings to pick a repo."""
    from fastapi.responses import RedirectResponse
    from app.auth import decode_token
    from app.github_sync import sto<RESEND_API_KEY>
    fail = f"{settings.FRONTEND_URL}/settings?github=error"
    try:
        payload = decode_token(state)
        if payload.get("type") != "gh_oauth":
            return RedirectResponse(fail)
        tenant_id = payload.get("tenant_id", "")
        import httpx as _httpx
        resp = _httpx.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={"client_id": settings.GITHUB_OAUTH_CLIENT_ID,
                  "client_secret": settings.GITHUB_OAUTH_CLIENT_SECRET,
                  "code": code},
            timeout=15,
        )
        token = resp.json().get("access_token", "")
        if not token:
            logger.warning(f"[github-oauth] exchange failed: {resp.text[:200]}")
            return RedirectResponse(fail)
        sto<RESEND_API_KEY>(tenant_id, token, db)
        return RedirectResponse(f"{settings.FRONTEND_URL}/settings?github=pick")
    except Exception as e:
        logger.error(f"[github-oauth] callback failed: {e}")
        return RedirectResponse(fail)


@app.get("/api/v1/github/repos")
def github_list_repos(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Repos the connected OAuth token can push to (for the picker)."""
    from app.github_sync import get_stored_token, list_user_repos
    token = get_stored_token(str(current_user.tenant_id), db)
    if not token:
        raise HTTPException(status_code=422, detail="No GitHub authorization yet — connect first")
    try:
        return {"repos": list_user_repos(token)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitHub repo listing failed: {e}")


class GitHubPickRequest(BaseModel):
    repo_full_name: str


@app.post("/api/v1/github/connect-oauth")
def github_connect_oauth(
    req: GitHubPickRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Finish the OAuth flow: bind the parked token to the chosen repo."""
    from app.github_sync import connect_repo, get_stored_token
    token = get_stored_token(str(current_user.tenant_id), db)
    if not token:
        raise HTTPException(status_code=422, detail="No GitHub authorization yet — connect first")
    try:
        result = connect_repo(str(current_user.tenant_id), req.repo_full_name, token, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    result["webhook_url"] = "https://api.greenplot.ink/api/v1/github/webhook"
    return result


@app.delete("/api/v1/github/connection")
def github_disconnect(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.github_sync import disconnect_repo
    disconnect_repo(str(current_user.tenant_id), db)
    return {"ok": True}


@app.get("/api/v1/github/repo-map")
def github_repo_map(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.github_sync import get_repo_map_for_tenant
    repo_map = get_repo_map_for_tenant(str(current_user.tenant_id), db)
    if not repo_map:
        raise HTTPException(status_code=404, detail="No repo connected (or map build failed)")
    return {"map": repo_map}


@app.post("/api/v1/specs/{seed_id}/ship")
def ship_spec_to_github(
    seed_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Open a PR adding this PRD as docs/specs/<slug>.md + the implementation issue."""
    from app.github_sync import get_connection, ship_spec
    conn = get_connection(str(current_user.tenant_id), db)
    if not conn:
        raise HTTPException(status_code=422, detail="No GitHub repo connected — add one in Settings → Integrations")
    try:
        seed_uuid = uuid.UUID(seed_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid seed id")
    seed = db.query(Seed).filter(Seed.id == seed_uuid, Seed.tenant_id == current_user.tenant_id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Spec not found")

    try:
        result = ship_spec(conn, seed.title, seed.content or "", str(seed.id))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitHub ship failed: {str(e)[:200]}")

    m = dict(seed.seed_metadata or {})
    m["ship_pr_url"] = result["pr_url"]
    m["ship_issue_url"] = result["issue_url"]
    m["build_pr_url"] = result["pr_url"]
    m["build_status"] = "ready"
    m["repo_full_name"] = conn["repo_full_name"]
    seed.seed_metadata = m
    db.commit()
    return result


@app.post("/api/v1/github/webhook")
async def github_webhook(request: Request, db: Session = Depends(get_db)):
    """PR merged → spec marked Built. HMAC-verified, zero LLM calls."""
    from app.github_sync import verify_webhook, handle_merged_pr
    payload = await request.body()
    try:
        data = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")

    repo_full_name = (data.get("repository") or {}).get("full_name", "")
    row = db.execute(text("SELECT webhook_secret FROM github_connections WHERE repo_full_name = :r"),
                     {"r": repo_full_name}).fetchone()
    if not row:
        return {"ok": True, "ignored": "unknown repo"}
    if not verify_webhook(row[0], payload, request.headers.get("X-Hub-Signature-256", "")):
        raise HTTPException(status_code=401, detail="Bad signature")

    pr = data.get("pull_request") or {}
    if data.get("action") == "closed" and pr.get("merged"):
        seed_id = handle_merged_pr(repo_full_name, pr.get("html_url", ""), db)
        return {"ok": True, "built_seed": seed_id}
    return {"ok": True}


# --- Design Vision Doc: one visual identity per PRD batch ---

class DesignVisionRequest(BaseModel):
    seed_ids: List[str] = Field(..., min_length=2, max_length=12)


def _run_design_vision_job(seed_ids: list, user_id: str):
    from app.database import SessionLocal
    from app.design_vision import generate_design_vision
    job_db = SessionLocal()
    try:
        user = job_db.query(User).filter(User.id == user_id).first()
        result = generate_design_vision(seed_ids, user, job_db) if user else {"status": "error", "reason": "user_not_found"}
        logger.info(f"[design_vision] job: {result.get('status')} ({result.get('title', result.get('reason', ''))})")
        # Poll target: first seed's metadata carries the outcome
        first = job_db.query(Seed).filter(Seed.id == uuid.UUID(seed_ids[0])).first()
        if first:
            m = dict(first.seed_metadata or {})
            m["design_vision_status"] = "done" if result.get("status") == "ok" else f"error_{result.get('reason', 'unknown')}"
            first.seed_metadata = m
            job_db.commit()
    except Exception as e:
        logger.error(f"[design_vision] job crashed: {e}")
        try:
            first = job_db.query(Seed).filter(Seed.id == uuid.UUID(seed_ids[0])).first()
            if first:
                m = dict(first.seed_metadata or {})
                m["design_vision_status"] = "error_exception"
                first.seed_metadata = m
                job_db.commit()
        except Exception:
            job_db.rollback()
    finally:
        job_db.close()


@app.post("/api/v1/design-vision", status_code=202)
async def create_design_vision(
    req: DesignVisionRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Queue Design Vision generation for a batch of PRD seeds (~1-2 min).

    Poll the first seed's metadata.design_vision_status for the outcome.
    """
    try:
        ids = [uuid.UUID(s) for s in req.seed_ids]
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid seed id in batch")
    owned = db.query(func.count(Seed.id)).filter(
        Seed.id.in_(ids), Seed.tenant_id == current_user.tenant_id
    ).scalar() or 0
    if owned != len(ids):
        raise HTTPException(status_code=404, detail="One or more PRDs not found")

    first = db.query(Seed).filter(Seed.id == ids[0]).first()
    m = dict(first.seed_metadata or {})
    m["design_vision_status"] = "generating"
    first.seed_metadata = m
    db.commit()

    background_tasks.add_task(_run_design_vision_job, req.seed_ids, str(current_user.id))
    return {"status": "queued", "poll_seed_id": req.seed_ids[0],
            "message": "Design vision generation started — it lands in the Library in ~2 minutes."}


# --- Improve a PRD in place: rubric critique-and-revise without a source paper ---

def _run_improve_prd_job(seed_id: str, tenant_id: str):
    from app.database import SessionLocal
    job_db = SessionLocal()
    try:
        seed = job_db.query(Seed).filter(Seed.id == uuid.UUID(seed_id)).first()
        if not seed or not (seed.content or "").strip():
            return
        from app.auto_prd import _critique_draft, PRD_TEMPLATE_V2
        from app.briefings import _call_llm
        content = seed.content
        critique = _critique_draft(content)
        quality, score = "ok", critique["score"]
        if critique["failures"]:
            failures_txt = "\n".join(f"- {f}" for f in critique["failures"])
            revised = _call_llm(
                f"""This PRD failed review. Fix EVERY failure below and return the complete revised
PRD (keep its structure and everything that already works):

FAILURES:
{failures_txt}

CURRENT PRD:
{content[:18000]}""",
                system=PRD_TEMPLATE_V2, max_tokens=8000, model=settings.CHAT_MODEL)
            if revised and len(revised) > 600:
                content = revised
                recheck = _critique_draft(content)
                score = recheck["score"]
                if len(recheck["failures"]) >= 3:
                    quality = "rough"
            else:
                quality = "rough"
        seed.content = content
        m = dict(seed.seed_metadata or {})
        m.update({"quality": quality, "rubric_score": score,
                  "improve_status": "done", "improved_at": datetime.utcnow().isoformat()})
        seed.seed_metadata = m
        job_db.commit()
        logger.info(f"[improve_prd] '{seed.title[:40]}': score {score}/7, quality {quality}")
    except Exception as e:
        logger.error(f"[improve_prd] failed for {seed_id}: {e}")
        try:
            s = job_db.query(Seed).filter(Seed.id == uuid.UUID(seed_id)).first()
            if s:
                m = dict(s.seed_metadata or {})
                m["improve_status"] = f"error: {str(e)[:120]}"
                s.seed_metadata = m
                job_db.commit()
        except Exception:
            job_db.rollback()
    finally:
        job_db.close()


@app.post("/api/v1/specs/{seed_id}/improve", status_code=202)
async def improve_prd(
    seed_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rubric critique-and-revise on the PRD's existing content (~1-2 min).

    For PRDs without a source paper — manual specs get the same v2 quality
    loop as auto-drafts. Poll the seed's metadata.improve_status.
    """
    try:
        seed_uuid = uuid.UUID(seed_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid seed id")
    seed = db.query(Seed).filter(Seed.id == seed_uuid, Seed.tenant_id == current_user.tenant_id).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Spec not found")
    m = dict(seed.seed_metadata or {})
    m["improve_status"] = "running"
    seed.seed_metadata = m
    db.commit()
    background_tasks.add_task(_run_improve_prd_job, seed_id, str(current_user.tenant_id))
    return {"status": "queued", "seed_id": seed_id}


# --- Product View: the convergence root (docs/specs/product-atlas.md) ---

@app.get("/api/v1/products")
def list_products(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        Seed.seed_type == "product",
    ).order_by(Seed.created_at.asc()).all()
    return {"products": [{
        "id": str(s.id),
        "title": s.title,
        "metadata": s.seed_metadata or {},
        "created_at": s.created_at.isoformat() if s.created_at else None,
    } for s in rows]}


def _run_coherence_job(user_id: str):
    from app.database import SessionLocal
    from app.coherence import build_coherence_report
    job_db = SessionLocal()
    try:
        user = job_db.query(User).filter(User.id == user_id).first()
        result = build_coherence_report(user, job_db) if user else {"status": "error"}
        logger.info(f"[coherence] job: {result.get('status')} ({result.get('title', result.get('reason', ''))})")
        if result.get("status") != "ok" and user:
            # surface failure to the polling UI
            main = next((p for p in job_db.query(Seed).filter(
                Seed.tenant_id == user.tenant_id, Seed.seed_type == "product").all()
                if (p.seed_metadata or {}).get("rank") == "main"), None)
            if main:
                m = dict(main.seed_metadata or {})
                m["coherence_status"] = f"error_{result.get('reason', 'unknown')}"
                main.seed_metadata = m
                job_db.commit()
    except Exception as e:
        logger.error(f"[coherence] job crashed: {e}")
    finally:
        job_db.close()


@app.post("/api/v1/coherence-report", status_code=202)
async def create_coherence_report(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """On-demand coherence run (~1 min). Poll the MAIN product's metadata.coherence_status."""
    main = next((p for p in db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id, Seed.seed_type == "product").all()
        if (p.seed_metadata or {}).get("rank") == "main"), None)
    if not main:
        raise HTTPException(status_code=422, detail="Define a product first — coherence needs a MAIN to measure against")
    m = dict(main.seed_metadata or {})
    m["coherence_status"] = "running"
    main.seed_metadata = m
    db.commit()
    background_tasks.add_task(_run_coherence_job, str(current_user.id))
    return {"status": "queued", "poll_seed_id": str(main.id)}


class ProductRankRequest(BaseModel):
    rank: str = Field(..., pattern="^(main|backlog)$")


@app.patch("/api/v1/products/{product_id}")
def set_product_rank(
    product_id: str,
    req: ProductRankRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Promote/demote a product. Promoting to main demotes the current main."""
    try:
        product = db.query(Seed).filter(
            Seed.id == uuid.UUID(product_id),
            Seed.tenant_id == current_user.tenant_id,
            Seed.seed_type == "product",
        ).first()
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid id")
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if req.rank == "main":
        for other in db.query(Seed).filter(
            Seed.tenant_id == current_user.tenant_id, Seed.seed_type == "product"
        ).all():
            om = dict(other.seed_metadata or {})
            if om.get("rank") == "main" and other.id != product.id:
                om["rank"] = "backlog"
                other.seed_metadata = om
    m = dict(product.seed_metadata or {})
    m["rank"] = req.rank
    product.seed_metadata = m
    db.commit()
    return {"ok": True, "product_id": str(product.id), "rank": req.rank}


class AttachRequest(BaseModel):
    product_id: str
    pillar_id: Optional[int] = None


def _stamp_product_vision_dirty(db: Session, tenant_id, product_id):
    """Mark a product's Design Vision stale so the debounced refresh job
    regenerates it once changes settle. Does not commit — the caller commits."""
    if not product_id:
        return
    try:
        product = db.query(Seed).filter(
            Seed.id == uuid.UUID(str(product_id)),
            Seed.tenant_id == tenant_id,
            Seed.seed_type == "product",
        ).first()
        if product:
            pm = dict(product.seed_metadata or {})
            pm["vision_dirty_at"] = datetime.utcnow().isoformat()
            product.seed_metadata = pm
    except Exception as e:
        logger.warning(f"[vision] stamp dirty failed: {e}")


@app.post("/api/v1/seeds/{seed_id}/attach")
def attach_seed_to_product(
    seed_id: str,
    req: AttachRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Confirm (or set) a PRD's attachment to a product/pillar — always human-initiated."""
    try:
        seed = db.query(Seed).filter(Seed.id == uuid.UUID(seed_id), Seed.tenant_id == current_user.tenant_id).first()
        product = db.query(Seed).filter(Seed.id == uuid.UUID(req.product_id), Seed.tenant_id == current_user.tenant_id, Seed.seed_type == "product").first()
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid id")
    if not seed or not product:
        raise HTTPException(status_code=404, detail="Seed or product not found")
    m = dict(seed.seed_metadata or {})
    m["product_id"] = str(product.id)
    if req.pillar_id is not None:
        m["pillar_id"] = req.pillar_id
    m["attachment"] = "confirmed"
    seed.seed_metadata = m
    _stamp_product_vision_dirty(db, current_user.tenant_id, str(product.id))
    db.commit()
    return {"ok": True, "seed_id": str(seed.id), "product_id": str(product.id), "pillar_id": m.get("pillar_id")}


# --- Canvas sharing: invite collaborators to a product canvas (docs/specs/canvas-sharing.md) ---

class CanvasShareRequest(BaseModel):
    email: EmailStr
    role: Optional[str] = "viewer"  # 'viewer' | 'editor'


@app.post("/api/v1/canvas/{product_id}/share")
def share_canvas(product_id: str, req: CanvasShareRequest,
                 current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Owner-only: invite a collaborator (by email) to a canvas. Sends an invite
    email with a deep link; the share link itself is the gate to accept."""
    from app.canvas_access import resolve_canvas_access
    from app.models import CanvasShare
    if resolve_canvas_access(db, current_user, product_id) != "owner":
        raise HTTPException(status_code=403, detail="Only the canvas owner can share it")
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid canvas id")
    product = db.query(Seed).filter(Seed.id == pid, Seed.seed_type == "product").first()
    if not product:
        raise HTTPException(status_code=404, detail="Canvas not found")
    email = req.email.strip().lower()
    if email == (current_user.email or "").lower():
        raise HTTPException(status_code=400, detail="You already own this canvas")
    role = req.role if req.role in ("viewer", "editor") else "viewer"
    collaborator = db.query(User).filter(User.email == email).first()
    share = db.query(CanvasShare).filter(
        CanvasShare.product_id == pid, CanvasShare.collaborator_email == email).first()
    if share:
        share.role = role
        if share.status == "revoked":
            share.status = "pending"
        if collaborator and not share.collaborator_user_id:
            share.collaborator_user_id = collaborator.id
    else:
        share = CanvasShare(
            product_id=pid, owner_tenant_id=current_user.tenant_id, owner_user_id=current_user.id,
            collaborator_email=email, collaborator_user_id=(collaborator.id if collaborator else None),
            role=role, status="pending",
        )
        db.add(share)
    db.commit()
    db.refresh(share)
    try:
        from app.email_sender import send_canvas_invite_email
        accept_url = f"{settings.FRONTEND_URL}/studio?canvas={product_id}&share={share.id}"
        send_canvas_invite_email(email, current_user.nickname or current_user.email, product.title, accept_url)
    except Exception as e:
        logger.error(f"[canvas] invite email failed: {e}")
    return {"ok": True, "share_id": str(share.id), "email": email, "role": role, "status": share.status}


@app.post("/api/v1/canvas/share/{share_id}/accept")
def accept_canvas_share(share_id: str,
                        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The invited collaborator accepts — binds their user id and activates access.
    Only the address the invite was sent to may accept."""
    from app.models import CanvasShare
    try:
        sid = uuid.UUID(share_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid share id")
    share = db.query(CanvasShare).filter(CanvasShare.id == sid).first()
    if not share or share.status == "revoked":
        raise HTTPException(status_code=404, detail="Invite not found")
    if (current_user.email or "").lower() != share.collaborator_email.lower():
        raise HTTPException(status_code=403, detail="This invite was sent to a different email")
    share.collaborator_user_id = current_user.id
    share.status = "active"
    share.accepted_at = datetime.utcnow()
    db.commit()
    logger.info(f"[canvas] share {sid} accepted by {current_user.email}")
    return {"ok": True, "product_id": str(share.product_id), "role": share.role}


@app.get("/api/v1/canvas/{product_id}/shares")
def list_canvas_shares(product_id: str,
                       current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Owner-only: list collaborators on a canvas."""
    from app.canvas_access import resolve_canvas_access
    from app.models import CanvasShare
    if resolve_canvas_access(db, current_user, product_id) != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can view collaborators")
    shares = db.query(CanvasShare).filter(
        CanvasShare.product_id == uuid.UUID(product_id), CanvasShare.status != "revoked").all()
    return {"shares": [{"id": str(s.id), "email": s.collaborator_email, "role": s.role, "status": s.status} for s in shares]}


@app.delete("/api/v1/canvas/share/{share_id}")
def revoke_canvas_share(share_id: str,
                        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Owner-only: revoke a collaborator's access (effective on their next request)."""
    from app.models import CanvasShare
    try:
        sid = uuid.UUID(share_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid share id")
    share = db.query(CanvasShare).filter(CanvasShare.id == sid).first()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    if share.owner_user_id != current_user.id and share.owner_tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Only the owner can revoke")
    share.status = "revoked"
    db.commit()
    logger.info(f"[canvas] share {sid} revoked by {current_user.email}")
    return {"ok": True}


@app.get("/api/v1/canvas/shared-with-me")
def canvases_shared_with_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Canvases other people have shared with the current user."""
    from app.models import CanvasShare
    shares = db.query(CanvasShare).filter(
        CanvasShare.collaborator_user_id == current_user.id, CanvasShare.status == "active").all()
    out = []
    for s in shares:
        product = db.query(Seed).filter(Seed.id == s.product_id, Seed.seed_type == "product").first()
        if product:
            out.append({"product_id": str(product.id), "title": product.title, "role": s.role, "share_id": str(s.id)})
    return {"canvases": out}


@app.get("/api/v1/canvas/{product_id}")
def get_shared_canvas(product_id: str,
                      current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Read a canvas (product + its attached PRDs) for anyone with access —
    owner or an active collaborator. Scoped strictly to the canvas's allowlist;
    never exposes the owner's other seeds."""
    from app.canvas_access import resolve_canvas_access, canvas_prd_ids
    role = resolve_canvas_access(db, current_user, product_id)
    if role is None:
        raise HTTPException(status_code=403, detail="No access to this canvas")
    pid = uuid.UUID(product_id)
    product = db.query(Seed).filter(Seed.id == pid, Seed.seed_type == "product").first()
    if not product:
        raise HTTPException(status_code=404, detail="Canvas not found")
    prd_ids = canvas_prd_ids(db, product_id)
    prds = db.query(Seed).filter(Seed.id.in_([uuid.UUID(x) for x in prd_ids])).all() if prd_ids else []

    def _ser(s):
        m = s.seed_metadata or {}
        return {
            "id": str(s.id), "title": s.title, "content": s.content,
            "build_status": m.get("build_status", "draft"),
            "design_vision_id": m.get("design_vision_id"),
            "design_vision_title": m.get("design_vision_title"),
            "product_id": m.get("product_id"), "pillar_id": m.get("pillar_id"),
        }

    pm = product.seed_metadata or {}
    return {
        "role": role,
        "product": {"id": str(product.id), "title": product.title,
                    "content": product.content, "rank": pm.get("rank")},
        "prds": [_ser(s) for s in prds],
    }


def _append_product_story(db: Session, tenant_id, prd_seed: Seed, status: str):
    """Templated story-so-far update on build events — zero LLM calls (spec rule 7)."""
    pid = (prd_seed.seed_metadata or {}).get("product_id")
    if not pid:
        return
    try:
        product = db.query(Seed).filter(Seed.id == uuid.UUID(pid), Seed.tenant_id == tenant_id).first()
        if not product:
            return
        m = dict(product.seed_metadata or {})
        label = {"ready": "is ready to build", "building": "is in build", "shipped": "shipped"}.get(status, status)
        line = f"{prd_seed.title.replace(' — PRD', '')} {label} ({date.today().strftime('%b %d')})"
        events = (m.get("story_events") or [])[-9:] + [line]
        m["story_events"] = events
        base = (m.get("story_so_far") or "").split(" · Latest: ")[0]
        m["story_so_far"] = f"{base} · Latest: {line}"
        product.seed_metadata = m
        db.commit()
    except Exception as e:
        logger.warning(f"[product] story update failed: {e}")


# --- Spec build lifecycle (draft → ready → building → shipped) ---

class BuildStatusRequest(BaseModel):
    status: str = Field(..., pattern="^(draft|ready|building|shipped)$")
    pr_url: Optional[str] = Field(default=None, max_length=500)
    note: Optional[str] = Field(default=None, max_length=1000)


class BuildStatusResponse(BaseModel):
    seed_id: str
    build_status: str
    pr_url: Optional[str] = None


@app.patch("/api/v1/seeds/{seed_id}/build-status", response_model=BuildStatusResponse)
def update_build_status(
    seed_id: str,
    req: BuildStatusRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a spec seed's build lifecycle status.

    Called from the Studio UI and by coding agents via the MCP
    report_build_progress tool, closing the loop from PRD to shipped PR.
    """
    try:
        seed_uuid = uuid.UUID(seed_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid seed id")

    seed = db.query(Seed).filter(
        Seed.id == seed_uuid,
        Seed.tenant_id == current_user.tenant_id,
    ).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Spec not found")

    meta = dict(seed.seed_metadata or {})
    meta["build_status"] = req.status
    meta["build_updated_at"] = datetime.utcnow().isoformat()
    if req.pr_url:
        meta["build_pr_url"] = req.pr_url
    if req.note:
        history = meta.get("build_notes", [])
        history.append({"at": meta["build_updated_at"], "status": req.status, "note": req.note})
        meta["build_notes"] = history[-20:]
    seed.seed_metadata = meta
    _stamp_product_vision_dirty(db, current_user.tenant_id, meta.get("product_id"))
    db.commit()

    # Living "story so far" on the owning product (templated, no LLM)
    _append_product_story(db, current_user.tenant_id, seed, req.status)

    return BuildStatusResponse(seed_id=str(seed.id), build_status=req.status, pr_url=meta.get("build_pr_url"))

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
    code: Optional[str] = None  # access code to include; defaults to the first INVITE_CODES entry

@app.post("/api/v1/admin/invite")
def admin_send_invites(
    req: InviteRequest,
    x_api_key: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """Send invite emails with the access code and a direct onboarding link. Requires HARVEST_API_KEY."""
    expected = settings.HARVEST_API_KEY
    if not expected:
        raise HTTPException(status_code=503, detail="Invite API not configured")
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")

    from urllib.parse import quote
    from app.email_sender import send_invite_email

    code = (req.code or settings.INVITE_CODES.split(",")[0]).strip().upper()
    if not _invite_code_valid(code):
        raise HTTPException(status_code=400, detail=f"Code '{code}' is not in INVITE_CODES")

    sent, failed = [], []
    for email in req.emails[:50]:  # cap at 50 per call
        email = email.strip().lower()
        if not email or "@" not in email:
            failed.append(email)
            continue
        try:
            onboarding_url = f"{settings.FRONTEND_URL}/onboarding?email={quote(email)}&code={code}"
            if send_invite_email(email, code, onboarding_url):
                sent.append(email)
                # Mark on the waitlist if they're there
                try:
                    from app.models import WaitlistEntry
                    entry = db.query(WaitlistEntry).filter(WaitlistEntry.email == email).first()
                    if entry and not entry.invited_at:
                        entry.invited_at = datetime.utcnow()
                        db.commit()
                except Exception:
                    db.rollback()
            else:
                failed.append(email)
        except Exception as e:
            logger.error(f"Invite failed for {email}: {e}")
            failed.append(email)

    return {"sent": sent, "failed": failed, "code": code}


class WaitlistInviteRequest(BaseModel):
    emails: Optional[List[str]] = None  # specific addresses; omit to invite everyone still waiting
    code: Optional[str] = None


@app.post("/api/v1/admin/waitlist/invite")
def admin_invite_waitlist(
    req: WaitlistInviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invite waitlist signups straight from the /admin dashboard (gated on
    ADMIN_EMAILS via the operator's JWT — no API key needed). With no `emails`,
    invites everyone still waiting. Sets invited_at so nobody is invited twice."""
    admin_emails = {e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()}
    if (current_user.email or "").lower() not in admin_emails:
        raise HTTPException(status_code=404, detail="Not found")

    from urllib.parse import quote
    from app.email_sender import send_invite_email
    from app.models import WaitlistEntry

    code = (req.code or settings.INVITE_CODES.split(",")[0]).strip().upper()
    if not _invite_code_valid(code):
        raise HTTPException(status_code=400, detail=f"Code '{code}' is not in INVITE_CODES")

    q = db.query(WaitlistEntry).filter(WaitlistEntry.invited_at.is_(None))
    if req.emails:
        wanted = {e.strip().lower() for e in req.emails if e and "@" in e}
        q = q.filter(WaitlistEntry.email.in_(wanted))
    entries = q.order_by(WaitlistEntry.joined_at.asc()).limit(100).all()

    sent, failed = [], []
    for entry in entries:
        try:
            onboarding_url = f"{settings.FRONTEND_URL}/onboarding?email={quote(entry.email)}&code={code}"
            if send_invite_email(entry.email, code, onboarding_url):
                entry.invited_at = datetime.utcnow()
                db.commit()
                sent.append(entry.email)
            else:
                db.rollback()
                failed.append(entry.email)
        except Exception as e:
            db.rollback()
            logger.error(f"Waitlist invite failed for {entry.email}: {e}")
            failed.append(entry.email)

    return {"sent": sent, "failed": failed, "code": code, "count": len(sent)}


class WaitlistRequest(BaseModel):
    email: EmailStr


@app.post("/api/v1/waitlist")
def join_waitlist(req: WaitlistRequest, db: Session = Depends(get_db)):
    """Durable waitlist storage (public). Idempotent per email."""
    from app.models import WaitlistEntry
    email = req.email.strip().lower()
    existing = db.query(WaitlistEntry).filter(WaitlistEntry.email == email).first()
    if not existing:
        db.add(WaitlistEntry(email=email))
        db.commit()
    return {"ok": True}


class InviteCodeRequest(BaseModel):
    code: str

@app.post("/api/v1/auth/validate-code")
def validate_invite_code(req: InviteCodeRequest):
    """Validate a 6-character private-beta invite code (onboarding v2 invite step)."""
    return {"valid": _invite_code_valid(req.code)}


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
def admin_list_tenants(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    admin_emails = {e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()}
    if (current_user.email or "").lower() not in admin_emails:
        raise HTTPException(status_code=404, detail="Not found")
    tenants = db.query(User).with_entities(User.id, User.email, User.created_at, User.subscription_status).all()
    info = [TenantsListResponse.TenantInfo(id=t.id, email=t.email, created_at=t.created_at, subscription_status=t.subscription_status) for t in tenants]
    return TenantsListResponse(tenants=info, total=len(info))


@app.get("/api/v1/admin/stats")
def admin_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Operator dashboard: users, activity, token usage (ADMIN_EMAILS only)."""
    admin_emails = {e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()}
    if (current_user.email or "").lower() not in admin_emails:
        raise HTTPException(status_code=404, detail="Not found")

    from app.models import Usage as UsageModel
    cutoff = datetime.utcnow() - timedelta(days=30)

    # Per-user roll-up
    seed_counts = dict(db.query(Seed.user_id, func.count(Seed.id)).group_by(Seed.user_id).all())
    last_seed = dict(db.query(Seed.user_id, func.max(Seed.created_at)).group_by(Seed.user_id).all())
    tokens_30d_by_user = dict(
        db.query(UsageModel.user_id, func.coalesce(func.sum(UsageModel.llm_tokens), 0))
        .filter(UsageModel.date >= cutoff).group_by(UsageModel.user_id).all())

    users = []
    for u in db.query(User).order_by(User.created_at.desc()).all():
        users.append({
            "email": u.email,
            "nickname": getattr(u, "nickname", "") or "",
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "seeds": int(seed_counts.get(u.id, 0)),
            "last_seed_at": last_seed.get(u.id).isoformat() if last_seed.get(u.id) else None,
            "tokens_30d": int(tokens_30d_by_user.get(u.id, 0)),
        })

    # Tokens per day (30d)
    daily = (db.query(func.date(UsageModel.date), func.coalesce(func.sum(UsageModel.llm_tokens), 0))
             .filter(UsageModel.date >= cutoff)
             .group_by(func.date(UsageModel.date))
             .order_by(func.date(UsageModel.date)).all())
    tokens_by_day = [{"date": str(d), "tokens": int(t)} for d, t in daily]
    tokens_30d = sum(r["tokens"] for r in tokens_by_day)

    spec_count = sum(
        1 for s in db.query(Seed).all()
        if isinstance(s.seed_metadata, dict) and s.seed_metadata.get("seed_type") == "spec")

    from app.models import WaitlistEntry
    waitlist = [{
        "email": w.email,
        "joined_at": w.joined_at.isoformat() if w.joined_at else None,
        "invited_at": w.invited_at.isoformat() if w.invited_at else None,
    } for w in db.query(WaitlistEntry).order_by(WaitlistEntry.joined_at.desc()).all()]

    return {
        "users": users,
        "user_count": len(users),
        "seed_count": int(db.query(func.count(Seed.id)).scalar() or 0),
        "spec_count": spec_count,
        "tokens_30d": tokens_30d,
        "tokens_by_day": tokens_by_day,
        "chat_model": settings.CHAT_MODEL,
        "daily_token_limit": settings.DAILY_TOKEN_LIMIT,
        "waitlist": waitlist,
        "waitlist_count": len(waitlist),
    }

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
    """Image ingestion: image → Vision extract → Thought → enrich_v2 → Seed"""
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
        agent_session = store.load_session(session_id, tenant_id=str(current_user.tenant_id))

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

    # ── Taste Memory injection (3.17) ────────────────────────────
    if current_user:
        try:
            from app.taste_memory import format_for_prompt as _taste_fmt
            taste_section = _taste_fmt(str(current_user.tenant_id))
            if taste_section:
                prompt_builder = prompt_builder.with_context(taste_section)
        except Exception:
            pass

    # ── Prior learnings injection (3.20) ─────────────────────────
    if current_user:
        try:
            recent_learnings = db.query(Seed).filter(
                Seed.tenant_id == current_user.tenant_id,
                Seed.seed_type == "learning",
            ).order_by(Seed.created_at.desc()).limit(5).all()
            if recent_learnings:
                lines = "\n".join(f"- {s.title}: {s.content[:120]}" for s in recent_learnings)
                prompt_builder = prompt_builder.with_context(
                    f"**Prior Learnings** (apply these patterns; confidence rated by user):\n{lines}"
                )
        except Exception:
            pass

    # ── Evidence-anchored recommendations (3.19) + Completeness mode (3.22) ─
    prompt_builder = prompt_builder.append_section(
        "Thinking Partner Instructions",
        "When making recommendations:\n"
        "1. **Cite your sources**: Name the specific seeds, wiki articles, or sources that motivated each recommendation. If you cannot cite one, flag it as an assumption.\n"
        "2. **Completeness by default**: AI makes comprehensiveness cheap. Recommend the full solution — all edge cases, all failure modes — not the shortcut.\n"
        "3. **User sovereignty**: You recommend; the user decides. Present trade-offs, not just a single path.\n"
        "4. **Premise before implementation**: Before expanding scope, confirm the core premise is valid.\n"
        "5. **develop_idea tool**: Use it proactively when the user expresses a vague idea that deserves rigorous development.",
    )

    prompt_builder = prompt_builder.append_section(
        "Reply Discipline & Suggested Actions",
        "ALWAYS end your turn with a plain-text reply to the user — tools gather, you answer. "
        "Never end on a tool call. Batch lookups: 2-3 searches are plenty before answering; "
        "don't re-search what a previous tool result already contains.\n"
        "Spec discipline: write_spec at most ONCE per conversation unless the user explicitly "
        "asks for another PRD. To change an existing spec, use update_seed — never write a near-duplicate.\n"
        "After your reply, append up to 3 suggested next actions the user can tap, each on its own "
        "line in exactly this format: <sugg>Short imperative label</sugg>\n"
        "Rules: ≤6 words each; concrete and tied to what just happened (e.g. <sugg>Plant this as a seed</sugg>, "
        "<sugg>Draft a PRD from this</sugg>, <sugg>Show related seeds</sugg>); phrase them as things the USER says to you; "
        "skip them when the conversation is mid-question.",
    )

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
        max_rounds=6,
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
                            # Taste memory extraction (3.17) — non-blocking
                            try:
                                from app.taste_memory import extract_and_record as _tm_extract
                                raw_msgs = [{"role": m.role, "content": str(m.content)} for m in actual_session.messages]
                                _tm_extract(str(current_user.tenant_id), raw_msgs)
                            except Exception:
                                pass
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
    session = store.load_session(session_id, tenant_id=str(current_user.tenant_id))
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
    ok = store.delete(session_id, tenant_id=str(current_user.tenant_id))
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
            session = store.load_session(str(session_row.id), tenant_id=str(session_row.tenant_id))
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
        session = store.load_session(session_id, tenant_id=str(current_user.tenant_id))
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
            model=settings.ENRICH_MODEL,
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
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _notif_visible_to(notif: dict, user_id: Optional[str]) -> bool:
    """A notification is visible only to the account it is explicitly addressed
    to. Entries with no user_id (legacy/global, from before per-user delivery)
    are shown to no one — so one account's briefings can never surface in
    another's inbox, even if a stray global entry is ever written again."""
    owner = notif.get("user_id")
    if not owner:
        return False  # unaddressed legacy/global entry — never shown
    return user_id is not None and str(owner) == str(user_id)

def _save_notifs(notifs: list):
    os.makedirs(os.path.dirname(_NOTIFS_FILE), exist_ok=True)
    with open(_NOTIFS_FILE, "w") as f:
        json.dump(notifs[-200:], f, indent=2)

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
    """Get push notifications for the current user. ?all=true returns full
    history (read + unread). Only the user's own notifications (plus legacy
    system broadcasts) are returned — never another account's."""
    uid = str(current_user.id) if current_user else None
    mine = [n for n in _load_notifs() if _notif_visible_to(n, uid)]
    if all:
        # Newest first, capped at 50 per user
        return {"notifications": list(reversed(mine))[:50], "total": len(mine)}
    unread = [n for n in mine if not n.get("read")]
    return {"notifications": list(reversed(unread))[:50], "total": len(mine)}

@app.post("/api/v1/push/mark-read")
def mark_notifications_read(current_user: User = Depends(get_current_user)):
    """Mark the current user's notifications as read."""
    uid = str(current_user.id)
    notifs = _load_notifs()
    for n in notifs:
        if _notif_visible_to(n, uid):
            n["read"] = True
    _save_notifs(notifs)
    return {"success": True}

@app.delete("/api/v1/push/notifications")
def clear_all_notifications(current_user: User = Depends(get_current_user)):
    """Delete the current user's notifications (clear their inbox)."""
    uid = str(current_user.id)
    notifs = [n for n in _load_notifs() if not _notif_visible_to(n, uid)]
    _save_notifs(notifs)
    return {"success": True}

@app.delete("/api/v1/push/notifications/{notif_id}")
def dismiss_notification(notif_id: str, current_user: User = Depends(get_current_user)):
    """Dismiss a single notification by id — only if it belongs to the user."""
    uid = str(current_user.id)
    notifs = _load_notifs()
    notifs = [
        n for n in notifs
        if not (n.get("id") == notif_id and _notif_visible_to(n, uid))
    ]
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
    db = next(get_db())
    try:
        users = db.query(User).all()
        if not users:
            logger.warning("❌ No users found for morning spark")
            return
        logger.info(f"👥 Processing {len(users)} user(s)")

        for user in users:
            try:
                if not _cadence_allows('morning_spark', user):
                    continue
                city = getattr(user, 'city', None)
                logger.info(f"📍 User {user.id}: city={city}")

                try:
                    weather = asyncio.run(briefings.fetch_weather(city))
                except Exception as we:
                    logger.error(f"⚠️ Weather fetch failed for {user.id}: {we}")
                    weather = None

                if not weather:
                    logger.warning(f"⏭️ Skipping morning spark for user {user.id} — no weather data")
                    continue

                briefing = briefings.build_morning_spark(
                    user_id=str(user.id),
                    db=db,
                    city=city,
                    weather=weather or f"Check weather in {city or 'your location'}"
                )
                logger.info(f"✓ Briefing built with {len(briefing.get('sections', []))} sections")
                _sto<RESEND_API_KEY>(briefing, user)
                logger.info(f"✅ Morning Spark sent to user {user.id}")
            except Exception as ue:
                logger.error(f"❌ Morning Spark failed for user {user.id}: {ue}", exc_info=True)

    except Exception as e:
        logger.error(f"❌ Morning Spark job failed: {e}", exc_info=True)
    finally:
        db.close()


def _job_daily_briefing():
    """
    Daily Briefing — 09:30 CET.
    Generates multi-section briefing per user using their own interests.
    """
    db = next(get_db())
    try:
        users = db.query(User).filter(User.email != None, User.email != '').all()
        if not users:
            logger.warning("No users found for daily briefing")
            return

        logger.info(f"📰 Generating daily briefing for {len(users)} user(s)")
        for user in users:
            try:
                if not _cadence_allows('daily_briefing', user):
                    continue
                briefing = asyncio.run(briefings.build_daily_briefing(
                    user_id=str(user.id),
                    db=db
                ))
                _sto<RESEND_API_KEY>(briefing, user)
                if settings.RESEND_API_KEY and user.email:
                    try:
                        email_sender.send_briefing_email(user.email, briefing)
                    except Exception as email_err:
                        logger.error(f"Email delivery failed for {user.email}: {email_err}")
                logger.info(f"✅ Daily Briefing generated for {user.email}")
            except Exception as ue:
                logger.error(f"❌ Daily Briefing failed for user {user.id}: {ue}", exc_info=True)
    except Exception as e:
        logger.error(f"❌ Daily Briefing job failed: {e}")
    finally:
        db.close()


def _job_afternoon_reflection():
    """
    Evening Reflection — 16:00 CET.
    Generates multi-section briefing: Contrarian View + Actionable Move.
    """
    db = next(get_db())
    try:
        for user in db.query(User).all():
            try:
                if not _cadence_allows('reflection', user):
                    continue
                briefing = briefings.build_reflection(user_id=str(user.id), db=db)
                _sto<RESEND_API_KEY>(briefing, user)
            except Exception as ue:
                logger.error(f"❌ Reflection failed for {user.id}: {ue}")
        logger.info("✅ Evening Reflection generated")
    except Exception as e:
        logger.error(f"❌ Evening Reflection failed: {e}")
    finally:
        db.close()


def _job_coherence_report():
    """Weekly coherence synthesis for every user with a MAIN product — Sunday 17:00 CET."""
    from app.database import SessionLocal
    from app.coherence import build_coherence_report
    job_db = SessionLocal()
    try:
        for user in job_db.query(User).all():
            if _is_test_account(user):
                continue
            mains = [p for p in job_db.query(Seed).filter(
                Seed.tenant_id == user.tenant_id, Seed.seed_type == "product").all()
                if (p.seed_metadata or {}).get("rank") == "main"]
            if not mains:
                continue
            result = build_coherence_report(user, job_db)
            if result.get("status") == "ok":
                _sto<RESEND_API_KEY>(
                    str(user.id),
                    "🧭 Weekly Coherence Report",
                    "Contradictions, gaps and the story so far — your portfolio, digested.",
                    f"/library?article={result['article_id']}",
                )
    except Exception as e:
        logger.error(f"[coherence] weekly job crashed: {e}")
    finally:
        job_db.close()


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
    db = next(get_db())
    try:
        for user in db.query(User).all():
            if _is_test_account(user):
                continue
            _sto<RESEND_API_KEY>(
                str(user.id),
                "📚 Weekly Garden Digest",
                "Your weekly knowledge summary is ready. Let's review what grew.",
                "/chat", prompt=prompt)
    finally:
        db.close()


def _job_weekly_eval():
    """
    Weekly Content Eval — Sundays 18:00 CET.
    Generates multi-section briefing: What Stuck + Creative Constraint.
    """
    db = next(get_db())
    try:
        for user in db.query(User).filter(User.email != None, User.email != '').all():  # noqa: E711
            if _is_test_account(user):
                continue
            try:
                briefing = briefings.build_weekly_eval(user_id=str(user.id), db=db)
                _sto<RESEND_API_KEY>(briefing, user)
                if settings.RESEND_API_KEY and user.email:
                    try:
                        email_sender.send_briefing_email(user.email, briefing)
                    except Exception as email_err:
                        logger.error(f"Email delivery failed for weekly eval ({user.id}): {email_err}")
            except Exception as ue:
                logger.error(f"❌ Weekly eval failed for {user.id}: {ue}")
        logger.info("✅ Weekly Content Eval generated")
    except Exception as e:
        logger.error(f"❌ Weekly Content Eval failed: {e}")
    finally:
        db.close()


def _job_biweekly_challenge():
    """
    Biweekly Challenge — 1st & 15th at 10:00 CET.
    Generates multi-section briefing: Cross-domain synthesis experiment.
    """
    db = next(get_db())
    try:
        for user in db.query(User).all():
            if _is_test_account(user):
                continue
            try:
                briefing = briefings.build_biweekly_challenge(user_id=str(user.id), db=db)
                _sto<RESEND_API_KEY>(briefing, user)
            except Exception as ue:
                logger.error(f"❌ Biweekly challenge failed for {user.id}: {ue}")
        logger.info("✅ Biweekly Challenge generated")
    except Exception as e:
        logger.error(f"❌ Biweekly Challenge failed: {e}")
    finally:
        db.close()

def _job_academic_digest(evening: bool = False):
    """
    Academic + Practical Research Digest — Daily 07:00 + 18:00 CET.
    Connects new arXiv/Semantic Scholar papers to the user's Garden seeds and Wiki,
    produces a practical synthesis and solution design seed.
    """
    db = next(get_db())
    try:
        gate = 'academic_digest_evening' if evening else 'academic_digest'
        for user in db.query(User).filter(User.email != None, User.email != '').all():  # noqa: E711
            try:
                if not _cadence_allows(gate, user):
                    continue
                briefing = asyncio.run(briefings.build_academic_digest(
                    user_id=str(user.id), db=db))
                if evening:
                    briefing = {**briefing, "type": "academic_digest_evening"}
                _sto<RESEND_API_KEY>(briefing, user)
                if settings.RESEND_API_KEY and user.email:
                    try:
                        attachments = email_sender.collect_arxiv_pdfs(briefing)
                        email_sender.send_briefing_email(user.email, briefing, attachments)
                    except Exception as email_err:
                        logger.error(f"Email delivery failed for academic digest ({user.id}): {email_err}")
            except Exception as ue:
                logger.error(f"❌ Academic digest failed for {user.id}: {ue}")
        logger.info("✅ Academic Digest generated")
    except Exception as e:
        logger.error(f"❌ Academic Digest failed: {e}", exc_info=True)
    finally:
        db.close()


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


def _is_test_account(user) -> bool:
    """True when the user's email belongs to a configured test/seed domain (or
    is missing). Briefing + digest jobs skip these so cron runs don't email or
    push throwaway accounts. Domains come from settings.BRIEFING_EXCLUDE_DOMAINS."""
    email = (getattr(user, "email", "") or "").strip().lower()
    if not email or "@" not in email:
        return True  # no real address — never a briefing recipient
    domain = email.rsplit("@", 1)[1]
    excluded = {
        d.strip().lower()
        for d in (settings.BRIEFING_EXCLUDE_DOMAINS or "").split(",")
        if d.strip()
    }
    return domain in excluded


def _cadence_allows(job_type: str, user) -> bool:
    """Per-user delivery gate — maps the onboarding rhythm (digest_frequency)
    onto the global briefing jobs. The Research Digest is the flagship: on
    slower cadences it thins out instead of disappearing."""
    # Test/seed accounts never receive scheduled briefings.
    if _is_test_account(user):
        return False
    freq = (getattr(user, "digest_frequency", None) or "once-daily")
    weekday = datetime.now(_CET).weekday()  # 0=Mon .. 6=Sun
    # The evening Research Digest (18:00) is the twice-daily tier's second
    # edition — every other cadence gets only the morning Research Digest, so a
    # "once a day" user receives exactly one, not two.
    if job_type == "academic_digest_evening":
        return freq == "twice-daily"
    if freq == "twice-daily":
        return True
    if job_type in ("morning_spark", "reflection"):
        return False  # extra touchpoints belong to the twice-daily rhythm only
    if freq in ("once-daily", "calendar"):
        return True
    if freq == "bi-weekly":
        return weekday in (2, 6)  # Wednesday + Sunday
    if freq == "weekly":
        return weekday == 6  # Sunday
    return True


def _push_to_user(user_id: str, title: str, body: str, url: str = "/chat", prompt: str = "") -> int:
    """Web Push to a single user's subscriptions only."""
    if not VAPID_PRIVATE_KEY:
        return 0
    payload = json.dumps({"title": title, "body": (body or "")[:120], "url": url,
                          "prompt": prompt[:200] if prompt else ""})
    sent = 0
    expired = []
    subs = _load_subs()
    for sub_entry in subs:
        if str(sub_entry.get("user_id", "")) != str(user_id):
            continue
        sub_info = sub_entry.get("subscription", {})
        if not sub_info.get("endpoint"):
            continue
        result = _send_web_push_to_all(sub_info, payload)
        if result == "ok":
            sent += 1
        elif result == "expired":
            expired.append(sub_info.get("endpoint"))
    if expired:
        _save_subs([s for s in subs if s.get("subscription", {}).get("endpoint") not in expired])
    return sent


def _sto<RESEND_API_KEY>(briefing: dict, user) -> None:
    """Per-user variant of _sto<RESEND_API_KEY>: the notification is
    stored with the owner's user_id and pushed only to their devices."""
    from datetime import timedelta
    user_id = str(user.id)
    try:
        notifs = _load_notifs()
        notif_type = briefing.get("type", "briefing")
        cutoff = (datetime.utcnow() - timedelta(hours=4)).isoformat()
        if any(n.get("briefing", {}).get("type") == notif_type
               and n.get("user_id") == user_id
               and n.get("timestamp", "") >= cutoff for n in notifs):
            return
        body = briefing.get("sections", [{}])[0].get("content", "")
        if isinstance(body, list):
            body = body[0] if body else briefing.get("title", "")
        clean_briefing = {k: v for k, v in briefing.items() if k != "prompt"}
        section_titles = [s.get("title", "") for s in briefing.get("sections", []) if s.get("title")]
        short_prompt = briefing.get("title", "") + (f" — {section_titles[0]}" if section_titles else "")
        ts = datetime.utcnow()
        notifs.append({
            "id": f"{notif_type}_{user_id[:8]}_{ts.strftime('%Y%m%d%H%M')}",
            "user_id": user_id,
            "title": briefing.get("title", "Briefing"),
            "body": body[:100] if body else briefing.get("subtitle", ""),
            "url": "/chat",
            "prompt": short_prompt[:200],
            "briefing": clean_briefing,
            "timestamp": ts.isoformat(),
            "read": False,
        })
        _save_notifs(notifs)
        sent = _push_to_user(user_id, briefing.get("title", "Briefing"),
                             body[:100] if body else "", "/chat", prompt=briefing.get("prompt", ""))
        logger.info(f"✅ Briefing '{notif_type}' → user {user_id[:8]} ({sent} devices)")
    except Exception as e:
        logger.error(f"❌ Per-user briefing storage failed: {e}", exc_info=True)


def _sto<RESEND_API_KEY>(user_id: str, title: str, body: str, url: str, prompt: str = "") -> None:
    """Per-user simple notification (no briefing payload)."""
    try:
        notifs = _load_notifs()
        notifs.append({
            "id": f"simple_{user_id[:8]}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "user_id": user_id, "title": title, "body": body, "url": url,
            "prompt": prompt, "timestamp": datetime.utcnow().isoformat(), "read": False,
        })
        _save_notifs(notifs)
        _push_to_user(user_id, title, body, url, prompt=prompt)
    except Exception as e:
        logger.error(f"❌ Simple per-user notification failed: {e}")


def _job_refresh_stale_visions():
    """Debounced auto-refresh of product Design Visions. When a product's PRDs
    change (attach / build-status), the product is stamped vision_dirty_at;
    once the changes have settled (>5 min with no further edits) this job
    regenerates the vision and clears the flag. Runs every 5 minutes."""
    from app.design_vision import generate_design_vision
    debounce = timedelta(minutes=5)
    db = next(get_db())
    try:
        now = datetime.utcnow()
        for product in db.query(Seed).filter(Seed.seed_type == "product").all():
            meta = product.seed_metadata or {}
            dirty = meta.get("vision_dirty_at")
            if not dirty:
                continue
            try:
                if now - datetime.fromisoformat(dirty) < debounce:
                    continue  # changes still settling — wait for the next run
            except Exception:
                pass
            # PRDs currently attached to this product
            prd_ids = [
                str(s.id) for s in db.query(Seed).filter(Seed.tenant_id == product.tenant_id).all()
                if (s.seed_metadata or {}).get("product_id") == str(product.id)
            ]
            user = db.query(User).filter(User.id == product.user_id).first()
            # Clear the flag first so a failure doesn't re-fire every run
            pm = dict(product.seed_metadata or {})
            pm.pop("vision_dirty_at", None)
            pm["vision_refreshed_at"] = now.isoformat()
            product.seed_metadata = pm
            db.commit()
            if len(prd_ids) >= 2 and user:
                try:
                    result = generate_design_vision(prd_ids, user, db)
                    logger.info(f"[vision] auto-refreshed product {str(product.id)[:8]} ({len(prd_ids)} PRDs): {result.get('status')}")
                except Exception as e:
                    logger.error(f"[vision] auto-refresh failed for {str(product.id)[:8]}: {e}")
    except Exception as e:
        logger.error(f"[vision] refresh job failed: {e}", exc_info=True)
    finally:
        db.close()


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
                if not already_covered and c >= 1:  # lowered from 2 to 1 — never starve the Library
                    gaps.append({'domain': d, 'count': c})

            # General catch-all: if no concrete-domain gaps were found but the
            # tenant has seeds, compile one "General" article so the Library is
            # never empty. auto_compile_for_domain's Postgres fallback matches
            # by tag, so a generic bucket still pulls real seeds in.
            if not gaps and seeds and "general" not in wiki_domains:
                gaps.append({'domain': 'general', 'count': len(seeds)})

            logger.info(f"📚 Wiki cron: {len(seeds)} seeds, {len(domain_counts)} domains, {len(gaps)} gaps to compile")
            compiled = 0
            for gap in gaps[:5]:  # up to 5 articles per run (was 3)
                try:
                    result = await auto_compile_for_domain(gap['domain'], tenant_id, user_id)
                    if result:
                        compiled += 1
                    await asyncio.sleep(2)
                except Exception as e:
                    logger.exception(f"📚 Wiki cron: compile failed for domain '{gap['domain']}': {e}")
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
    # Coherence Report — Sundays 17:00 CET (product-atlas.md milestone 4)
    scheduler.add_job(
        _job_coherence_report,
        CronTrigger(day_of_week="sun", hour=17, minute=0, timezone=_CET),
        id="coherence_report",
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
    # Product Design Vision — debounced auto-refresh when canvas PRDs change
    scheduler.add_job(
        _job_refresh_stale_visions,
        CronTrigger(minute="*/5", timezone=_CET),
        id="refresh_visions", replace_existing=True,
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
        CronTrigger(hour="*/3", minute=5, timezone=_CET),
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

        paper_user = db.query(User).filter(User.id == uuid.UUID(str(user_id))).first()
        if paper_user:
            _sto<RESEND_API_KEY>(briefing, paper_user)
        else:
            _sto<RESEND_API_KEY>(briefing)  # fallback if user vanished
        logger.info(f"[agent] Strategy paper delivered to Inbox for user {str(user_id)[:8]}: {topic[:60]}")
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
