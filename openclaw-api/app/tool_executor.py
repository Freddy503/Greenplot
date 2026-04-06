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
        except Exception as e:
            logger.warning(f"Weaviate indexing failed for seed {seed.id}: {e}")

        # Enqueue enrichment via Redis so domain/tags/summary/energy get populated
        try:
            from app.task_broker import enqueue_enrichment
            # Create a synthetic Thought so the enricher worker can process it
            from app.models import Thought
            thought = Thought(
                tenant_id=user.tenant_id,
                user_id=user.id,
                content=f"{title}\n\n{content}",
                source='chat',
                status='pending',
            )
            db.add(thought)
            db.commit()
            db.refresh(thought)
            enqueue_enrichment(str(thought.id), str(user.tenant_id))
        except Exception as e:
            logger.warning(f"Enrichment queue failed for seed '{title}': {e}")

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
        user_city = getattr(user, 'city', None)
        if user_city:
            try:
                async with httpx.AsyncClient(timeout=8) as client:
                    resp = await client.get(
                        f"https://wttr.in/{user_city}",
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

        # ── Connections you missed (unlinked seeds with shared tags from Weaviate) ──
        missed_connections = []
        try:
            # Get seeds with tags from Weaviate
            tagged_seeds = weaviate_client.get_seeds_by_tenant(tenant_id=str(user.tenant_id), limit=100)
            if tagged_seeds:
                # Build tag → seed mapping
                tag_map = {}
                for seed in tagged_seeds:
                    tags_str = seed.get("tags", "")
                    if tags_str:
                        for tag in tags_str.lower().split(","):
                            tag = tag.strip()
                            if tag and len(tag) > 2:
                                tag_map.setdefault(tag, []).append(seed)

                # Find pairs with shared tags that don't have existing links
                seen_pairs = set()
                for tag, seeds_list in tag_map.items():
                    if len(seeds_list) >= 2:
                        for i in range(len(seeds_list)):
                            for j in range(i + 1, len(seeds_list)):
                                s1, s2 = seeds_list[i], seeds_list[j]
                                pair_key = tuple(sorted([s1.get("notion_id", ""), s2.get("notion_id", "")]))
                                if pair_key not in seen_pairs and pair_key[0] and pair_key[1]:
                                    seen_pairs.add(pair_key)
                                    missed_connections.append({
                                        "seed_1": s1.get("title", "")[:50],
                                        "seed_2": s2.get("title", "")[:50],
                                        "shared_tag": tag,
                                    })
                missed_connections = missed_connections[:3]  # limit to 3
        except Exception as e:
            logger.debug(f"Missed connections lookup failed: {e}")

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
            parts.append(f"☀️ {user_city}: {weather_str}\n")
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

        if missed_connections:
            parts.append(f"\n🔍 **Connections you missed**:")
            for mc in missed_connections:
                parts.append(f"  • \"{mc['seed_1']}\" ↔ \"{mc['seed_2']}\" (shared: {mc['shared_tag']})")

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
            "city": user_city,
            "weather": weather_str or None,
            "calendar": calendar_str or None,
            "seeds_to_review": review_items,
            "new_seeds": new_seed_items,
            "new_sources": source_items,
            "connections_week": recent_connections,
            "missed_connections": missed_connections,
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
                except Exception as e:
                    logger.debug(f"Activity logging failed: {e}")
            except Exception as e:
                logger.debug(f"Link enrichment failed: {e}")
    except Exception as e:
        logger.debug(f"Web search post-processing failed: {e}")


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
        # Try Weaviate first (enriched data) using async httpx
        import httpx
        where_filter = {
            "operator": "Equal",
            "path": ["notion_id"],
            "valueText": seed_id
        }
        gql_query = {
            "query": """{
              Get {
                IdeaSeed(
                  where: %s,
                  limit: 1
                ) {
                  title text summary tags entities backlinks domain energy status enrichment_version source url created
                }
              }
            }""" % json.dumps(where_filter)
        }

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{settings.WEAVIATE_URL}/v1/graphql",
                json=gql_query,
                headers={"Content-Type": "application/json"}
            )
            res = resp.json()
            hits = res.get("data", {}).get("Get", {}).get("IdeaSeed", [])

        if hits:
            h = hits[0]
            # Track visit even when data comes from Weaviate
            try:
                seed = db.query(Seed).filter(
                    Seed.tenant_id == user.tenant_id,
                    Seed.id == seed_id
                ).first()
                if not seed:
                    seed = db.query(Seed).filter(
                        Seed.tenant_id == user.tenant_id,
                        Seed.embedding_ref == seed_id
                    ).first()
                if seed:
                    seed.last_visited = datetime.utcnow()
                    seed.visit_count = (seed.visit_count or 0) + 1
                    db.commit()
            except Exception as e:
                logger.warning(f"Visit tracking failed for seed {seed_id}: {e}")

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
            except (json.JSONDecodeError, TypeError):
                result["entities"] = []
            # Parse backlinks
            try:
                result["backlinks"] = json.loads(h.get("backlinks", "[]"))
            except (json.JSONDecodeError, TypeError):
                result["backlinks"] = []
            return json.dumps(result)

        # Fallback to Postgres
        seed = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id,
            Seed.id == seed_id
        ).first()
        if seed:
            # Track visit
            seed.last_visited = datetime.utcnow()
            seed.visit_count = (seed.visit_count or 0) + 1
            db.commit()
            return json.dumps({
                "status": "ok",
                "source": "postgres",
                "title": seed.title,
                "content": seed.content[:500],
                "created_at": seed.created_at.isoformat(),
                "last_visited": seed.last_visited.isoformat(),
                "visit_count": seed.visit_count,
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
        import httpx

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

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{settings.WEAVIATE_URL}/v1/graphql",
                json={"query": gql},
                headers={"Content-Type": "application/json"}
            )
            res = resp.json()
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
    """Garden intelligence: trending, stale (with decay), revisiting suggestions, health."""
    try:
        from app.models import SeedLink, Rating
        from datetime import timedelta
        import math

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

        # Decay-based stale scoring: relevance = e^(-λt) * visit_count
        # Higher decay_rate (λ) = faster decay
        DECAY_RATE = 0.05  # ~14 days half-life
        STALE_THRESHOLD = 0.3  # relevance below this = "needs attention"
        REVISIT_DAYS = 30  # "hasn't been revisited in X days"

        scored_seeds = []
        for s in all_seeds:
            if not s.created_at:
                continue
            age_days = (now - s.created_at).total_seconds() / 86400
            visits = s.visit_count or 0
            last_visit = s.last_visited

            # Decay score: e^(-λ * age_days)
            decay = math.exp(-DECAY_RATE * age_days)
            # Relevance: weighted by visits + decay
            relevance = decay * (1 + visits * 0.5)

            # Days since last visit (or creation if never visited)
            days_since_activity = (now - (last_visit or s.created_at)).days

            scored_seeds.append({
                "seed": s,
                "relevance": relevance,
                "decay": decay,
                "age_days": int(age_days),
                "visits": visits,
                "days_since_activity": days_since_activity,
            })

        # Stale: low relevance, old, unrated
        stale = []
        for item in sorted(scored_seeds, key=lambda x: x["relevance"]):
            s = item["seed"]
            meta = s.seed_metadata or {}
            if item["relevance"] < STALE_THRESHOLD and item["age_days"] >= 7 and not meta.get("rated"):
                stale.append({
                    "title": s.title,
                    "age_days": item["age_days"],
                    "relevance": round(item["relevance"], 2),
                    "days_since_activity": item["days_since_activity"],
                })
            if len(stale) >= 5:
                break

        # Needs revisiting: not viewed in 30+ days, was visited before
        needs_revisit = [
            {
                "title": item["seed"].title,
                "days_since_activity": item["days_since_activity"],
                "visits": item["visits"],
            }
            for item in scored_seeds
            if item["days_since_activity"] >= REVISIT_DAYS and item["visits"] > 0
        ][:3]

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

        # Health score (improved with decay awareness)
        avg_relevance = sum(item["relevance"] for item in scored_seeds) / max(len(scored_seeds), 1)
        health = min(100, int(
            (len(recent) * 10) +
            (len(trending) * 5) +
            (avg_relevance * 20) -
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
            parts.append("\n⏳ Stale (low relevance, needs attention):")
            for s in stale:
                parts.append(f"  • {s['title']} (relevance: {s['relevance']}, {s['age_days']}d old)")

        if needs_revisit:
            parts.append(f"\n🔄 Needs revisiting (not viewed in {REVISIT_DAYS}+ days):")
            for r in needs_revisit:
                parts.append(f"  • {r['title']} ({r['days_since_activity']}d since last visit, {r['visits']} views)")

        if recent:
            parts.append(f"\n🌱 {len(recent)} seeds added this week")

        if stale:
            parts.append(f"\n💡 Suggested: Review \"{stale[0]['title']}\" — relevance is {stale[0]['relevance']} after {stale[0]['age_days']} days.")

        return json.dumps({
            "status": "ok",
            "total_seeds": len(all_seeds),
            "health_score": health,
            "trending": trending,
            "stale": stale,
            "needs_revisit": needs_revisit,
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

async def garden_skimmer(args: dict, user: User, db: Session) -> str:
    """Run sub-agent garden analysis. Discovers patterns, gaps, trends, quality issues."""
    from app.weaviate_client import weaviate_client
    tenant_id = str(user.tenant_id)
    agent_type = args.get("agent_type", "all")
    
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    wiki = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
    
    results = {"total_seeds": len(seeds), "wiki_articles": len(wiki)}
    
    try:
        # Pattern analysis
        if agent_type in ("all", "pattern"):
            tag_map = {}
            for s in seeds:
                for tag in (s.get("tags", "") or "").split(","):
                    t = tag.strip().lower()
                    if t and t not in ("untitled", "stub", "none", ""):
                        tag_map.setdefault(t, {}).setdefault(s.get("domain", "untagged"), 0)
                        tag_map[t][s.get("domain", "untagged")] += 1
            patterns = [{"tag": t, "domains": {d: c for d, c in domains.items() if c > 0}, "domain_count": len(domains)}
                       for t, domains in tag_map.items() if len(domains) > 1]
            patterns.sort(key=lambda x: x["domain_count"], reverse=True)
            results["patterns"] = patterns[:8]
            if patterns:
                _create_insight_seed(
                    f"Pattern: \"{patterns[0]['tag']}\" spans {patterns[0]['domain_count']} domains",
                    f"Found {len(patterns)} cross-domain tag patterns\\n\\n" +
                    "\\n".join(f"- **{p['tag']}** connects {', '.join(p['domains'].keys())}" for p in patterns[:5]),
                    "agent-insight, pattern, " + patterns[0]["tag"], tenant_id)
    
        # Gap analysis
        if agent_type in ("all", "gap"):
            from collections import Counter
            domain_counts = Counter(s.get("domain", "") for s in seeds if s.get("domain") not in ("", "None", "General", "untagged"))
            wiki_domains = set((a.get("category", "") or "").lower() for a in wiki)
            gaps = [{"domain": d, "count": c} for d, c in domain_counts.most_common()
                    if d.lower() not in wiki_domains and c >= 3]
            results["gaps"] = gaps[:10]
            if gaps:
                _create_insight_seed(f"Gaps: {len(gaps)} domains missing wiki coverage",
                    f"Found {len(gaps)} domains with seeds but no wiki article:\\n\\n" +
                    "\\n".join(f"- **{g['domain']}**: {g['count']} seeds" for g in gaps[:10]),
                    "agent-insight, knowledge-gap", tenant_id)
        
        # Trend analysis
        if agent_type in ("all", "trend"):
            from collections import Counter
            all_tags = []
            for s in seeds:
                if s.get("tags"):
                    all_tags.extend(t.strip() for t in s["tags"].split(",") if t.strip() and t.strip().lower() not in ("untitled", "stub"))
            tag_counts = Counter(all_tags)
            domain_counts = Counter(s.get("domain", "") for s in seeds)
            results["top_tags"] = dict(tag_counts.most_common(8))
            results["top_domains"] = {k: v for k, v in domain_counts.most_common(8) if k}
            if tag_counts:
                top = tag_counts.most_common(1)[0]
                _create_insight_seed(f"Trends: '{top[0]}' is top tag ({top[1]} mentions)",
                    f"Garden has {len(seeds)} seeds across {len(domain_counts)} domains\\n\\n" +
                    "Top tags: " + ", ".join(f"{t}({c})" for t, c in tag_counts.most_common(5)),
                    "agent-insight, trends, analytics", tenant_id)
        
        # Quality analysis
        if agent_type in ("all", "quality"):
            issues = {"untitled": 0, "no-tags": 0, "low-content": 0, "no-domain": 0}
            for s in seeds:
                t = (s.get("title") or "").strip()
                if t.lower() in ("untitled", ""): issues["untitled"] += 1
                tags = s.get("tags") or ""
                if not tags or tags.strip() in ("", "untitled", "stub"): issues["no-tags"] += 1
                if len((s.get("content") or "").strip()) < 50: issues["low-content"] += 1
                if not s.get("domain"): issues["no-domain"] += 1
            total = sum(issues.values())
            results["quality_issues"] = {k: v for k, v in issues.items() if v > 0}
            if total > 0:
                _create_insight_seed(f"Quality: {total} issues across {len(seeds)} seeds",
                    f"Found {total} quality issues:\\n\\n" +
                    "\\n".join(f"- **{k.replace('-', ' ').title()}**: {v}" for k, v in results["quality_issues"].items()),
                    "agent-insight, quality-audit", tenant_id)
        
        summary_parts = []
        if "patterns" in results: summary_parts.append(f"Found {len(results['patterns'])} cross-domain patterns")
        if "gaps" in results: summary_parts.append(f"Found {len(results['gaps'])} knowledge gaps")
        if "quality_issues" in results: total_q = sum(results["quality_issues"].values()); summary_parts.append(f"{total_q} quality issues found")
        
        return json.dumps({
            "status": "success",
            "insights": results,
            "summary": "; ".join(summary_parts) if summary_parts else "Analysis complete, no significant findings",
            "saved_as_seeds": True,
            "message": "Insights saved to your Garden with 'agent-insight' tag"
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


def _create_insight_seed(title, content, tags, tenant_id):
    """Save insight as a seed"""
    import urllib.request
    seed = {
        "class": "IdeaSeed",
        "properties": {
            "title": title, "content": content, "tags": tags,
            "domain": "agent-insight", "status": "Planted", "tenant_id": tenant_id
        }
    }
    try:
        req = urllib.request.Request(
            "http://weaviate:8080/v1/objects",
            data=json.dumps(seed).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            pass
    except:
        pass

TOOL_HANDLERS["garden_skimmer"] = garden_skimmer


async def auto_compile_for_domain(domain: str, tenant_id: str, user_id: str):
    """Auto-compile a wiki article using full LLM synthesis + BFL image pipeline"""
    from app.wiki import synthesize_with_llm, WIKI_SYSTEM_PROMPT, build_wiki_user_prompt
    from app.ingest import generate_concept_image
    import asyncio, re, urllib.request
    
    # Check if domain already has a wiki article
    existing_articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
    existing = [a for a in existing_articles 
                if a.get("category", "").lower() == domain.lower() 
                or domain.lower() in (a.get("title", "") or "").lower()]
    
    get_seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    get_links = weaviate_client.get_links(tenant_id=tenant_id, limit=200)
    domain_seeds = [s for s in get_seeds if (s.get("domain") or "").lower() == domain.lower()]
    domain_links = [l for l in get_links if (l.get("domain") or "").lower() == domain.lower()]

    # Also gather seeds/links from similar categories (e.g., ai-ml, AI/ML)
    domain_normalized = domain.lower().replace("-", "").replace("/", "").replace("_", "")
    for s in get_seeds:
        s_dom = (s.get("domain") or "").lower().replace("-", "").replace("/", "").replace("_", "")
        if s_dom == domain_normalized and s not in domain_seeds:
            domain_seeds.append(s)
    for l in get_links:
        l_dom = (l.get("domain") or "").lower().replace("-", "").replace("/", "").replace("_", "")
        if l_dom == domain_normalized and l not in domain_links:
            domain_links.append(l)

    if not domain_seeds and not domain_links:
        return None
    
    # Prepare content for LLM synthesis
    links_data = [{"title": l.get("title",""), "url": l.get("url",""), 
                   "summary": l.get("summary",""), "domain": l.get("domain",""),
                   "tags": l.get("tags","")} for l in domain_links[:8]]
    seeds_data = [{"title": s.get("title",""), "content": (s.get("content") or "")[:400],
                   "tags": s.get("tags","")} for s in domain_seeds[:10]]
    
    links_content, seeds_content = "", ""
    for l in links_data:
        links_content += f"## {l['title']}\nURL: {l['url']}\nSummary: {l['summary']}\n\n"
    for s in seeds_data:
        seeds_content += f"## {s['title']}\nContent: {s['content']}\n\n"
    
    title = f"{domain.title()} — Key Insights"
    user_prompt = build_wiki_user_prompt(title, domain, links_content, seeds_content)
    article_content = await synthesize_with_llm(WIKI_SYSTEM_PROMPT, user_prompt)
    
    if not article_content:
        # Fallback content
        article_content = f"# {title}\n\n"
        article_content += f"**{domain.title()}** encompasses {len(domain_seeds)} ideas and {len(domain_links)} sources.\n\n"
        for i, s in enumerate(domain_seeds[:5], 1):
            article_content += f"### {i}. {s.get('title','')}\n{(s.get('content') or '')[:200]}\n\n"
    
    # Save seed and link IDs
    seed_ids = ",".join(s.get('id', '') for s in domain_seeds[:10] if s.get('id'))
    link_ids = ",".join(l.get('id', '') for l in domain_links[:5] if l.get('id'))
    
    try:
        if existing:
            # Update existing article with new content
            article = existing[0]
            article_id = article.get('id', '')
            # Merge or replace content intelligently
            existing_content = article.get('content', '') or ''
            # If new content is significantly longer/better, replace; otherwise append
            if len(article_content) > len(existing_content) * 1.5:
                merged_content = article_content
            else:
                merged_content = existing_content + "\n\n---\n\n" + article_content
            
            weaviate_client.client.data_object.update(
                data_object={
                    "content": merged_content,
                    "source_seed_ids": seed_ids,
                    "source_link_ids": link_ids,
                    "summary": f"Updated: {len(domain_seeds)} seeds, {len(domain_links)} sources",
                },
                class_name="WikiArticle",
                uuid=article_id,
            )
        else:
            article_id = weaviate_client.add_wiki_article(
                tenant_id=tenant_id,
                user_id=user_id,
                title=title,
                category=domain,
                summary=f"LLM-synthesized article from {len(domain_seeds)} seeds and {len(domain_links)} sources",
                content=article_content,
                source_seed_ids=seed_ids,
                source_link_ids=link_ids,
                status="published",
            )
        
        # Generate BFL hero image
        try:
            await asyncio.sleep(1)  # Small delay
            image_url = await generate_concept_image(title, [domain])
            if image_url:
                # Download and save locally
                safe_title = re.sub(r'[^a-zA-Z0-9]', '_', title)[:35]
                filename = f'{safe_title}_{article_id[:8]}.jpeg'
                local_path = f'/app/public/wiki-images/{filename}'
                req = urllib.request.Request(image_url)
                req.add_header('User-Agent', 'Mozilla/5.0')
                with urllib.request.urlopen(req, timeout=30) as r:
                    img_data = r.read()
                import os
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                with open(local_path, 'wb') as f:
                    f.write(img_data)
                permanent_url = f"https://api.greenplot.ink/api/v1/wiki/images/{filename}"
                weaviate_client.client.data_object.update(
                    data_object={"imageUrl": permanent_url},
                    class_name="WikiArticle",
                    uuid=article_id,
                )
        except Exception as e:
            pass  # Image gen is optional
        
        return {"article_id": article_id, "title": title, "seeds": len(domain_seeds), 
                "links": len(domain_links), "image_generated": True}
    except Exception as e:
        return None


async def wiki_lint(args: dict, user: User, db: Session) -> str:
    """Run wiki lint analysis — check stale content, orphans, gaps. Auto-creates articles for gaps."""
    from app.wiki_lint import lint_articles, generate_lint_report
    tenant_id = str(user.tenant_id)
    user_id = str(user.id)
    articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=100)
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id=tenant_id, limit=500)
    results = lint_articles(articles, seeds)
    report = generate_lint_report(results)
    
    # Auto-compile wiki articles for top knowledge gaps
    auto_created = []
    for gap in results["knowledge_gaps"][:2]:  # Top 2 gaps
        # Use the existing wiki compile endpoint
        try:
            await auto_compile_for_domain(gap["domain"], tenant_id, user_id)
            auto_created.append(gap["domain"])
        except:
            pass
    
    return json.dumps({"status": "success", "total_issues": results["total_issues"],
                       "stale": len(results["stale_articles"]),
                       "orphans": len(results["orphan_articles"]),
                       "gaps": len(results["knowledge_gaps"]),
                       "gap_details": results["knowledge_gaps"],
                       "quality_issues": len(results["quality_issues"]),
                       "auto_created_articles": auto_created,
                       "report_preview": report[:500]})

TOOL_HANDLERS["wiki_lint"] = wiki_lint

# ── Wiki Search ──────────────────────────────────────────────
async def search_wiki(args: dict, user: User, db: Session) -> str:
    """Search wiki articles via Weaviate vector search (semantic similarity)."""
    import json, logging
    log = logging.getLogger(__name__)
    log.info(f"[search_wiki] Called with args: {args}")

    query = args.get('query', '')
    limit = args.get('limit', 3)

    if not query.strip():
        return json.dumps({'status': 'error', 'message': 'Query is required.'})

    tenant_id = str(user.tenant_id)

    try:
        # Primary: vector search over WikiArticle class
        from app.enricher import embed_text
        embedding = embed_text(query)
        articles = weaviate_client.search_wiki_articles(
            tenant_id=tenant_id,
            embedding=embedding,
            limit=limit,
        )
        if articles:
            results = []
            for a in articles:
                results.append({
                    'title': a.get('title', ''),
                    'summary': a.get('summary', ''),
                    'content': (a.get('content') or '')[:3000],
                    'category': a.get('category', ''),
                    'score': round(a.get('_additional', {}).get('certainty', 0.5), 3),
                })
            log.info(f"[search_wiki] Weaviate returned {len(results)} results")
            return json.dumps({'status': 'ok', 'results': results, 'count': len(results)})
    except Exception as e:
        log.warning(f"[search_wiki] Weaviate vector search failed: {e}, falling back to keyword search")

    # Fallback: keyword search over WikiArticle title+summary from Weaviate
    try:
        import re
        all_articles = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=50)
        if not all_articles:
            return json.dumps({'status': 'empty', 'message': 'No wiki articles found.'})

        query_terms = [w for w in re.split(r'\W+', query.lower()) if len(w) > 2]
        results = []
        for a in all_articles:
            title = a.get('title', '')
            summary = a.get('summary', '')
            content_preview = (a.get('content') or '')[:500]
            text = f"{title} {summary} {content_preview}".lower()
            matches = sum(1 for t in query_terms if t in text)
            score = matches / len(query_terms) if query_terms else 0
            if score > 0:
                results.append({
                    'title': title,
                    'summary': summary,
                    'content': (a.get('content') or '')[:3000],
                    'category': a.get('category', ''),
                    'score': round(score, 3),
                })
        results.sort(key=lambda x: x['score'], reverse=True)
        log.info(f"[search_wiki] Keyword fallback returned {len(results[:limit])} results")
        return json.dumps({'status': 'ok', 'results': results[:limit], 'count': len(results[:limit])})
    except Exception as e:
        return json.dumps({'status': 'error', 'message': str(e)})

TOOL_HANDLERS["search_wiki"] = search_wiki
