from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Request, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
import os
import base64
import mimetypes
from app.database import engine, get_db
from app.models import Base, User, Thought, Seed, Usage
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
    from app.tool_pool import assemble_tool_pool, extract_keyword_hints
    from app.tool_executor import TOOL_HANDLERS
    from app.models_frozen import PermissionContext
    from app.session_store import SessionRecorder

    body = await request.json()
    messages = body.get("messages", [])
    attachments = body.get("attachments", [])
    max_tool_rounds = 3  # prevent infinite loops

    # Assemble tool pool with permission filtering
    tenant_id = str(current_user.tenant_id) if current_user else ""
    perm = PermissionContext.admin(tenant_id) if (current_user and getattr(current_user, 'is_admin', False)) else PermissionContext.user(tenant_id)
    
    # Extract keyword hints from last user message
    last_user_msg = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            last_user_msg = extract_text(msg)
            break
    hints = extract_keyword_hints(last_user_msg)
    
    tool_pool = assemble_tool_pool(permission_context=perm, simple_mode=True, keyword_hints=hints)
    TOOLS = tool_pool.to_openai()

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
        recorder = SessionRecorder(
            user_id=str(current_user.id) if current_user else "anonymous",
            tenant_id=tenant_id,
            prompt=last_user_msg[:500],
        )
        
        yield json.dumps({"type": "status", "text": "Thinking…"}) + "\n"
        recorder.event("message", "user", last_user_msg[:200])
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
        "voice_ingestion": "stub",
        "image_ingestion": "stub",
        "garden_pipeline": "linked",
    }
    return result



