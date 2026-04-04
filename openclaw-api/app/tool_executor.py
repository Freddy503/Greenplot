"""
Tool execution handlers for the chat endpoint.
Each tool is async and returns a JSON-serializable result.
"""
import json
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
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
    """Return an actionable daily briefing: seeds to review, new sources, connections, suggested actions."""
    try:
        from datetime import timedelta
        from app.models import SeedLink, Usage
        import httpx

        now = datetime.utcnow()
        today_cutoff = now - timedelta(hours=24)
        week_cutoff = now - timedelta(days=7)

        # ── Weather ──
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

        # ── Calendar ──
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

        # ── Seeds to review (oldest unreviewed, no rating) ──
        seeds_to_review = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id,
            ~Seed.seed_metadata.has_key('rated'),  # unrated seeds
        ).order_by(Seed.created_at.asc()).limit(3).all()

        review_items = []
        for s in seeds_to_review:
            review_items.append({
                "id": str(s.id),
                "title": s.title,
                "age_days": (now - s.created_at).days if s.created_at else 0,
            })

        # ── New seeds (last 24h) ──
        new_seeds = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id,
            Seed.created_at >= today_cutoff
        ).order_by(Seed.created_at.desc()).limit(5).all()

        new_seed_items = [{"title": s.title, "source": (s.seed_metadata or {}).get("source", "manual")} for s in new_seeds]

        # ── New sources (last 24h) ──
        all_links = weaviate_client.get_links(tenant_id=str(user.tenant_id), limit=20)
        new_sources = [l for l in all_links if l.get("created_at", "") >= today_cutoff.isoformat()]
        source_items = [{"title": l.get("title", "")[:60], "domain": l.get("domain", "")} for l in new_sources[:3]]

        # ── Recent connections ──
        recent_connections = db.query(SeedLink).join(Seed, SeedLink.source_seed_id == Seed.id).filter(
            Seed.tenant_id == user.tenant_id,
            SeedLink.created_at >= week_cutoff
        ).count()

        # ── Pending enrichment ──
        pending = db.query(Thought).filter(
            Thought.tenant_id == user.tenant_id,
            Thought.status == 'pending'
        ).count()

        # ── Total stats ──
        total_seeds = db.query(Seed).filter(Seed.tenant_id == user.tenant_id).count()
        total_sources = len(all_links)

        # ── Build actionable message ──
        parts = ["Good morning! 🌱 Here's your knowledge briefing:\n"]

        if weather_str:
            parts.append(f"☀️ {user.city}: {weather_str}\n")
        if calendar_str:
            parts.append(f"📅 Today:\n{calendar_str}\n")

        # Action items
        if review_items:
            parts.append(f"\n🔍 **Seeds to review** (oldest first):")
            for r in review_items:
                parts.append(f"  • {r['title']} ({r['age_days']}d old)")

        if new_seed_items:
            parts.append(f"\n🌱 **New seeds** (last 24h): {len(new_seed_items)}")
            for s in new_seed_items[:3]:
                parts.append(f"  • {s['title']} [{s['source']}]")

        if source_items:
            parts.append(f"\n📎 **New sources**: {len(new_sources)}")
            for s in source_items:
                parts.append(f"  • {s['title']} ({s['domain']})")

        if recent_connections:
            parts.append(f"\n🔗 **Connections this week**: {recent_connections}")

        if pending:
            parts.append(f"\n⏳ **Pending enrichment**: {pending} thoughts queued")

        parts.append(f"\n📊 Garden: {total_seeds} seeds | {total_sources} sources")

        # Suggested action
        if review_items:
            parts.append(f"\n💡 **Suggested**: Review \"{review_items[0]['title']}\" — it's {review_items[0]['age_days']} days old and hasn't been rated.")
        elif new_seed_items:
            parts.append(f"\n💡 **Suggested**: Explore connections between your latest seeds.")
        else:
            parts.append(f"\n💡 **Suggested**: Search for a topic and create a new seed from what you find.")

        return json.dumps({
            "status": "ok",
            "date": now.strftime("%Y-%m-%d"),
            "city": user.city,
            "weather": weather_str or None,
            "calendar": calendar_str or None,
            "seeds_to_review": review_items,
            "new_seeds": new_seed_items,
            "new_sources": source_items,
            "connections_week": recent_connections,
            "pending_enrichment": pending,
            "total_seeds": total_seeds,
            "total_sources": total_sources,
            "message": "\n".join(parts),
        })
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
            # Bridge: auto-save web results as Links (Sources page)
            await _save_web_results_as_links(results, user)

            return json.dumps({"status": "ok", "results": results, "query": query})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


# Update the dispatch map
TOOL_HANDLERS["web_search"] = web_search


async def _save_web_results_as_links(results: list, user: User):
    """Bridge: auto-save web search results as Links (Sources page) in Weaviate."""
    try:
        # Get existing links to avoid duplicates
        existing = weaviate_client.get_links(tenant_id=str(user.tenant_id), limit=200)
        existing_urls = {link.get("url", "") for link in existing}

        for r in results:
            url = r.get("url", "")
            if not url or url in existing_urls:
                continue
            try:
                from urllib.parse import urlparse
                domain = urlparse(url).netloc.replace("www.", "")
            except:
                domain = "unknown"

            try:
                weaviate_client.add_link(
                    tenant_id=str(user.tenant_id),
                    user_id=str(user.id),
                    url=url,
                    title=r.get("title", "")[:200],
                    summary=r.get("snippet", "")[:500],
                    domain=domain,
                    tags="chat-discovered",
                    favicon=f"https://www.google.com/s2/favicons?domain={domain}&sz=32",
                    og_image="",
                    raw_text=r.get("snippet", "")[:2000],
                    status="enriched",
                    starred=False,
                )
                # Activity log
                try:
                    from app.activity import log_source_found
                    log_source_found(str(user.tenant_id), r.get("title", ""), url, "chat_web_search")
                except:
                    pass
            except Exception:
                pass  # non-blocking
    except Exception:
        pass  # non-blocking


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


# ── Cohesion Tools: Bridge Chat ↔ Garden ↔ Sources ──

async def search_sources(args: dict, user: User, db: Session) -> str:
    """Search user's Sources library (Links in Weaviate)."""
    query = args["query"]
    limit = args.get("limit", 5)
    try:
        # Search links by title/summary/tags via Weaviate
        links = weaviate_client.get_links(tenant_id=str(user.tenant_id), search=query, limit=limit)
        if not links:
            return json.dumps({"status": "empty", "message": "No sources found matching that query."})

        results = []
        for link in links:
            results.append({
                "id": link.get("id", ""),
                "title": link.get("title", ""),
                "url": link.get("url", ""),
                "summary": link.get("summary", "")[:200],
                "domain": link.get("domain", ""),
                "tags": link.get("tags", ""),
                "favicon": link.get("favicon", ""),
            })
        return json.dumps({"status": "ok", "count": len(results), "results": results})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def create_seed_from_source(args: dict, user: User, db: Session) -> str:
    """Create a seed from an existing source link — the Sources → Garden bridge."""
    link_id = args["link_id"]
    title = args["title"]
    elaboration = args.get("elaboration", "")

    try:
        # Fetch the link from Weaviate
        obj = weaviate_client.client.data_object.get_by_id(uuid=link_id, class_name="Link")
        props = obj.get("properties", {})
        source_url = props.get("url", "")
        source_summary = props.get("summary", "")
        domain = props.get("domain", "")

        # Build seed content
        content_parts = []
        if elaboration:
            content_parts.append(elaboration)
        if source_summary:
            content_parts.append(f"\nSource summary: {source_summary}")
        if source_url:
            content_parts.append(f"\nSource: {source_url}")
        content = "\n".join(content_parts)

        # Create seed in Postgres
        seed = Seed(
            tenant_id=user.tenant_id,
            user_id=user.id,
            title=title,
            content=content,
            seed_metadata={
                "source": "source_to_seed",
                "source_link_id": link_id,
                "source_url": source_url,
                "domain": domain,
            },
            created_at=datetime.utcnow()
        )
        db.add(seed)
        db.commit()
        db.refresh(seed)

        # Index in Weaviate
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
                metadata={"source": "source_to_seed", "source_url": source_url, "domain": domain},
                image_url=None,
                created_at=seed.created_at.isoformat()
            )
        except Exception:
            pass

        # Update link with garden_seed_id
        try:
            weaviate_client.update_link(link_id, garden_seed_id=str(seed.id))
        except Exception:
            pass

        # Invalidate seed cache
        try:
            from app.cache import invalidate_seeds
            invalidate_seeds(str(user.tenant_id))
        except Exception:
            pass

        return json.dumps({
            "status": "ok",
            "seed_id": str(seed.id),
            "title": title,
            "source_url": source_url,
            "message": f"Seed '{title}' created from source."
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def get_knowledge_digest(args: dict, user: User, db: Session) -> str:
    """Get a knowledge digest: recent seeds, new sources, connections."""
    days = args.get("days", 7)
    try:
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=days)

        # Recent seeds
        recent_seeds = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id,
            Seed.created_at >= cutoff
        ).order_by(Seed.created_at.desc()).limit(10).all()

        # New sources (links)
        all_links = weaviate_client.get_links(tenant_id=str(user.tenant_id), limit=50)
        new_links = [l for l in all_links if l.get("created_at", "") >= cutoff.isoformat()]

        # Connections (seed links)
        from app.models import SeedLink
        connections = db.query(SeedLink).join(Seed, SeedLink.source_seed_id == Seed.id).filter(
            Seed.tenant_id == user.tenant_id,
            SeedLink.created_at >= cutoff
        ).count()

        # Pending thoughts
        pending = db.query(Thought).filter(
            Thought.tenant_id == user.tenant_id,
            Thought.status == 'pending'
        ).count()

        # Build digest
        seed_summaries = []
        for s in recent_seeds[:5]:
            seed_summaries.append({
                "title": s.title,
                "created": s.created_at.strftime("%b %d") if s.created_at else "?",
                "source": (s.seed_metadata or {}).get("source", "manual"),
            })

        source_summaries = []
        for l in new_links[:5]:
            source_summaries.append({
                "title": l.get("title", "")[:60],
                "domain": l.get("domain", ""),
            })

        digest = {
            "period": f"Last {days} days",
            "seeds": {"count": len(recent_seeds), "items": seed_summaries},
            "sources": {"count": len(new_links), "items": source_summaries},
            "connections": connections,
            "pending_enrichment": pending,
        }

        return json.dumps({"status": "ok", "digest": digest})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["search_sources"] = search_sources
TOOL_HANDLERS["create_seed_from_source"] = create_seed_from_source
TOOL_HANDLERS["get_knowledge_digest"] = get_knowledge_digest


async def get_garden_intelligence(args: dict, user: User, db: Session) -> str:
    """Garden intelligence: trending, stale, top-rated, health."""
    try:
        from app.models import SeedLink, Rating
        from datetime import timedelta

        tenant_id = user.tenant_id
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)

        all_seeds = db.query(Seed).filter(Seed.tenant_id == tenant_id).all()

        # Trending: most connections this week
        trending_ids = db.query(
            SeedLink.source_seed_id,
            sa_func.count(SeedLink.id).label('link_count')
        ).join(Seed, SeedLink.source_seed_id == Seed.id).filter(
            Seed.tenant_id == tenant_id,
            SeedLink.created_at >= week_ago
        ).group_by(SeedLink.source_seed_id).order_by(
            sa_func.count(SeedLink.id).desc()
        ).limit(3).all()

        trending = []
        if trending_ids:
            trending_id_list = [seed_id for seed_id, _ in trending_ids]
            trending_objects = db.query(Seed).filter(Seed.id.in_(trending_id_list)).all()
            trending_by_id = {str(s.id): s for s in trending_objects}
            for seed_id, count in trending_ids:
                s = trending_by_id.get(str(seed_id))
                if s:
                    trending.append({"title": s.title, "connections": count})

        # Stale: old unrated seeds
        stale = []
        for s in sorted(all_seeds, key=lambda x: x.created_at or now):
            age = (now - s.created_at).days if s.created_at else 999
            if age >= 7:
                meta = s.seed_metadata or {}
                if not meta.get("rated"):
                    stale.append({"title": s.title, "age_days": age})
            if len(stale) >= 3:
                break

        # Recent (last 7 days)
        recent = [s for s in all_seeds if s.created_at and s.created_at >= week_ago]

        # Connections
        total_connections = db.query(SeedLink).join(Seed, SeedLink.source_seed_id == Seed.id).filter(
            Seed.tenant_id == tenant_id
        ).count()

        # Pending
        pending = db.query(Thought).filter(
            Thought.tenant_id == tenant_id,
            Thought.status == 'pending'
        ).count()

        # Health score
        health = min(100, int(
            (len(recent) * 10) +
            (len(trending) * 5) -
            (len(stale) * 3) -
            (pending * 2)
        ))

        parts = [f"🌿 Garden Intelligence — {len(all_seeds)} seeds\n"]
        parts.append(f"Health: {health}/100 | Connections: {total_connections} | Pending: {pending}\n")

        if trending:
            parts.append("🔥 Trending:")
            for t in trending:
                parts.append(f"  • {t['title']} ({t['connections']} connections)")

        if stale:
            parts.append("\n⏳ Stale (needs attention):")
            for s in stale:
                parts.append(f"  • {s['title']} ({s['age_days']}d old, unrated)")

        if recent:
            parts.append(f"\n🌱 {len(recent)} seeds added this week")

        if stale:
            parts.append(f"\n💡 Suggested: Review \"{stale[0]['title']}\" — it's been sitting unrated for {stale[0]['age_days']} days.")

        return json.dumps({
            "status": "ok",
            "total_seeds": len(all_seeds),
            "health_score": health,
            "trending": trending,
            "stale": stale,
            "recent_count": len(recent),
            "connections": total_connections,
            "pending": pending,
            "message": "\n".join(parts),
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["get_garden_intelligence"] = get_garden_intelligence


async def get_activity_feed(args: dict, user: User, db: Session) -> str:
    """Get recent system activity feed."""
    hours = args.get("hours", 48)
    limit = args.get("limit", 10)
    try:
        from app.activity import get_activity_feed as _get_feed
        events = _get_feed(str(user.tenant_id), limit=limit, hours=hours)

        if not events:
            return json.dumps({"status": "empty", "message": "No recent activity."})

        parts = [f"📋 Activity Feed (last {hours}h):\n"]
        for e in events:
            ts = e.get("timestamp", 0)
            from datetime import datetime
            dt = datetime.fromtimestamp(ts)
            time_str = dt.strftime("%H:%M") if (datetime.utcnow() - dt).days < 1 else dt.strftime("%b %d %H:%M")
            parts.append(f"  {time_str} — {e['title']}")
            if e.get("detail"):
                parts.append(f"         {e['detail']}")

        return json.dumps({
            "status": "ok",
            "count": len(events),
            "events": events,
            "message": "\n".join(parts),
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["get_activity_feed"] = get_activity_feed


async def read_source(args: dict, user: User, db: Session) -> str:
    """Fetch and read the full content of a saved source link."""
    link_id = args["link_id"]
    try:
        # Get the link from Weaviate
        obj = weaviate_client.client.data_object.get_by_id(uuid=link_id, class_name="Link")
        props = obj.get("properties", {})

        url = props.get("url", "")
        title = props.get("title", "")
        summary = props.get("summary", "")
        raw_text = props.get("raw_text", "")

        if not url:
            return json.dumps({"status": "error", "message": "Link not found"})

        # If we have cached raw_text, use it
        if raw_text and len(raw_text) > 100:
            return json.dumps({
                "status": "ok",
                "title": title,
                "url": url,
                "content": raw_text[:5000],
                "source": "cached"
            })

        # Otherwise, fetch the page
        import httpx
        try:
            async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
                resp = await client.get(url, headers={"User-Agent": "GreenPlot Bot/1.0"})
                if resp.status_code != 200:
                    return json.dumps({"status": "error", "message": f"HTTP {resp.status_code}"})

                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, "html.parser")
                for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                    tag.decompose()
                content = soup.get_text(separator=" ", strip=True)[:5000]

                return json.dumps({
                    "status": "ok",
                    "title": title or (soup.title.string if soup.title else ""),
                    "url": url,
                    "content": content,
                    "source": "fetched"
                })
        except Exception as e:
            return json.dumps({"status": "error", "message": f"Fetch failed: {str(e)}"})

    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["read_source"] = read_source
