from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List
from pydantic import BaseModel, Field
import os
import base64
import mimetypes
from app.database import engine, get_db
from app.models import Base, User, Thought, Seed, Usage, CalendarConnection
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
    digest_frequency: Optional[str] = None  # twice-daily, once-daily, bi-weekly, weekly, calendar

@app.patch("/api/v1/profile")
def update_profile(
    req: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if req.city is not None:
        current_user.city = req.city
    if req.digest_frequency is not None:
        current_user.digest_frequency = req.digest_frequency
    db.commit()
    db.refresh(current_user)
    return {"status": "ok", "city": current_user.city, "digest_frequency": current_user.digest_frequency}

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

    # Enrichment pipeline v2: chunk → extract entities → embed → store → backlink
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
                id=uuid.uuid4(),
                tenant_id=current_user.tenant_id,
                user_id=current_user.id,
                thought_id=None,
                title=hit.get("title", ""),
                content=hit.get("content", ""),
                embedding_ref="",
                image_url=None,
                metadata={
                    "summary": hit.get("summary", ""),
                    "tags": hit.get("tags", ""),
                    "domain": hit.get("domain", ""),
                    "energy": hit.get("energy", ""),
                    "source": hit.get("source", ""),
                    "url": hit.get("url", ""),
                },
                created_at=datetime.utcnow()
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
            from app.enricher import embed_text
            embedding = embed_text(f"{item.title} {item.content}")
            weaviate_client.store_seed(
                tenant_id=str(current_user.tenant_id),
                title=item.title,
                content=item.content,
                embedding=embedding,
                metadata={"source": item.source or "chat_harvest"},
            )
        except Exception:
            pass  # Weaviate is best-effort for harvested seeds

    db.commit()
    return BulkSeedResponse(created=len(seed_ids), seed_ids=seed_ids)

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
            f"{BFL_BASE_URL}/v1/flux-2-pro",
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
    return rating

# --- Admin (protected by is_admin check; for MVP we'll skip and use direct DB)

@app.get("/api/v1/admin/health")
def admin_health():
    # Check Weaviate, Postgres, LLM APIs
    status = {"weaviate": "unknown", "postgres": "unknown", "openrouter": "unknown"}
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
    overall = "ok" if all(status[k] == "ok" for k in ["weaviate", "postgres", "openrouter"]) else "degraded"
    return HealthResponse(status=overall, checks=status)

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
            except Exception:
                content_parts.append({
                    "type": "text",
                    "text": f"[File: {filename} ({mime}) - binary, not displayable]"
                })
    return content_parts


# --- Chat (NDJSON streaming with tool calling loop) ---

@app.post("/api/v1/chat")
async def chat_endpoint(
    request: Request,
    current_user = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    from app.tools import TOOLS
    from app.tool_executor import TOOL_HANDLERS
    from app.session_store import SessionRecorder

    body = await request.json()
    messages = body.get("messages", [])
    attachments = body.get("attachments", [])
    max_tool_rounds = 3  # prevent infinite loops

    # Process attachments once (apply to last user message)
    attachment_parts = process_attachments(attachments, settings.MAX_ATTACHMENT_SIZE_MB) if attachments else []

    # Build OpenAI-compatible messages
    openai_messages = []
    for i, msg in enumerate(messages):
        role = msg.get("role")
        text_content = extract_text(msg)

        is_last_user = (role == "user" and i == len(messages) - 1) or (
            role == "user" and all(m.get("role") != "user" for m in messages[i+1:])
        )

        if is_last_user and attachment_parts:
            content = [{"type": "text", "text": text_content}] + attachment_parts
            openai_messages.append({"role": role, "content": content})
        else:
            openai_messages.append({"role": role, "content": text_content})

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.APP_URL or "https://your-domain.com",
        "X-Title": settings.APP_NAME or "Second Brain",
    }

    async def generate():
        nonlocal openai_messages
        import asyncio
        import uuid
        
        # Session recording
        last_prompt = extract_text(messages[-1]) if messages else ""
        recorder = SessionRecorder(
            user_id=str(current_user.id) if current_user else "anonymous",
            tenant_id=str(current_user.tenant_id) if current_user else "",
            prompt=last_prompt[:500],
        )
        
        yield json.dumps({"type": "status", "text": "Thinking…"}) + "\n"
        recorder.event("message", "user", last_prompt[:200])
        await asyncio.sleep(0)

        async with httpx.AsyncClient() as client:
            for round_num in range(max_tool_rounds + 1):
                is_final_round = round_num == max_tool_rounds

                # Request: with tools (except final round, force content)
                payload = {
                    "model": settings.ENRICH_MODEL,
                    "messages": openai_messages,
                    "stream": True,
                }
                if not is_final_round and TOOLS:
                    payload["tools"] = TOOLS

                async with client.stream(
                    "POST", "https://openrouter.ai/api/v1/chat/completions",
                    headers=headers, json=payload, timeout=120.0
                ) as resp:
                    if resp.status_code != 200:
                        error_text = await resp.aread()
                        yield json.dumps({"type": "error", "text": f"API error: {error_text.decode()}"}) + "\n"
                        return

                    # Collect streaming response
                    content_buffer = ""
                    tool_calls_acc = {}  # index -> {id, name, arguments_str}
                    finish_reason = None
                    got_any = False

                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                chunk = json.loads(data)
                                choice = chunk["choices"][0]
                                delta = choice.get("delta", {})
                                finish_reason = choice.get("finish_reason") or finish_reason

                                # Content chunk
                                text = delta.get("content", "")
                                if text:
                                    if not got_any:
                                        yield json.dumps({"type": "status", "text": ""}) + "\n"
                                        got_any = True
                                    content_buffer += text
                                    yield json.dumps({"type": "content", "text": text}) + "\n"

                                # Tool call chunks (streamed in pieces)
                                for tc in delta.get("tool_calls", []) or []:
                                    idx = tc["index"]
                                    if idx not in tool_calls_acc:
                                        tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
                                    if tc.get("id"):
                                        tool_calls_acc[idx]["id"] = tc["id"]
                                    fn = tc.get("function", {})
                                    if fn.get("name"):
                                        tool_calls_acc[idx]["name"] = fn["name"]
                                    if fn.get("arguments"):
                                        tool_calls_acc[idx]["arguments"] += fn["arguments"]
                            except Exception:
                                continue

                    # If we got tool_calls, execute them
                    if tool_calls_acc and finish_reason == "tool_calls":
                        # Add assistant message with tool_calls to history
                        assistant_msg = {
                            "role": "assistant",
                            "content": content_buffer or None,
                            "tool_calls": [
                                {
                                    "id": tc["id"],
                                    "type": "function",
                                    "function": {
                                        "name": tc["name"],
                                        "arguments": tc["arguments"]
                                    }
                                }
                                for tc in tool_calls_acc.values()
                            ]
                        }
                        openai_messages.append(assistant_msg)

                        # Execute each tool
                        for tc in tool_calls_acc.values():
                            tool_name = tc["name"]
                            tool_id = tc["id"]
                            yield json.dumps({
                                "type": "tool_call",
                                "id": tool_id,
                                "name": tool_name,
                                "input": tc["arguments"][:200]
                            }) + "\n"
                            recorder.event("tool_call", tool_name, tc["arguments"][:200])

                            try:
                                args = json.loads(tc["arguments"])
                            except json.JSONDecodeError:
                                args = {}

                            # Execute
                            handler = TOOL_HANDLERS.get(tool_name)
                            if handler:
                                try:
                                    result = await handler(args, current_user, db)
                                except Exception as e:
                                    result = json.dumps({"status": "error", "message": str(e)})
                            else:
                                result = json.dumps({"status": "error", "message": f"Unknown tool: {tool_name}"})

                            yield json.dumps({
                                "type": "tool_result",
                                "id": tool_id,
                                "result": result[:8000]
                            }) + "\n"
                            recorder.event("tool_result", tool_name, result[:200])

                            # Add tool result to messages
                            openai_messages.append({
                                "role": "tool",
                                "tool_call_id": tool_id,
                                "content": result
                            })

                        # Continue to next round
                        continue
                    else:
                        # No tool calls — we're done
                        break

        yield json.dumps({"type": "done"}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")

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

    # ── Session Persistence ───────────────────────────────────────
    store = ChatSessionStore(db)
    agent_session = None

    if session_id and current_user:
        agent_session = store.load_session(session_id)

    if agent_session is None:
        import uuid as _uuid
        session_id = _uuid.uuid4().hex[:12]
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
    except Exception:
        pass

    system_prompt = prompt_builder.render()

    # ── Setup Agent ───────────────────────────────────────────────
    registry = setup_default_registry(
        api_key=settings.OPENROUTER_API_KEY,
        model=settings.ENRICH_MODEL,
    )
    agent = SeedifyAgent(
        registry=registry,
        api_key=settings.OPENROUTER_API_KEY,
        model=settings.ENRICH_MODEL,
        max_rounds=3,
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
            yield f"data: {_json.dumps(d, ensure_ascii=False)}\n\n"

        # Persist session after turn using the agent's full session
        try:
            if current_user:
                actual_session = agent.last_session
                if actual_session and actual_session.messages:
                    store.save(
                        session_id=session_id,
                        messages=actual_session.messages,
                        tenant_id=str(current_user.tenant_id),
                        user_id=str(current_user.id),
                        title=last_prompt[:50] if last_prompt else None,
                    )
                    db.commit()
        except Exception:
            pass

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
    harvest_key = os.environ.get("HARVEST_API_KEY", "<HARVEST_API_KEY>")
    if x_api_key != harvest_key:
        raise HTTPException(status_code=401, detail="Invalid API key")

    from app.agent.persist import ChatSessionStore
    store = ChatSessionStore(db)

    # Get all users with recent sessions
    from app.models import ChatSession as ChatSessionModel
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(hours=2)
    sessions = db.query(ChatSessionModel).filter(
        ChatSessionModel.updated_at >= cutoff
    ).order_by(ChatSessionModel.updated_at.desc()).limit(10).all()

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
                        if hasattr(block, 'type') and block.type == 'text':
                            assistant_texts.append(block.text)
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

            from app.enricher_v2 import enrich_thought_v2
            try:
                enrich_thought_v2(str(thought.id), str(session_row.tenant_id), db)
                thought.status = 'processed'
            except Exception as e:
                thought.status = 'error'
                thought.error_message = str(e)
            db.commit()
            harvested += 1
        except Exception:
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

    # Run enrichment pipeline
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
            model="meta-llama/llama-3.1-8b-instruct:free",
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
    except Exception:
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
SCOPES = "https://www.googleapis.com/auth/calendar.readonly"

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
    except Exception:
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
