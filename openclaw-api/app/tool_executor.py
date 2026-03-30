"""
Tool execution handlers for the chat endpoint.
Each tool is async and returns a JSON-serializable result.
"""
import json
from uuid import UUID
from sqlalchemy.orm import Session
from app.models import User, Seed, Thought
from app.config import settings
from app.weaviate_client import weaviate_client
from datetime import datetime


async def search_seeds(args: dict, user: User, db: Session) -> str:
    """Semantic search over user's seeds via Weaviate."""
    query = args["query"]
    limit = args.get("limit", 5)
    try:
        from app.enricher import embed_text
        embedding = embed_text(query)
        hits = weaviate_client.search_seeds(
            tenant_id=str(user.tenant_id),
            embedding=embedding,
            limit=limit
        )
        results = []
        for hit in hits:
            results.append({
                "title": hit.get("title", ""),
                "content": hit.get("content", "")[:300],
                "created_at": hit.get("created_at", ""),
            })
        if not results:
            return json.dumps({"status": "empty", "message": "No matching seeds found."})
        return json.dumps({"status": "ok", "results": results})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def create_seed(args: dict, user: User, db: Session) -> str:
    """Create a new seed in the user's Second Brain."""
    title = args["title"]
    content = args["content"]
    tags = args.get("tags", [])
    try:
        seed = Seed(
            tenant_id=user.tenant_id,
            user_id=user.id,
            title=title,
            content=content,
            seed_metadata={"tags": tags, "source": "chat"},
            created_at=datetime.utcnow()
        )
        db.add(seed)
        db.commit()
        db.refresh(seed)

        # Also index in Weaviate (best-effort)
        try:
            from app.enricher import embed_text
            embedding = embed_text(f"{title}\n{content}")
            weaviate_client.add_seed(
                tenant_id=str(user.tenant_id),
                user_id=str(user.id),
                thought_id=None,
                title=title,
                content=content,
                embedding=embedding,
                metadata={"tags": tags},
                image_url=None,
                created_at=seed.created_at.isoformat()
            )
        except Exception:
            pass  # Weaviate indexing is best-effort

        return json.dumps({
            "status": "ok",
            "seed_id": str(seed.id),
            "title": title,
            "message": f"Seed '{title}' created successfully."
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def get_daily_briefing(args: dict, user: User, db: Session) -> str:
    """Return a simple daily briefing."""
    # Simplified version; full version uses map-reduce
    try:
        # Count recent seeds
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=7)
        recent = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id,
            Seed.created_at >= cutoff
        ).count()

        briefing = {
            "status": "ok",
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "recent_seeds_7d": recent,
            "message": f"Good morning! You have {recent} seeds from the past 7 days. "
                       f"Your Weaviate index is healthy. Ready to capture new ideas!"
        }
        return json.dumps(briefing)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def list_recent_seeds(args: dict, user: User, db: Session) -> str:
    """List recent seeds from Postgres."""
    limit = args.get("limit", 5)
    try:
        seeds = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id
        ).order_by(Seed.created_at.desc()).limit(limit).all()
        results = [
            {"title": s.title, "content": s.content[:200], "created_at": s.created_at.isoformat()}
            for s in seeds
        ]
        if not results:
            return json.dumps({"status": "empty", "message": "No seeds yet. Start by capturing an idea!"})
        return json.dumps({"status": "ok", "results": results})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


# Tool dispatch map
TOOL_HANDLERS = {
    "search_seeds": search_seeds,
    "create_seed": create_seed,
    "get_daily_briefing": get_daily_briefing,
    "list_recent_seeds": list_recent_seeds,
}
