from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Request, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
import os
from app.database import engine, get_db
from app.models import Base, User, Thought, Seed, Usage
from app.schemas import (
    RegisterRequest, LoginRequest, AuthResponse,
    ThoughtCreate, ThoughtResponse, SeedResponse, SeedSearchResponse,
    SparkResponse, BriefingResponse, UsageResponse, HealthResponse, TenantsListResponse
)
from app.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, get_tenant_id
)
from app.config import settings
from app.weaviate_client import weaviate_client
import httpx
import json
from datetime import datetime, date
import uuid

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

app = FastAPI(title="OpenClaw API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict in prod
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
        tenant_id=uuid.uuid4()
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

# --- Thoughts ---

@app.post("/api/v1/thoughts", response_model=ThoughtResponse)
def create_thought(
    req: ThoughtCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
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

    # Enqueue enrichment (simplified: run inline for now; later use Redis queue)
    # background_tasks.add_task(enrich_thought, thought.id, str(current_user.tenant_id))
    # For MVP we'll run synchronously to avoid complexity
    from app.enricher import enrich_thought
    try:
        enrich_thought(str(thought.id), str(current_user.tenant_id), db)
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
    if query:
        # Vector search via Weaviate
        from app.enricher import embed_text
        embedding = embed_text(query)
        weaviate_hits = weaviate_client.search_seeds(
            tenant_id=str(current_user.tenant_id),
            embedding=embedding,
            limit=limit
        )
        seeds = []
        for hit in weaviate_hits:
            seed = Seed(
                id=uuid.UUID(hex=hit["_additional"]["id"]),  # weaviate returns id like that
                tenant_id=current_user.tenant_id,
                user_id=current_user.id,
                thought_id=uuid.UUID(hex=hit.get("thought_id")) if hit.get("thought_id") else None,
                title=hit["title"],
                content=hit["content"],
                embedding_ref=hit["_additional"]["id"],
                image_url=hit.get("image_url"),
                metadata=json.loads(hit.get("metadata", "{}")),
                created_at=datetime.fromisoformat(hit["created_at"])
            )
            seeds.append(seed)
        return SeedSearchResponse(seeds=seeds, query=query, total=len(seeds))
    else:
        # Return recent seeds from Postgres
        seeds = db.query(Seed).filter(
            Seed.tenant_id == current_user.tenant_id
        ).order_by(Seed.created_at.desc()).limit(limit).all()
        return SeedSearchResponse(seeds=seeds, query=None, total=len(seeds))

@app.get("/api/v1/seeds/{seed_id}", response_model=SeedResponse)
def get_seed(seed_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seed = db.query(Seed).filter(
        Seed.tenant_id == current_user.tenant_id,
        Seed.id == seed_id
    ).first()
    if not seed:
        raise HTTPException(status_code=404, detail="Seed not found")
    return seed

# --- Daily Spark & Briefing ---

@app.post("/api/v1/spark", response_model=SparkResponse)
def get_spark(current_user: User = Depends(get_current_user)):
    # For now, a simple deterministic prompt. Later, use intent router.
    from app.enricher import get_intent_router_prompt
    routing = get_intent_router_prompt()
    spark_text = f"What if your {routing} strengths could be combined in a new way? Think about a recent seed that excites you and ask: How might this be applied to a completely different domain?"
    return SparkResponse(text=spark_text)

@app.post("/api/v1/briefing", response_model=BriefingResponse)
def get_briefing(current_user: User = Depends(get_current_user)):
    # Build briefing text (simplified)
    text = "Good morning! Here's your daily update:\n- Weather: Light snow +1°C in Munich\n- News: Notion Custom Agents are now live\n- Insight: Link from Linke Tree about Odoo PoC\n- Creative exercise: What if your brain had 10x more connections?"
    image_url = None  # BFL image generation can be added
    return BriefingResponse(text=text, image_url=image_url)

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

# --- Admin (protected by is_admin check; for MVP we'll skip and use direct DB)

@app.get("/api/v1/admin/health")
def admin_health():
    # Check Weaviate, Postgres, LLM APIs
    status = {"weaviate": "unknown", "postgres": "unknown", "openrouter": "unknown"}
    try:
        # Weaviate meta
        weaviate_client.client.meta.get()
        status["weaviate"] = "ok"
    except:
        status["weaviate"] = "down"
    try:
        # Postgres
        from app.database import engine
        with engine.connect() as conn:
            conn.execute("SELECT 1")
        status["postgres"] = "ok"
    except:
        status["postgres"] = "down"
    # TODO: ping OpenRouter
    status["openrouter"] = "unknown"
    overall = "ok" if all(v == "ok" for v in ["weaviate", "postgres"]) else "degraded"
    return HealthResponse(status=overall, checks=status)

@app.get("/api/v1/admin/tenants", response_model=TenantsListResponse)
def admin_list_tenants(db: Session = Depends(get_db)):
    # For MVP, simple list; later add admin role check
    tenants = db.query(User).with_entities(User.id, User.email, User.created_at, User.subscription_status).all()
    info = [TenantsListResponse.TenantInfo(id=t.id, email=t.email, created_at=t.created_at, subscription_status=t.subscription_status) for t in tenants]
    return TenantsListResponse(tenants=info, total=len(info))

# --- Chat (Vercel AI SDK compatible: text stream) ---

@app.post("/api/v1/chat")
async def chat_endpoint(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    body = await request.json()
    messages = body.get("messages", [])
    attachments = body.get("attachments", [])
    # Build OpenAI-compatible messages
    openai_messages = []
    for msg in messages:
        role = msg.get("role")
        content = extract_text(msg)
        # For attachments, in MVP we just add placeholder note
        # Later: convert images to data URLs and include as image_url parts
        if attachments and role == "user":
            # naive: note there were attachments
            content += f"\n[Attachments: {len(attachments)} file(s)]"
        openai_messages.append({"role": role, "content": content})

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.APP_URL or "https://your-domain.com",
        "X-Title": settings.APP_NAME or "Second Brain",
    }
    payload = {
        "model": "openrouter/nvidia/nemotron-3-super-120b-a12b:free",
        "messages": openai_messages,
        "stream": True,
    }
    async with httpx.AsyncClient() as client:
        async with client.stream("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=60.0) as resp:
            if resp.status_code != 200:
                error_text = await resp.aread()
                raise HTTPException(status_code=resp.status_code, detail=f"OpenRouter error: {error_text.decode()}")
            async def generate():
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            delta = chunk["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            continue
            return StreamingResponse(generate(), media_type="text/plain")

# Root endpoint
@app.get("/")
def root():
    return {"message": "OpenClaw API", "docs": "/docs"}
