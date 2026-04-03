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
    """Semantic search over user's seeds via Weaviate (with enrichment metadata)."""
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
            entry = {
                "title": hit.get("title") or "Untitled",
                "content": (hit.get("content") or "")[:400],
                "created_at": hit.get("created_at") or "",
            }
            # Add enrichment metadata if available
            if hit.get("summary"):
                entry["summary"] = hit["summary"][:200]
            if hit.get("tags"):
                entry["tags"] = hit["tags"]
            if hit.get("domain"):
                entry["domain"] = hit["domain"]
            if hit.get("energy"):
                entry["energy"] = hit["energy"]
            if hit.get("entities"):
                try:
                    ents = json.loads(hit["entities"])
                    if ents:
                        entry["entities"] = [e.get("name", "") for e in ents[:3]]
                except:
                    pass
            if hit.get("url"):
                entry["source"] = hit["url"]
            results.append(entry)
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
    """Return a daily briefing with weather, calendar, recent seeds, and a creative prompt."""
    try:
        from datetime import timedelta
        import httpx

        cutoff = datetime.utcnow() - timedelta(days=7)
        recent = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id,
            Seed.created_at >= cutoff
        ).count()

        # Weather for user's city (from onboarding)
        weather_str = ""
        if user.city:
            try:
                async with httpx.AsyncClient(timeout=8) as client:
                    resp = await client.get(
                        f"https://wttr.in/{user.city}",
                        params={"format": "%c+%t+%C", "lang": "en"}
                    )
                    if resp.status_code == 200:
                        weather_str = resp.text.strip()
            except Exception:
                pass

        # Calendar events (if connected)
        calendar_str = ""
        try:
            from app.models import CalendarConnection
            conn = db.query(CalendarConnection).filter(
                CalendarConnection.user_id == user.id,
                CalendarConnection.enabled == True,
            ).first()
            if conn and conn.refresh_token:
                from app.calendar_helper import get_fresh_token, GOOGLE_CALENDAR_API
                token = get_fresh_token(conn, db)
                if token:
                    now = datetime.utcnow()
                    async with httpx.AsyncClient(timeout=10) as client:
                        cal_resp = await client.get(
                            f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
                            headers={"Authorization": f"Bearer {token}"},
                            params={
                                "timeMin": now.isoformat() + "Z",
                                "timeMax": (now + timedelta(hours=12)).isoformat() + "Z",
                                "singleEvents": "true",
                                "orderBy": "startTime",
                                "maxResults": 5,
                            },
                        )
                        if cal_resp.status_code == 200:
                            events = cal_resp.json().get("items", [])
                            if events:
                                lines = []
                                for ev in events[:3]:
                                    summary = ev.get("summary", "(No title)")
                                    start = ev.get("start", {}).get("dateTime", "")
                                    if start:
                                        try:
                                            from datetime import datetime as dt
                                            t = dt.fromisoformat(start.replace("Z", "+00:00"))
                                            time_str = t.strftime("%H:%M")
                                        except Exception:
                                            time_str = "??:??"
                                        lines.append(f"  • {time_str} — {summary}")
                                    else:
                                        lines.append(f"  • {summary}")
                                calendar_str = "\n".join(lines)
        except Exception:
            pass

        # Build briefing
        parts = [f"Good morning! 🌱"]
        if weather_str:
            parts.append(f"☀️ Weather in {user.city}: {weather_str}")
        if calendar_str:
            parts.append(f"📅 Today's schedule:\n{calendar_str}")
        parts.append(f"You have {recent} seeds from the past 7 days.")
        parts.append("Your knowledge garden is healthy. Ready to capture new ideas!")

        briefing = {
            "status": "ok",
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "city": user.city,
            "weather": weather_str or None,
            "calendar": calendar_str or None,
            "recent_seeds_7d": recent,
            "message": " ".join(parts)
        }
        return json.dumps(briefing)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def list_recent_seeds(args: dict, user: User, db: Session) -> str:
    """List recent seeds — tries Postgres first, falls back to Weaviate."""
    limit = args.get("limit", 5)
    try:
        seeds = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id
        ).order_by(Seed.created_at.desc()).limit(limit).all()
        if seeds:
            results = [
                {"title": s.title, "content": s.content[:200], "created_at": s.created_at.isoformat()}
                for s in seeds
            ]
            return json.dumps({"status": "ok", "results": results})

        # Fallback: search Weaviate for recent seeds
        from app.enricher import embed_text
        embedding = embed_text("recent ideas knowledge seeds")
        hits = weaviate_client.search_seeds(
            tenant_id=str(user.tenant_id),
            embedding=embedding,
            limit=limit
        )
        if hits:
            results = [
                {
                    "title": h.get("title", ""),
                    "content": (h.get("content") or "")[:200],
                    "domain": h.get("domain", ""),
                    "tags": h.get("tags", ""),
                }
                for h in hits if h.get("title")
            ]
            return json.dumps({"status": "ok", "results": results})

        return json.dumps({"status": "empty", "message": "No seeds yet. Start by capturing an idea!"})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


# Tool dispatch map
TOOL_HANDLERS = {
    "search_seeds": search_seeds,
    "create_seed": create_seed,
    "get_daily_briefing": get_daily_briefing,
    "list_recent_seeds": list_recent_seeds,
}


async def web_search(args: dict, user: User, db: Session) -> str:
    """Search the web using Exa API."""
    import httpx
    query = args["query"]
    num_results = args.get("num_results", 3)
    exa_key = getattr(settings, 'EXA_API_KEY', None)
    if not exa_key:
        return json.dumps({"status": "error", "message": "Web search not configured. Add EXA_API_KEY to environment."})
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.exa.ai/search",
                headers={"x-api-key": exa_key, "Content-Type": "application/json"},
                json={"query": query, "numResults": num_results, "type": "auto"},
                timeout=15.0
            )
            data = res.json()
            results = []
            for r in data.get("results", [])[:num_results]:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "snippet": r.get("text", "")[:300] if r.get("text") else r.get("highlights", [""])[0],
                })
            return json.dumps({"status": "ok", "results": results, "query": query})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


# Update the dispatch map
TOOL_HANDLERS["web_search"] = web_search


async def rate_seed(args: dict, user: User, db: Session) -> str:
    """Rate a seed from 1-5 stars."""
    seed_id = args["seed_id"]
    score = args["score"]
    feedback = args.get("feedback", "")
    try:
        from app.models import Rating
        existing = db.query(Rating).filter(
            Rating.tenant_id == user.tenant_id,
            Rating.message_id == seed_id
        ).first()
        if existing:
            existing.score = score
            existing.consent = True
            db.commit()
            return json.dumps({"status": "ok", "message": f"Rating updated to {score}⭐"})
        rating = Rating(
            tenant_id=user.tenant_id,
            user_id=user.id,
            message_id=seed_id,
            score=score,
            consent=True,
        )
        db.add(rating)
        db.commit()
        return json.dumps({"status": "ok", "message": f"Seed rated {score}⭐"})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def get_seed_detail(args: dict, user: User, db: Session) -> str:
    """Get full seed details with enrichment metadata from Weaviate."""
    seed_id = args["seed_id"]
    try:
        # Try Weaviate first (enriched data)
        gql = """
        {
          Get {
            IdeaSeed(
              where: { operator: Equal path: ["notion_id"] valueText: "%s" }
              limit: 1
            ) {
              title text summary tags entities backlinks domain energy status enrichment_version source url created
            }
          }
        }
        """ % seed_id
        import urllib.request as req
        r = req.urlopen(req.Request(
            f"{settings.WEAVIATE_URL}/v1/graphql",
            data=json.dumps({"query": gql}).encode(),
            headers={"Content-Type": "application/json"}
        ), timeout=10)
        res = json.loads(r.read())
        hits = res.get("data", {}).get("Get", {}).get("IdeaSeed", [])

        if hits:
            h = hits[0]
            result = {
                "status": "ok",
                "source": "weaviate",
                "title": h.get("title", ""),
                "content": h.get("text", "")[:500],
                "summary": h.get("summary", ""),
                "tags": h.get("tags", ""),
                "domain": h.get("domain", ""),
                "energy": h.get("energy", ""),
                "status": h.get("status", ""),
                "source_url": h.get("url", ""),
                "created": h.get("created", ""),
            }
            # Parse entities
            try:
                result["entities"] = json.loads(h.get("entities", "[]"))
            except:
                result["entities"] = []
            # Parse backlinks
            try:
                result["backlinks"] = json.loads(h.get("backlinks", "[]"))
            except:
                result["backlinks"] = []
            return json.dumps(result)

        # Fallback to Postgres
        seed = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id,
            Seed.id == seed_id
        ).first()
        if seed:
            return json.dumps({
                "status": "ok",
                "source": "postgres",
                "title": seed.title,
                "content": seed.content[:500],
                "created_at": seed.created_at.isoformat()
            })

        return json.dumps({"status": "not_found", "message": f"Seed {seed_id} not found."})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def search_seeds_filtered(args: dict, user: User, db: Session) -> str:
    """Search seeds with domain/tag/energy filters in Weaviate."""
    domain = args.get("domain", "")
    tags = args.get("tags", "")
    energy = args.get("energy", "")
    limit = args.get("limit", 5)
    tenant_id = str(user.tenant_id)

    # Build Weaviate where filter
    filters = []
    if domain:
        filters.append({"operator": "Equal", "path": ["domain"], "valueText": domain})
    if energy:
        filters.append({"operator": "Equal", "path": ["energy"], "valueText": energy})
    # Always filter by tenant (or shared/empty)
    tenant_filter = {"operator": "Or", "operands": [
        {"operator": "Equal", "path": ["tenant_id"], "valueText": tenant_id},
        {"operator": "Equal", "path": ["tenant_id"], "valueText": ""}
    ]}

    try:
        import urllib.request as req

        # Build where clause
        if filters:
            filter_conditions = ", ".join(
                f'{{ operator: Equal path: ["{f["path"][0]}"] valueText: "{f["valueText"]}" }}'
                for f in filters
            )
            where_clause = f"where: {{ operator: And operands: [{{ operator: Or operands: [{{ operator: Equal path: [\"tenant_id\"] valueText: \"{tenant_id}\" }}, {{ operator: Equal path: [\"tenant_id\"] valueText: \"\" }}] }}, {{ operator: And operands: [{filter_conditions}] }}] }}"
        else:
            where_clause = f'where: {{ operator: Or operands: [{{ operator: Equal path: ["tenant_id"] valueText: "{tenant_id}" }}, {{ operator: Equal path: ["tenant_id"] valueText: "" }}] }}'

        gql = """
        {
          Get {
            IdeaSeed(
              %s
              limit: %d
              sort: [{ path: ["enrichment_version"], order: desc }]
            ) {
              notion_id title summary tags domain energy source url created
            }
          }
        }
        """ % (where_clause, limit)

        r = req.urlopen(req.Request(
            f"{settings.WEAVIATE_URL}/v1/graphql",
            data=json.dumps({"query": gql}).encode(),
            headers={"Content-Type": "application/json"}
        ), timeout=10)
        res = json.loads(r.read())
        hits = res.get("data", {}).get("Get", {}).get("IdeaSeed", [])

        # Deduplicate by notion_id
        seen = {}
        for h in hits:
            nid = h.get("notion_id", h.get("title", ""))
            if nid not in seen:
                seen[nid] = {
                    "title": h.get("title", ""),
                    "summary": h.get("summary", "")[:200],
                    "tags": h.get("tags", ""),
                    "domain": h.get("domain", ""),
                    "energy": h.get("energy", ""),
                    "url": h.get("url", ""),
                }

        results = list(seen.values())[:limit]
        if not results:
            return json.dumps({"status": "empty", "message": "No seeds found with those filters."})
        return json.dumps({"status": "ok", "count": len(results), "results": results})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


# Register new handlers
TOOL_HANDLERS["rate_seed"] = rate_seed
TOOL_HANDLERS["get_seed_detail"] = get_seed_detail
TOOL_HANDLERS["search_seeds_filtered"] = search_seeds_filtered
