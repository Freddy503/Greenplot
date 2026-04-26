"""
ingest.py
Voice (Whisper) and Image (Vision + BFL) ingestion endpoints.

Voice flow:  audio upload → Whisper transcribe → Thought → enrich_v2 → Seed
Image flow:  image upload → Vision extract ideas → Thought → enrich_v2 → BFL concept image → Seed
"""

import os
import io
import json
import time
import uuid
import tempfile
import urllib.request
from datetime import datetime
from typing import Optional

import httpx
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Thought, Seed

# ---------------------------------------------------------------------------
# Whisper transcription
# ---------------------------------------------------------------------------

# Use Groq Whisper (whisper-large-v3-turbo) when GROQ_API_KEY is set — 10× faster
# than OpenAI whisper-1. Both endpoints share the same HTTP interface.
_GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
WHISPER_URL = (
    "https://api.groq.com/openai/v1/audio/transcriptions"
    if _GROQ_API_KEY
    else "https://api.openai.com/v1/audio/transcriptions"
)
_WHISPER_MODEL = "whisper-large-v3-turbo" if _GROQ_API_KEY else "whisper-1"

VISION_URL = "https://openrouter.ai/api/v1/chat/completions"


def _stt_headers() -> dict:
    """Return auth headers for the active STT provider."""
    key = _GROQ_API_KEY or getattr(settings, "OPENAI_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="No STT API key configured (set GROQ_API_KEY or OPENAI_API_KEY)")
    return {"Authorization": f"Bearer {key}"}


def _openai_headers() -> dict:
    key = settings.OPENAI_API_KEY
    if not key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
    return {"Authorization": f"Bearer {key}"}


async def transcribe_audio(file: UploadFile) -> str:
    """Send audio to Whisper (Groq if GROQ_API_KEY set, else OpenAI) and return transcript."""
    audio_bytes = await file.read()
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # Determine extension from content-type or filename
    ext = ".webm"
    if file.filename:
        _, ext = os.path.splitext(file.filename)
    elif file.content_type:
        ct_map = {
            "audio/mpeg": ".mp3", "audio/mp3": ".mp3",
            "audio/wav": ".wav", "audio/x-wav": ".wav",
            "audio/ogg": ".ogg", "audio/webm": ".webm",
            "audio/mp4": ".m4a", "audio/x-m4a": ".m4a",
        }
        ext = ct_map.get(file.content_type, ".webm")

    # Write to temp file (Whisper API requires a file upload)
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        async with httpx.AsyncClient() as client:
            with open(tmp_path, "rb") as f:
                resp = await client.post(
                    WHISPER_URL,
                    headers=_stt_headers(),
                    data={"model": _WHISPER_MODEL, "language": "en"},
                    files={"file": (file.filename or "audio" + ext, f)},
                    timeout=60.0,
                )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Whisper API error ({resp.status_code}): {resp.text[:300]}",
            )
        data = resp.json()
        transcript = data.get("text", "").strip()
        if not transcript:
            raise HTTPException(status_code=422, detail="Whisper returned empty transcript")
        return transcript
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Vision extraction (GPT-4o-mini via OpenRouter)
# ---------------------------------------------------------------------------

VISION_PROMPT = (
    "You are an idea extractor. Analyze this image and extract all meaningful ideas, "
    "text, diagrams, or concepts visible. Return a JSON object with:\n"
    '- "title": a concise title (max 80 chars)\n'
    '- "content": 2-4 paragraph elaboration of the ideas found\n'
    '- "tags": array of 3-6 relevant tags\n'
    '- "source_description": one sentence describing what the image shows '
    "(e.g. 'whiteboard sketch of microservices architecture')\n\n"
    "Return ONLY valid JSON, no markdown fences."
)


async def extract_ideas_from_image(file: UploadFile) -> dict:
    """Use GPT-4o-mini vision to extract ideas from an image."""
    image_bytes = await file.read()
    if len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty image file")

    import base64
    b64 = base64.b64encode(image_bytes).decode()
    mime = file.content_type or "image/png"
    data_url = f"data:{mime};base64,{b64}"

    key = settings.OPENROUTER_API_KEY
    if not key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not configured")

    payload = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "max_tokens": 800,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            VISION_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30.0,
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Vision API error ({resp.status_code}): {resp.text[:300]}",
        )

    content = resp.json()["choices"][0]["message"]["content"].strip()
    # Strip markdown fences if the model wraps them
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        # Fallback: use raw text as content
        return {
            "title": "Image Capture",
            "content": content,
            "tags": ["image", "capture"],
            "source_description": "uploaded image",
        }


# ---------------------------------------------------------------------------
# BFL concept image generation
# ---------------------------------------------------------------------------

BFL_POLL_TIMEOUT = 60  # seconds


async def generate_concept_image(seed_title: str, seed_tags: list[str]) -> Optional[str]:
    """Generate a concept image via BFL Flux.dev. Returns image URL or None."""
    key = settings.BFL_API_KEY
    if not key:
        return None

    tags_str = ", ".join(seed_tags[:5])
    prompt = (
        f"Minimalist abstract concept art for an idea called '{seed_title}'. "
        f"Themes: {tags_str}. "
        "Clean geometric shapes, soft gradients, modern editorial illustration style. "
        "No text, no letters, no words."
    )

    payload = json.dumps({
        "prompt": prompt,
        "width": 1024,
        "height": 768,
    }).encode()

    try:
        # Submit generation request
        req = urllib.request.Request(
            settings.BFL_API_URL,
            data=payload,
            headers={"x-key": key, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            res = json.loads(r.read())

        polling_url = res.get("polling_url")
        if not polling_url:
            return None

        # Poll for result
        deadline = time.time() + BFL_POLL_TIMEOUT
        while time.time() < deadline:
            time.sleep(3)
            poll_req = urllib.request.Request(polling_url, headers={"x-key": key})
            with urllib.request.urlopen(poll_req, timeout=15) as r:
                poll = json.loads(r.read())
            if poll.get("status") == "Ready":
                return poll.get("result", {}).get("sample")
            if poll.get("status") in ("Error", "Failed"):
                return None
        return None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# High-level ingestion helpers (called from route handlers)
# ---------------------------------------------------------------------------

async def ingest_voice(file: UploadFile, user, db: Session) -> dict:
    """
    Full voice ingestion pipeline:
    audio → Whisper → Thought → enrich_v2 → Seed
    """
    # 1. Transcribe
    transcript = await transcribe_audio(file)

    # 2. Create Thought
    thought = Thought(
        tenant_id=user.tenant_id,
        user_id=user.id,
        content=transcript,
        source="voice",
        status="pending",
    )
    db.add(thought)
    db.flush()

    # 3. Enrich (chunk → extract → embed → seed → backlink)
    from app.enricher_v2 import enrich_thought_v2
    try:
        enrich_thought_v2(str(thought.id), str(user.tenant_id), db)
        thought.status = "processed"
        thought.processed_at = datetime.utcnow()
    except Exception as e:
        thought.status = "error"
        thought.error_message = str(e)
    db.commit()

    # 4. Return the created seed(s)
    seeds = db.query(Seed).filter(Seed.thought_id == thought.id).all()
    return {
        "status": "ok",
        "transcript": transcript,
        "thought_id": str(thought.id),
        "seeds": [
            {"id": str(s.id), "title": s.title, "content": s.content[:300]}
            for s in seeds
        ],
    }


async def ingest_image(file: UploadFile, user, db: Session) -> dict:
    """
    Full image ingestion pipeline:
    image → Vision extract → Thought → enrich_v2 → BFL concept art → Seed
    """
    # 1. Extract ideas from image via vision
    extracted = await extract_ideas_from_image(file)
    title = extracted.get("title", "Image Capture")
    content = extracted.get("content", "")
    tags = extracted.get("tags", [])
    source_desc = extracted.get("source_description", "uploaded image")

    full_content = f"[Extracted from image: {source_desc}]\n\n{content}"

    # 2. Create Thought
    thought = Thought(
        tenant_id=user.tenant_id,
        user_id=user.id,
        content=full_content,
        source="image",
        status="pending",
    )
    db.add(thought)
    db.flush()

    # 3. Enrich
    from app.enricher_v2 import enrich_thought_v2
    try:
        enrich_thought_v2(str(thought.id), str(user.tenant_id), db)
        thought.status = "processed"
        thought.processed_at = datetime.utcnow()
    except Exception as e:
        thought.status = "error"
        thought.error_message = str(e)
    db.commit()

    # 4. Generate concept image via BFL (best-effort)
    seeds = db.query(Seed).filter(Seed.thought_id == thought.id).all()
    image_url = None
    if seeds:
        image_url = await generate_concept_image(seeds[0].title, tags)
        if image_url:
            seeds[0].image_url = image_url
            db.commit()

    return {
        "status": "ok",
        "extracted_title": title,
        "extracted_tags": tags,
        "source_description": source_desc,
        "thought_id": str(thought.id),
        "concept_image_url": image_url,
        "seeds": [
            {"id": str(s.id), "title": s.title, "content": s.content[:300], "image_url": s.image_url}
            for s in seeds
        ],
    }
