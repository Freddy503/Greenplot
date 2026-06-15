"""
Tool execution handlers for the chat endpoint.
Each tool is async and returns a JSON-serializable result.
"""
import json
import logging
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from app.models import User, Seed, Thought
from app.config import settings
from app.weaviate_client import weaviate_client
from datetime import datetime

# Module-level logger (previously referenced as `logger`/`log` without being defined,
# which raised NameError in error paths and hid the real failures).
logger = logging.getLogger(__name__)
log = logger

# Strong references to fire-and-forget background tasks so the event loop's
# weak references don't let the GC drop them mid-flight (e.g. wiki auto-compile).
_BG_TASKS: set = set()


def _rrf_merge(
    vector_hits: list,
    bm25_hits: list,
    k: int = 60,
    limit: int = 5,
    centrality: dict | None = None,
) -> list:
    """
    Reciprocal Rank Fusion: merge vector, BM25, and graph centrality signals.

    RRF score = 1/(k+rank_vector) + 1/(k+rank_bm25) + centrality_boost
    centrality: dict mapping seed title (lower) → normalised inbound-link score (0-1).
    """
    scores: dict[str, float] = {}
    items: dict[str, dict] = {}

    def key(hit: dict) -> str:
        return (hit.get("title") or "").strip().lower()

    for rank, hit in enumerate(vector_hits):
        k_ = key(hit)
        if not k_:
            continue
        scores[k_] = scores.get(k_, 0.0) + 1.0 / (k + rank + 1)
        items[k_] = hit

    for rank, hit in enumerate(bm25_hits):
        k_ = key(hit)
        if not k_:
            continue
        scores[k_] = scores.get(k_, 0.0) + 1.0 / (k + rank + 1)
        if k_ not in items:
            items[k_] = hit

    # Centrality boost: highly-linked seeds get a small additive signal
    if centrality:
        for k_, boost in centrality.items():
            if k_ in scores:
                scores[k_] += boost * 0.1  # weight kept small vs. semantic signal

    ranked = sorted(scores.keys(), key=lambda k_: scores[k_], reverse=True)
    return [items[k_] for k_ in ranked[:limit]]


async def search_seeds(args: dict, user: User, db: Session) -> str:
    """Hybrid search over user's seeds: vector + BM25 + graph centrality via RRF."""
    query = args["query"]
    limit = args.get("limit", 5)
    try:
        from app.enricher_v2 import embed_text
        from app.models import SeedLink, Seed as SeedModel
        from sqlalchemy import func as _func

        embedding = embed_text(query)
        vector_hits = weaviate_client.search_seeds(
            tenant_id=str(user.tenant_id),
            embedding=embedding,
            limit=limit * 2,
        )
        bm25_hits = weaviate_client.search_seeds_bm25(
            tenant_id=str(user.tenant_id),
            query=query,
            limit=limit * 2,
        )

        # Build graph centrality map: inbound link count per seed title (normalised 0-1)
        centrality: dict = {}
        try:
            rows = (
                db.query(SeedModel.title, _func.count(SeedLink.id).label("cnt"))
                .join(SeedLink, SeedLink.target_seed_id == SeedModel.id)
                .filter(SeedModel.tenant_id == user.tenant_id)
                .group_by(SeedModel.title)
                .all()
            )
            if rows:
                max_cnt = max(r.cnt for r in rows) or 1
                centrality = {r.title.strip().lower(): r.cnt / max_cnt for r in rows}
        except Exception:
            pass

        merged = _rrf_merge(vector_hits, bm25_hits, limit=limit, centrality=centrality)
        # If BM25 unavailable, merged == vector_hits[:limit]

        results = []
        for hit in merged:
            entry = {
                "title": hit.get("title") or "Untitled",
                "content": (hit.get("content") or "")[:400],
                "created_at": hit.get("created_at") or "",
            }
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
                except Exception:
                    pass
            if hit.get("url"):
                entry["source"] = hit["url"]
            results.append(entry)

        if not results:
            return json.dumps({"status": "empty", "message": "No matching seeds found."})
        return json.dumps({"status": "ok", "results": results})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


_GENERIC_TITLES = {
    'untitled', 'seed', 'note', 'idea', 'thought', 'insight',
    'observation', 'summary', 'draft', 'test', 'new seed',
}

async def create_seed(args: dict, user: User, db: Session) -> str:
    """Create a new seed in the user's Second Brain."""
    title = args["title"]
    content = args["content"]
    tags = args.get("tags", [])
    try:
        # Quality gate: reject empty, too-short, or generic seeds
        if not title or len(title.strip()) < 5:
            return json.dumps({"status": "error", "message": "Seed title too short — add a meaningful title (5+ characters)."})
        if not content or len(content.strip()) < 40:
            return json.dumps({"status": "error", "message": "Seed content too brief — add more detail (40+ characters)."})
        if title.lower().strip() in _GENERIC_TITLES:
            return json.dumps({"status": "error", "message": f"Title '{title}' is too generic — be more specific."})

        # Dedup: return existing seed if title already exists for this user
        existing = db.query(Seed).filter(
            Seed.user_id == user.id,
            sa_func.lower(sa_func.trim(Seed.title)) == title.lower().strip()
        ).first()
        if existing:
            return json.dumps({
                "status": "ok",
                "seed_id": str(existing.id),
                "title": title,
                "message": f"Seed '{title}' already exists — skipped duplicate.",
            })

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
            from app.enricher_v2 import embed_text
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

        # Trigger wiki compile for the seed's tags (best-effort, background).
        # auto_compile_for_domain is defined in this same module — no import needed.
        # We keep a strong reference in _BG_TASKS so the GC can't drop the task
        # mid-flight (the previous fire-and-forget create_task was being collected).
        try:
            import asyncio as _asyncio
            _NOISE = {"general", "idea", "note", "misc", "todo", "untitled", "untagged", "none", "prd", "spec", "agent-output"}
            _domains = [t.lower().strip() for t in tags if t.strip().lower() not in _NOISE][:3]
            for _d in _domains:
                _t = _asyncio.create_task(auto_compile_for_domain(
                    domain=_d,
                    tenant_id=str(user.tenant_id),
                    user_id=str(user.id),
                    skip_image=True,  # inline path: skip slow image gen for responsiveness
                ))
                _BG_TASKS.add(_t)
                _t.add_done_callback(_BG_TASKS.discard)
        except Exception as _ce:
            logger.debug(f"Wiki compile trigger skipped: {_ce}")

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
        from app.enricher_v2 import embed_text
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


async def visualize_garden(args: dict, user: User, db: Session) -> str:
    """
    Return garden graph data for visualization in chat.
    Queries seeds from Postgres and builds a node/edge structure.
    """
    limit = min(args.get("limit", 40), 80)
    from datetime import timedelta
    try:
        seeds = db.query(Seed).filter(
            Seed.tenant_id == user.tenant_id
        ).order_by(Seed.created_at.desc()).limit(limit).all()

        if not seeds:
            return json.dumps({"type": "garden_visualization", "status": "empty",
                               "message": "No seeds in your garden yet."})

        # Build node list
        nodes = []
        domain_counts: dict = {}
        for s in seeds:
            meta = s.seed_metadata or {}
            domain = meta.get("domain", "") or ""
            energy = meta.get("energy", "MEDIUM") or "MEDIUM"
            tags_raw = meta.get("tags", "") or ""
            tags = tags_raw if isinstance(tags_raw, list) else [t.strip() for t in tags_raw.split(",") if t.strip()]
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
            nodes.append({
                "id": str(s.id),
                "title": s.title or "Untitled",
                "domain": domain,
                "energy": energy,
                "tags": tags[:3],
                "created_at": s.created_at.isoformat() if s.created_at else "",
                "connections": 0,  # filled below
            })

        # Build edges via shared domain/tags (lightweight — no Weaviate call needed)
        node_map = {n["id"]: n for n in nodes}
        links = []
        seen_pairs: set = set()
        for i, a in enumerate(nodes):
            for b in nodes[i+1:]:
                if a["domain"] and a["domain"] == b["domain"]:
                    pair = tuple(sorted([a["id"], b["id"]]))
                    if pair not in seen_pairs:
                        seen_pairs.add(pair)
                        links.append({"source": a["id"], "target": b["id"], "strength": 0.6})
                        node_map[a["id"]]["connections"] += 1
                        node_map[b["id"]]["connections"] += 1
                # Shared tag
                if set(a["tags"]) & set(b["tags"]):
                    pair = tuple(sorted([a["id"], b["id"]]))
                    if pair not in seen_pairs:
                        seen_pairs.add(pair)
                        links.append({"source": a["id"], "target": b["id"], "strength": 0.4})
                        node_map[a["id"]]["connections"] += 1
                        node_map[b["id"]]["connections"] += 1

        # Cap edges for performance
        links = sorted(links, key=lambda l: l["strength"], reverse=True)[:120]

        stats = {
            "total_seeds": len(seeds),
            "domains": sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)[:5],
            "connected_seeds": sum(1 for n in nodes if n["connections"] > 0),
        }

        return json.dumps({
            "type": "garden_visualization",
            "status": "ok",
            "nodes": nodes,
            "links": links,
            "stats": stats,
        })
    except Exception as e:
        return json.dumps({"type": "garden_visualization", "status": "error", "message": str(e)})


# Tool dispatch map
TOOL_HANDLERS = {
    "search_seeds": search_seeds,
    "create_seed": create_seed,
    "get_daily_briefing": get_daily_briefing,
    "list_recent_seeds": list_recent_seeds,
    "visualize_garden": visualize_garden,
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

            # Ingest log
            try:
                from app.ingest_log import append_log_entry
                append_log_entry(
                    tenant_id=str(user.tenant_id),
                    action="web_search",
                    source="exa",
                    summary=f'"{query}" → {len(results)} results',
                )
            except Exception:
                pass

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
            from app.enricher_v2 import embed_text
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


async def get_calendar_events(args: dict, user: User, db: Session) -> str:
    """Fetch upcoming Google Calendar events for the user."""
    import httpx
    from app.models import CalendarConnection
    from app.calendar_helper import get_fresh_token, GOOGLE_CALENDAR_API
    from datetime import datetime, timedelta

    conn = db.query(CalendarConnection).filter(
        CalendarConnection.user_id == user.id,
        CalendarConnection.enabled == True,
    ).first()
    if not conn:
        return json.dumps({"status": "error", "message": "No Google Calendar connected."})

    token = get_fresh_token(conn, db)
    if not token:
        return json.dumps({"status": "error", "message": "Calendar token expired — reconnect in Settings."})

    hours = int(args.get("hours", 24))
    now = datetime.utcnow()
    params = {
        "timeMin": now.isoformat() + "Z",
        "timeMax": (now + timedelta(hours=hours)).isoformat() + "Z",
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": args.get("max_results", 10),
    }
    try:
        resp = httpx.get(
            f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=10,
        )
        if resp.status_code != 200:
            return json.dumps({"status": "error", "message": f"Google Calendar error {resp.status_code}"})
        events = []
        for item in resp.json().get("items", []):
            start = item.get("start", {})
            events.append({
                "summary": item.get("summary", "(No title)"),
                "start": start.get("dateTime", start.get("date", "")),
                "end": item.get("end", {}).get("dateTime", ""),
                "location": item.get("location", ""),
            })
        return json.dumps({"events": events, "timezone": conn.calendar_timezone, "count": len(events)})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["get_calendar_events"] = get_calendar_events


async def create_calendar_event(args: dict, user: User, db: Session) -> str:
    """Create a Google Calendar event on behalf of the user."""
    import httpx
    from app.models import CalendarConnection
    from app.calendar_helper import get_fresh_token, GOOGLE_CALENDAR_API

    conn = db.query(CalendarConnection).filter(
        CalendarConnection.user_id == user.id,
        CalendarConnection.enabled == True,
    ).first()
    if not conn:
        return json.dumps({"status": "error", "message": "No Google Calendar connected. Ask the user to connect it in Settings."})

    token = get_fresh_token(conn, db)
    if not token:
        return json.dumps({"status": "error", "message": "Calendar token expired — user needs to reconnect Google Calendar in Settings."})

    tz = conn.calendar_timezone or "UTC"

    from datetime import datetime as _datetime, timedelta as _timedelta

    def _dt(iso: str) -> dict:
        return {"dateTime": iso if "T" in iso else f"{iso}T00:00:00", "timeZone": tz}

    def _default_end(start_iso: str) -> str:
        """Default end_time = start + 1 hour."""
        try:
            fmt = "%Y-%m-%dT%H:%M:%SZ" if start_iso.endswith("Z") else "%Y-%m-%dT%H:%M:%S"
            dt = _datetime.strptime(start_iso.rstrip("Z").split("+")[0], "%Y-%m-%dT%H:%M:%S")
            return (dt + _timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%S")
        except Exception:
            return start_iso

    start_iso = args["start_time"]
    end_iso = args.get("end_time") or _default_end(start_iso)

    event_body: dict = {
        "summary": args.get("summary", "New Event"),
        "start": _dt(start_iso),
        "end": _dt(end_iso),
    }
    if args.get("description"):
        event_body["description"] = args["description"]
    if args.get("location"):
        event_body["location"] = args["location"]

    try:
        resp = httpx.post(
            f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=event_body,
            timeout=10,
        )
        if resp.status_code == 403:
            return json.dumps({"status": "error", "message": "Permission denied by Google Calendar (403). The connected account does not have write access. Tell the user to disconnect and reconnect Google Calendar in Settings to grant calendar write permissions."})
        if resp.status_code not in (200, 201):
            return json.dumps({"status": "error", "message": f"Google Calendar returned {resp.status_code}: {resp.text[:200]}"})
        created = resp.json()
        return json.dumps({
            "status": "created",
            "summary": created.get("summary"),
            "start": created.get("start", {}).get("dateTime"),
            "end": created.get("end", {}).get("dateTime"),
            "link": created.get("htmlLink"),
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["create_calendar_event"] = create_calendar_event


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


async def auto_compile_for_domain(domain: str, tenant_id: str, user_id: str, skip_image: bool = False):
    """Auto-compile a wiki article using full LLM synthesis.

    skip_image: when True, skip the (slow) hero-image generation — used by the
    inline create_seed trigger so the Library populates fast; the cron path
    still generates images.
    """
    from app.wiki import synthesize_with_llm, WIKI_SYSTEM_PROMPT, build_wiki_user_prompt
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

    # Postgres fallback: if Weaviate returned nothing for this domain, check by tag
    if not domain_seeds:
        try:
            from app.database import get_db
            from app.models import Seed as SeedModel
            import uuid as _uuid
            db = next(get_db())
            pg_seeds = db.query(SeedModel).filter(
                SeedModel.tenant_id == _uuid.UUID(tenant_id)
            ).order_by(SeedModel.created_at.desc()).limit(500).all()
            db.close()
            for s in pg_seeds:
                meta = s.seed_metadata or {}
                tags_raw = meta.get("tags", "")
                tags_str = ", ".join(tags_raw) if isinstance(tags_raw, list) else (tags_raw or "")
                seed_domain = (meta.get("domain", "") or "").strip().lower()
                # Match by domain OR by tag containing the domain keyword
                tag_list = [t.strip().lower() for t in tags_str.split(",") if t.strip()]
                if seed_domain == domain.lower() or domain.lower() in tag_list:
                    domain_seeds.append({
                        "id": str(s.id),
                        "title": s.title or "",
                        "content": s.content or "",
                        "domain": seed_domain or domain,
                        "tags": tags_str,
                    })
        except Exception as e:
            log.warning(f"auto_compile_for_domain postgres fallback failed: {e}")

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
    
    # Generate a meaningful title from the domain + seed content rather than generic "Key Insights"
    title_hint = domain_seeds[0].get("title", "") if domain_seeds else ""
    title_prompt = f"""Given these seed titles about the domain "{domain}":
{chr(10).join(s.get('title','') for s in domain_seeds[:5] if s.get('title'))}

Write ONE short wiki article title (5-8 words max) that captures the core concept.
Do NOT use "Key Insights", "Overview" or generic phrases. Be specific and sharp.
Reply with just the title, no quotes, no explanation."""
    from app.briefings import _call_llm
    generated_title = _call_llm(title_prompt, max_tokens=30)
    # Clean up: strip quotes, newlines; fall back to the strongest seed title
    # before resorting to the (often too-generic) domain name
    import re as _re
    generated_title = _re.sub(r'["\'\n]', '', generated_title or '').strip()
    if not generated_title or len(generated_title) < 5 or len(generated_title) > 80:
        if title_hint and 5 <= len(title_hint.strip()) <= 80:
            generated_title = title_hint.strip()
        else:
            generated_title = domain.replace('-', ' ').replace('_', ' ').title()
    title = generated_title

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
        
        # Hero-image generation removed (BFL retired)
        
        return {"article_id": article_id, "title": title, "seeds": len(domain_seeds),
                "links": len(domain_links), "image_generated": False}
    except Exception as e:
        # Previously this swallowed the error and returned None with no log line —
        # the single biggest reason wiki failures were invisible across rounds.
        log.exception(f"auto_compile_for_domain failed for domain '{domain}' "
                      f"(tenant={tenant_id}): {e}")
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
        from app.enricher_v2 import embed_text
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


async def save_link(args: dict, user: User, db: Session) -> str:
    """Save a URL to the user's Sources library."""
    import httpx
    from urllib.parse import urlparse

    url = args.get("url", "").strip()
    if not url:
        return json.dumps({"status": "error", "message": "URL is required"})
    if not url.startswith("http"):
        url = f"https://{url}"

    tenant_id = str(user.tenant_id)

    # Dedup: check if URL already exists
    try:
        existing = weaviate_client.get_links(tenant_id=tenant_id, limit=500)
        for l in existing:
            if l.get("url", "") == url:
                return json.dumps({"status": "exists", "message": f"Already in Sources: {l.get('title', url)}", "id": l.get("id", "")})
    except Exception:
        pass

    try:
        domain = urlparse(url).netloc.replace("www.", "")
    except Exception:
        domain = "unknown"

    # Fetch page metadata
    title = args.get("title", "") or domain
    summary = args.get("summary", "")
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            resp = await client.get(url, headers={"User-Agent": "Seedify Bot/1.0"})
            if resp.status_code == 200:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, "html.parser")
                if not args.get("title"):
                    t = soup.find("title")
                    if t and t.string:
                        title = t.string.strip()[:200]
                if not summary:
                    desc = soup.find("meta", attrs={"name": "description"})
                    if desc:
                        summary = desc.get("content", "")[:500]
                    if not summary:
                        og = soup.find("meta", property="og:description")
                        if og:
                            summary = og.get("content", "")[:500]
    except Exception:
        pass

    try:
        link_id = weaviate_client.add_link(
            tenant_id=tenant_id,
            user_id=str(user.id),
            url=url,
            title=title or domain,
            summary=summary,
            domain=domain,
            tags=args.get("tags", "chat-saved"),
            favicon=f"https://www.google.com/s2/favicons?domain={domain}&sz=32",
            og_image="",
            raw_text=summary,
            status="enriched" if summary else "pending",
            starred=False,
        )
        try:
            from app.activity import log_source_found
            log_source_found(tenant_id, title, url, "chat_save_link")
        except Exception:
            pass
        return json.dumps({"status": "ok", "message": f"Saved to Sources: {title}", "id": link_id, "url": url, "title": title})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["save_link"] = save_link



async def create_wiki_article(args: dict, user: User, db: Session) -> str:
    """Create a wiki article from chat content."""
    import httpx

    title = args.get("title", "").strip()
    topic = args.get("topic", "").strip()
    content = args.get("content", "").strip()

    if not title and not topic:
        return json.dumps({"status": "error", "message": "title or topic is required"})

    title = title or topic
    if not content:
        content = f"Overview of {title}"

    if len(content) < 50:
        content = content + f"\n\nThis article covers {title} as captured from a chat conversation."

    openrouter_key = getattr(settings, "OPENROUTER_API_KEY", None)
    if not openrouter_key:
        return json.dumps({"status": "error", "message": "LLM not configured"})

    wiki_model = settings.WIKI_MODEL
    article_content = content

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {openrouter_key}", "Content-Type": "application/json"},
                json={
                    "model": wiki_model,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "Turn this raw text into a well-structured wiki article in Wikipedia format. "
                                "Structure:\n1. # Title\n2. Lead paragraph (2-4 sentences)\n"
                                "3. ## Sections with ### subsections\n4. ## See Also with [[wikilinks]]\n"
                                "Keep all substantive content. Use encyclopedic tone."
                            ),
                        },
                        {"role": "user", "content": f"Title: {title}\n\n{content}"},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 2000,
                },
            )
            if resp.status_code == 200:
                llm_out = resp.json()["choices"][0]["message"]["content"]
                if llm_out and len(llm_out) > 50:
                    article_content = llm_out
    except Exception:
        pass

    # Store in Weaviate
    try:
        lines = article_content.split("\n")
        summary_lines = []
        for line in lines:
            if line.strip() and not line.startswith("#"):
                summary_lines.append(line.strip())
                if len(" ".join(summary_lines)) > 200:
                    break
        summary = " ".join(summary_lines)[:300]

        article_id = weaviate_client.add_wiki_article(
            tenant_id=str(user.tenant_id),
            user_id=str(user.id),
            title=title,
            category="Chat",
            summary=summary,
            content=article_content,
            source_seed_ids="",
            source_link_ids="",
            backlinks="",
            status="published",
        )
        return json.dumps({
            "status": "ok",
            "message": f"Wiki article '{title}' created successfully.",
            "id": article_id,
            "title": title,
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["create_wiki_article"] = create_wiki_article


# ─────────────────────────────────────────────────────────────────────────────
# Thinking Partner Tools (Phase 3C)
# ─────────────────────────────────────────────────────────────────────────────

async def develop_idea(args: dict, user: User, db: Session) -> str:
    """
    Transform a raw idea or seed into a structured spec using gstack forcing questions.
    Creates a Spec seed with full YAML frontmatter when complete.
    """
    import httpx as _httpx

    idea_text = args.get("idea") or ""
    seed_id = args.get("seed_id") or ""
    phase = args.get("phase", "interrogate")  # interrogate | finalize

    # Load seed content if seed_id provided
    if seed_id and not idea_text:
        try:
            seed_obj = db.query(Seed).filter(
                Seed.id == seed_id,
                Seed.tenant_id == user.tenant_id
            ).first()
            if seed_obj:
                idea_text = f"{seed_obj.title}\n\n{seed_obj.content}"
        except Exception:
            pass

    if not idea_text:
        return json.dumps({"status": "error", "message": "Provide either idea text or a valid seed_id."})

    try:
        system = (
            "You are a rigorous product strategist using gstack's spec methodology. "
            "Your role is to interrogate vague ideas until they become executable specs. "
            "Never accept hand-wavy answers. Push for specifics.\n\n"
            "## Forcing Questions Framework\n"
            "1. **Demand reality**: Who DESPERATELY needs this today? Name them specifically.\n"
            "2. **Status quo**: What do they do instead right now?\n"
            "3. **Desperate specificity**: What is the narrowest possible first use case?\n"
            "4. **Narrowest wedge**: If you had to ship one thing in one week, what is it?\n"
            "5. **Observation**: What have you PERSONALLY observed that makes you believe this?\n"
            "6. **Future-fit**: Why will this be MORE important in 2 years, not less?\n\n"
            "## Spec Output Format (when phase=finalize)\n"
            "Produce YAML frontmatter followed by prose explanation:\n"
            "```yaml\n"
            "who: [specific user or role]\n"
            "current_behavior: [what they do today]\n"
            "desired_behavior: [what they want to do]\n"
            "urgency: [why now]\n"
            "success_criteria: [measurable outcome]\n"
            "scope_in: [explicitly included]\n"
            "scope_out: [explicitly excluded]\n"
            "mvp: [smallest shippable version]\n"
            "failure_modes: [what could go wrong + rollback]\n"
            "```"
        )

        if phase == "interrogate":
            user_msg = (
                f"Here is the raw idea:\n\n{idea_text}\n\n"
                "Apply the 6 forcing questions. Ask them one by one and wait for answers. "
                "Start with question 1 now. Be direct and challenging."
            )
        else:
            user_msg = (
                f"Raw idea:\n\n{idea_text}\n\n"
                "The user has answered the forcing questions. Now produce a complete spec in the YAML format. "
                "After the YAML, add a 1-paragraph 'Implementation Notes' section. "
                "Be specific, not generic."
            )

        resp = _httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": settings.CHAT_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
                "max_tokens": 1200,
                "temperature": 0.4,
            },
            timeout=30,
        )
        spec_text = resp.json()["choices"][0]["message"]["content"]

        if phase == "finalize":
            # Create a Spec seed
            spec_seed = Seed(
                tenant_id=user.tenant_id,
                user_id=user.id,
                title=f"Spec: {idea_text[:60].split(chr(10))[0]}",
                content=spec_text,
                seed_metadata={
                    "seed_type": "spec",
                    "source": "develop_idea",
                    "status": "draft",
                },
                seed_type="spec",
                created_by="agent_synthesis",
                created_via="develop_idea",
                created_at=__import__("datetime").datetime.utcnow(),
            )
            db.add(spec_seed)
            db.commit()
            db.refresh(spec_seed)

            # Dual-voice review (CEO + Engineering lenses in parallel)
            import asyncio
            ceo_review, eng_review = await asyncio.gather(
                _spec_review(spec_text, "CEO", settings),
                _spec_review(spec_text, "Engineering", settings),
            )

            return json.dumps({
                "status": "ok",
                "phase": "finalized",
                "spec": spec_text,
                "spec_seed_id": str(spec_seed.id),
                "reviews": {"ceo": ceo_review, "engineering": eng_review},
                "message": "Spec seed created. Use create_github_issue to file it as a GitHub issue.",
            })
        else:
            return json.dumps({
                "status": "ok",
                "phase": "interrogating",
                "response": spec_text,
                "next_step": "Answer the questions, then call develop_idea again with phase='finalize'.",
            })

    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


async def _spec_review(spec_text: str, lens: str, _settings) -> str:
    """Run a single-lens review of a spec. Returns a short findings string."""
    import httpx as _httpx

    prompts = {
        "CEO": (
            "You are a CEO reviewer. Evaluate this spec from a strategic lens:\n"
            "1. Is the demand real or assumed? 2. Is the scope too broad/narrow?\n"
            "3. What are 2 alternative approaches? 4. What is the biggest assumption?\n"
            "Keep response under 150 words. Be direct."
        ),
        "Engineering": (
            "You are an engineering manager reviewer. Evaluate this spec:\n"
            "1. Is the MVP achievable in 1 week? 2. What are the 2 hardest technical challenges?\n"
            "3. What existing code/patterns can be reused? 4. What edge cases are missing?\n"
            "Keep response under 150 words. Be direct."
        ),
    }
    try:
        resp = _httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {_settings.OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": _settings.CHAT_MODEL,
                "messages": [
                    {"role": "system", "content": prompts.get(lens, "Review this spec concisely.")},
                    {"role": "user", "content": spec_text[:1500]},
                ],
                "max_tokens": 250,
                "temperature": 0.5,
            },
            timeout=20,
        )
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"Review unavailable: {e}"


TOOL_HANDLERS["develop_idea"] = develop_idea


async def captu<RESEND_API_KEY>(args: dict, user: User, db: Session) -> str:
    """Capture a learning or decision from the current session as a learning-type seed."""
    learning = args.get("learning", "")
    confidence = min(10, max(1, int(args.get("confidence", 7))))
    if not learning:
        return json.dumps({"status": "error", "message": "Provide learning text."})
    try:
        seed = Seed(
            tenant_id=user.tenant_id,
            user_id=user.id,
            title=f"Learning: {learning[:60]}",
            content=learning,
            seed_metadata={
                "seed_type": "learning",
                "confidence": confidence,
                "source": "captu<RESEND_API_KEY>",
            },
            seed_type="learning",
            created_by="agent_synthesis",
            created_via="captu<RESEND_API_KEY>",
            created_at=__import__("datetime").datetime.utcnow(),
        )
        db.add(seed)
        db.commit()
        db.refresh(seed)

        # Taste memory signal
        try:
            from app.taste_memory import record as _tm_record
            _tm_record(str(user.tenant_id), "recent_learning", learning[:80], confidence / 10)
        except Exception:
            pass

        return json.dumps({
            "status": "ok",
            "message": f"Learning captured (confidence {confidence}/10).",
            "seed_id": str(seed.id),
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["captu<RESEND_API_KEY>"] = captu<RESEND_API_KEY>


async def create_github_issue(args: dict, user: User, db: Session) -> str:
    """File a GitHub issue from a spec seed. Requires GITHUB_TOKEN in environment."""
    import httpx as _httpx

    title = args.get("title", "")
    body = args.get("body", "")
    seed_id = args.get("seed_id", "")
    repo = args.get("repo", "")  # e.g. "Freddy503/Seedify"

    # Load from spec seed if seed_id provided
    if seed_id and not body:
        try:
            spec_seed = db.query(Seed).filter(
                Seed.id == seed_id,
                Seed.tenant_id == user.tenant_id
            ).first()
            if spec_seed:
                title = title or spec_seed.title
                body = spec_seed.content
        except Exception:
            pass

    if not title or not body:
        return json.dumps({"status": "error", "message": "Provide title and body (or a valid spec seed_id)."})

    token = getattr(settings, "GITHUB_TOKEN", None) or __import__("os").environ.get("GITHUB_TOKEN", "")
    if not token:
        return json.dumps({
            "status": "error",
            "message": "GITHUB_TOKEN not configured. Set GITHUB_TOKEN environment variable.",
        })

    repo = repo or getattr(settings, "GITHUB_REPO", "")
    if not repo or "/" not in repo:
        return json.dumps({
            "status": "error",
            "message": "Provide repo in 'owner/name' format (e.g. 'Freddy503/Seedify').",
        })

    try:
        issue_body = body + "\n\n---\n*Created from Seedify Thinking Partner*"
        resp = _httpx.post(
            f"https://api.github.com/repos/{repo}/issues",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
            },
            json={"title": title, "body": issue_body},
            timeout=15,
        )
        if resp.status_code == 201:
            data = resp.json()
            # Update spec seed metadata with issue URL
            if seed_id:
                try:
                    s = db.query(Seed).filter(Seed.id == seed_id).first()
                    if s:
                        meta = s.seed_metadata or {}
                        meta["github_issue_url"] = data.get("html_url")
                        meta["github_issue_number"] = data.get("number")
                        meta["status"] = "filed"
                        s.seed_metadata = meta
                        db.commit()
                except Exception:
                    pass
            return json.dumps({
                "status": "ok",
                "issue_url": data.get("html_url"),
                "issue_number": data.get("number"),
                "message": f"Issue #{data.get('number')} filed: {data.get('html_url')}",
            })
        else:
            return json.dumps({"status": "error", "message": f"GitHub API error {resp.status_code}: {resp.text[:200]}"})
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["create_github_issue"] = create_github_issue


# ── write_spec: save PRD and compile wiki article ─────────────────────────────

async def write_spec(args: dict, user: User, db: Session) -> str:
    """Save a completed PRD to Studio and immediately compile a Library article."""
    import logging as _logging
    _log = _logging.getLogger(__name__)

    title = (args.get("title") or "").strip()
    content = (args.get("content") or "").strip()
    tags = args.get("tags", ["prd", "spec"])
    # Safety net (chat endpoint) sets force=True when the model produced a full
    # PRD but never persisted it — bypass the near-duplicate guard so the user's
    # explicit "save this" request can never be silently swallowed.
    force = bool(args.get("force"))

    if not title or not content:
        return json.dumps({"status": "error", "message": "title and content are required"})

    try:
        # Dedup: return existing spec if title already exists
        existing = db.query(Seed).filter(
            Seed.user_id == user.id,
            sa_func.lower(sa_func.trim(Seed.title)) == title.lower().strip()
        ).first()
        if existing:
            return json.dumps({
                "status": "ok",
                "seed_id": str(existing.id),
                "article_id": None,
                "title": title,
                "message": f"PRD '{title}' already exists in Studio.",
            })

        # Near-duplicate guard: flow stacking produced several PRDs for the
        # same feature under variant names. Compare word overlap against
        # specs from the last 7 days (mirrors write_product's guard).
        def _words(t: str) -> set:
            return {w for w in t.lower().replace("&", " ").replace("—", " ").replace(":", " ").split() if len(w) > 2}
        new_words = _words(title)
        from datetime import timedelta as _td
        recent_cutoff = datetime.utcnow() - _td(days=7)
        for s in (() if force else db.query(Seed).filter(
            Seed.user_id == user.id, Seed.created_at >= recent_cutoff,
        ).all()):
            m = s.seed_metadata or {}
            if not isinstance(m, dict) or m.get("seed_type") != "spec":
                continue
            ew = _words(s.title or "")
            if ew and new_words and len(ew & new_words) / max(1, min(len(ew), len(new_words))) >= 0.7:
                return json.dumps({
                    "status": "error",
                    "seed_id": str(s.id),
                    "message": f"A very similar PRD already exists: '{s.title}' (created recently). "
                               "Update it with update_seed instead of creating a variant — "
                               "or pick a clearly different title if this is genuinely a different feature.",
                })

        # Save spec seed
        seed = Seed(
            tenant_id=user.tenant_id,
            user_id=user.id,
            title=title,
            content=content,
            seed_metadata={"tags": tags, "source": "spec_mode", "seed_type": "spec"},
            created_at=datetime.utcnow(),
        )
        db.add(seed)
        db.commit()
        db.refresh(seed)

        # Index in Weaviate (best-effort)
        try:
            from app.enricher_v2 import embed_text
            embedding = embed_text(f"{title}\n{content[:500]}")
            weaviate_client.add_seed(
                tenant_id=str(user.tenant_id),
                user_id=str(user.id),
                thought_id=None,
                title=title,
                content=content,
                embedding=embedding,
                metadata={"tags": tags, "seed_type": "spec"},
                image_url=None,
                created_at=seed.created_at.isoformat(),
            )
        except Exception as e:
            _log.warning(f"Weaviate indexing failed for spec '{title}': {e}")

        # Compile wiki article immediately
        article_id = None
        library_error = None
        try:
            from app.wiki import compile_single_spec
            article_id = await compile_single_spec(
                title=title,
                content=content,
                category="Spec",
                seed_id=str(seed.id),
                user_id=str(user.id),
                tenant_id=str(user.tenant_id),
            )
            if not article_id:
                library_error = "compile returned no article"
        except Exception as e:
            library_error = str(e)
            _log.warning(f"Spec wiki compile failed for '{title}': {e}")

        if library_error:
            return json.dumps({
                "status": "partial",
                "seed_id": str(seed.id),
                "article_id": None,
                "title": title,
                "library_status": "failed",
                "library_error": library_error[:200],
                "message": f"PRD '{title}' saved to Studio, but the Library article could not be compiled ({library_error[:120]}). Retry via the Library compile button.",
            })

        return json.dumps({
            "status": "ok",
            "seed_id": str(seed.id),
            "article_id": article_id,
            "title": title,
            "library_status": "ok",
            "message": f"PRD '{title}' saved to Studio and Library.",
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["write_spec"] = write_spec


# ── ingest_paper: research paper → seed → developable project ─────────────────

_ARXIV_ID_RE = None


def _parse_arxiv_id(arxiv_id: str, url: str) -> str:
    """Extract a bare arXiv id (e.g. '2406.01234') from an id or URL."""
    global _ARXIV_ID_RE
    import re as _re
    if _ARXIV_ID_RE is None:
        _ARXIV_ID_RE = _re.compile(r'(\d{4}\.\d{4,5})(v\d+)?')
    for candidate in (arxiv_id, url):
        if candidate:
            m = _ARXIV_ID_RE.search(candidate)
            if m:
                return m.group(1)
    return ""


async def ingest_paper(args: dict, user: User, db: Session) -> str:
    """Ingest a research paper (arXiv id or URL) as a 'paper' seed the user can develop into a project."""
    import httpx

    arxiv_id = (args.get("arxiv_id") or "").strip()
    url = (args.get("url") or "").strip()
    if not arxiv_id and not url:
        return json.dumps({"status": "error", "message": "Provide an arxiv_id or url."})

    title, abstract, authors, year, link = "", "", [], "", url

    bare_id = _parse_arxiv_id(arxiv_id, url)
    try:
        if bare_id:
            # arXiv Atom API
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://export.arxiv.org/api/query",
                    params={"id_list": bare_id, "max_results": 1},
                )
            resp.raise_for_status()
            import xml.etree.ElementTree as ET
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            root = ET.fromstring(resp.text)
            entry = root.find("atom:entry", ns)
            if entry is None:
                return json.dumps({"status": "error", "message": f"arXiv paper {bare_id} not found."})
            title = (entry.findtext("atom:title", "", ns) or "").replace("\n", " ").strip()
            abstract = (entry.findtext("atom:summary", "", ns) or "").replace("\n", " ").strip()
            authors = [a.findtext("atom:name", "", ns) for a in entry.findall("atom:author", ns)][:8]
            published = entry.findtext("atom:published", "", ns) or ""
            year = published[:4]
            link = f"https://arxiv.org/abs/{bare_id}"
        else:
            # Generic URL — fetch contents via Exa
            exa_key = settings.EXA_API_KEY
            if not exa_key:
                return json.dumps({"status": "error", "message": "Not an arXiv link and Exa is not configured — cannot fetch paper contents."})
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(
                    "https://api.exa.ai/contents",
                    headers={"x-api-key": exa_key, "Content-Type": "application/json"},
                    json={"urls": [url], "text": {"maxCharacters": 3000}, "summary": True},
                )
            resp.raise_for_status()
            results = resp.json().get("results", [])
            if not results:
                return json.dumps({"status": "error", "message": f"Could not fetch contents for {url}."})
            r = results[0]
            title = (r.get("title") or url).strip()
            abstract = (r.get("summary") or (r.get("text") or "")[:1500]).strip()
            year = (r.get("publishedDate") or "")[:4]
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Paper fetch failed: {e}"})

    if not title:
        return json.dumps({"status": "error", "message": "Could not extract a title from the paper."})

    # Dedup by title
    existing = db.query(Seed).filter(
        Seed.user_id == user.id,
        sa_func.lower(sa_func.trim(Seed.title)) == title.lower().strip()
    ).first()
    if existing:
        return json.dumps({
            "status": "ok",
            "seed_id": str(existing.id),
            "title": title,
            "message": f"Paper '{title}' is already in the garden.",
        })

    citation = f"{', '.join(authors)} ({year})" if authors else (year or "")
    content = (
        f"**Source:** {link}\n"
        + (f"**Authors:** {', '.join(authors)}\n" if authors else "")
        + (f"**Year:** {year}\n" if year else "")
        + f"\n## Abstract\n{abstract}\n"
    )
    seed = Seed(
        tenant_id=user.tenant_id,
        user_id=user.id,
        title=title,
        content=content,
        seed_type="paper",
        seed_metadata={
            "tags": ["paper", "research"],
            "source": "ingest_paper",
            "seed_type": "paper",
            "paper_url": link,
            "citation": citation,
        },
        created_at=datetime.utcnow(),
    )
    db.add(seed)
    db.commit()
    db.refresh(seed)

    # Index in Weaviate (best-effort)
    try:
        from app.enricher_v2 import embed_text
        embedding = embed_text(f"{title}\n{abstract[:800]}")
        weaviate_client.add_seed(
            tenant_id=str(user.tenant_id),
            user_id=str(user.id),
            thought_id=None,
            title=title,
            content=content,
            embedding=embedding,
            metadata={"tags": ["paper", "research"], "seed_type": "paper"},
            image_url=None,
            created_at=seed.created_at.isoformat(),
        )
    except Exception as e:
        logger.warning(f"Weaviate indexing failed for paper '{title}': {e}")

    # Queue full-text parsing so retrieval can use the method/results, not just the abstract
    try:
        from app.paper_pipeline import enqueue_or_run_parse
        enqueue_or_run_parse(str(seed.id), str(user.tenant_id))
    except Exception as e:
        logger.warning(f"Paper parse enqueue failed for '{title}': {e}")

    return json.dumps({
        "status": "ok",
        "seed_id": str(seed.id),
        "title": title,
        "url": link,
        "citation": citation,
        "message": f"Paper '{title}' planted in the garden — full text is being indexed. Suggest develop_idea to turn it into a buildable project spec.",
    })


TOOL_HANDLERS["ingest_paper"] = ingest_paper


# ── update_seed / create_article / update_article ─────────────────────────────
# Long-running PRD mapping needs the agent to evolve existing seeds and
# Library articles instead of creating new ones each turn.

async def update_seed(args: dict, user: User, db: Session) -> str:
    """Update an existing seed's title/content/tags. append=True adds to content."""
    seed_id = (args.get("seed_id") or "").strip()
    if not seed_id:
        return json.dumps({"status": "error", "message": "seed_id is required"})
    try:
        seed = db.query(Seed).filter(
            Seed.id == UUID(seed_id),
            Seed.tenant_id == user.tenant_id,
        ).first()
    except ValueError:
        return json.dumps({"status": "error", "message": f"Invalid seed_id: {seed_id}"})
    if not seed:
        return json.dumps({"status": "error", "message": f"Seed {seed_id} not found"})

    new_title = (args.get("title") or "").strip()
    new_content = (args.get("content") or "").strip()
    append = bool(args.get("append", False))
    tags = args.get("tags")

    if new_title:
        seed.title = new_title[:200]
    if new_content:
        seed.content = f"{seed.content or ''}\n\n{new_content}" if append else new_content
    if tags is not None:
        meta = dict(seed.seed_metadata or {})
        meta["tags"] = tags
        seed.seed_metadata = meta
    db.commit()
    db.refresh(seed)

    # Re-index in Weaviate (best-effort)
    try:
        from app.enricher_v2 import embed_text
        embedding = embed_text(f"{seed.title}\n{(seed.content or '')[:500]}")
        weaviate_client.add_seed(
            tenant_id=str(user.tenant_id),
            user_id=str(user.id),
            thought_id=None,
            title=seed.title,
            content=seed.content or "",
            embedding=embedding,
            metadata=seed.seed_metadata or {},
            image_url=seed.image_url,
            created_at=seed.created_at.isoformat() if seed.created_at else None,
        )
    except Exception as e:
        logger.warning(f"Weaviate re-index failed for seed {seed.id}: {e}")

    return json.dumps({
        "status": "ok",
        "seed_id": str(seed.id),
        "title": seed.title,
        "message": f"Seed '{seed.title}' updated" + (" (content appended)" if append and new_content else ""),
    })


TOOL_HANDLERS["update_seed"] = update_seed


def _doc_tree_for(seed_id: str, user: User, db: Session) -> list | None:
    try:
        seed = db.query(Seed).filter(Seed.id == UUID(seed_id), Seed.tenant_id == user.tenant_id).first()
        tree = (seed.seed_metadata or {}).get("doc_tree") if seed else None
        return tree if isinstance(tree, list) and len(tree) >= 3 else None
    except Exception:
        return None


async def search_paper_content(args: dict, user: User, db: Session) -> str:
    """Paper retrieval, two-stage hybrid (spec: tree-retrieval.md).

    Stage 1: vectors answer WHICH paper (cross-corpus). Stage 2: when the
    target paper has a doc tree, one reasoning call answers WHICH sections
    and returns them whole — similarity != relevance for long documents.
    """
    query = (args.get("query") or "").strip()
    seed_id = (args.get("seed_id") or "").strip() or None
    limit = min(int(args.get("limit", 5)), 10)
    if not query:
        return json.dumps({"status": "error", "message": "query is required"})
    try:
        from app.enricher_v2 import embed_text
        embedding = embed_text(query)
        chunks = weaviate_client.search_paper_chunks(
            tenant_id=str(user.tenant_id),
            embedding=embedding,
            seed_id=seed_id,
            limit=limit,
        )
        if not chunks:
            return json.dumps({
                "status": "empty",
                "message": "No parsed paper content matched. The paper may not be indexed yet — "
                           "check its parse status or trigger 'Index full text' in Studio.",
            })

        # Stage 2 — tree navigation when one paper is clearly the target
        target = seed_id or (chunks[0]["seed_id"] if chunks and all(c["seed_id"] == chunks[0]["seed_id"] for c in chunks[:3]) else None)
        if target:
            tree = _doc_tree_for(target, user, db)
            if tree:
                try:
                    from app.tree_retrieval import navigate_tree, fetch_sections
                    node_ids = navigate_tree(tree, query)
                    titles = [n["title"] for n in tree if n["id"] in node_ids]
                    sections = fetch_sections(str(user.tenant_id), target, titles)
                    if sections:
                        return json.dumps({
                            "status": "ok",
                            "retrieval": "tree",
                            "results": [{
                                "paper": s["paper_title"],
                                "section": s["section"],
                                "text": s["text"][:6000],
                                "seed_id": target,
                            } for s in sections],
                        })
                except Exception as e:
                    logger.warning(f"Tree retrieval failed for {target}, falling back to vector: {e}")

        return json.dumps({
            "status": "ok",
            "retrieval": "vector",
            "results": [{
                "paper": c["paper_title"],
                "section": c["section"],
                "text": c["text"][:1200],
                "citation": c["citation"],
                "seed_id": c["seed_id"],
                "relevance": round(c["certainty"], 3),
            } for c in chunks],
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)})


TOOL_HANDLERS["search_paper_content"] = search_paper_content


async def create_article(args: dict, user: User, db: Session) -> str:
    """Create a Library wiki article directly (without compiling from seeds)."""
    title = (args.get("title") or "").strip()
    content = (args.get("content") or "").strip()
    category = (args.get("category") or "Note").strip()
    summary = (args.get("summary") or "").strip()
    if not title or not content:
        return json.dumps({"status": "error", "message": "title and content are required"})
    if not summary:
        for line in content.split("\n"):
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                summary = stripped[:300]
                break
    try:
        article_id = weaviate_client.add_wiki_article(
            tenant_id=str(user.tenant_id),
            user_id=str(user.id),
            title=title,
            category=category,
            summary=summary or content[:300],
            content=content,
            status="published",
        )
        return json.dumps({
            "status": "ok",
            "article_id": article_id,
            "title": title,
            "message": f"Article '{title}' created in the Library.",
        })
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Article creation failed: {e}"})


TOOL_HANDLERS["create_article"] = create_article


async def update_article(args: dict, user: User, db: Session) -> str:
    """Update an existing Library article's title/content/summary by article_id."""
    article_id = (args.get("article_id") or "").strip()
    if not article_id:
        return json.dumps({"status": "error", "message": "article_id is required"})

    updates = {}
    if args.get("title"):
        updates["title"] = str(args["title"]).strip()[:200]
    if args.get("content"):
        updates["content"] = str(args["content"])
    if args.get("summary"):
        updates["summary"] = str(args["summary"]).strip()[:300]
    if not updates:
        return json.dumps({"status": "error", "message": "Provide at least one of title/content/summary"})
    updates["updated_at"] = datetime.utcnow().isoformat() + "Z"

    # Ownership check: article must belong to this tenant
    try:
        articles = weaviate_client.get_wiki_articles(tenant_id=str(user.tenant_id), limit=200)
        if not any(a.get("id") == article_id for a in articles):
            return json.dumps({"status": "error", "message": f"Article {article_id} not found in your Library"})
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Could not verify article: {e}"})

    if weaviate_client.update_wiki_article(article_id, **updates):
        return json.dumps({
            "status": "ok",
            "article_id": article_id,
            "message": "Article updated" + (f" — '{updates.get('title')}'" if updates.get("title") else ""),
        })
    return json.dumps({"status": "error", "message": "Article update failed"})


TOOL_HANDLERS["update_article"] = update_article


# ── write_product: the convergence root (spec: product-atlas.md) ──────────────
# Problem-first is ENFORCED: creation only happens through the chat
# interrogation calling this tool — there is deliberately no REST shortcut.

async def write_product(args: dict, user: User, db: Session) -> str:
    """Create a Product (max 3/tenant, exactly one MAIN, problem statement required)."""
    title = (args.get("title") or "").strip()
    problem = (args.get("problem_statement") or "").strip()
    pillars = args.get("pillars") or []
    success = (args.get("success_definition") or "").strip()

    if not title:
        return json.dumps({"status": "error", "message": "title is required"})
    if len(problem) < 40:
        return json.dumps({"status": "error", "message": "problem_statement too thin — a product must state, in plain english, who hurts and how (40+ chars). Keep interrogating."})
    if not (1 <= len(pillars) <= 5) or not all(isinstance(p, dict) and p.get("name") for p in pillars):
        return json.dumps({"status": "error", "message": "Provide 1-5 pillars, each {name, problem_facet}."})

    existing = [s for s in db.query(Seed).filter(
        Seed.tenant_id == user.tenant_id, Seed.seed_type == "product"
    ).all()]

    # Duplicate guard: products describing the same thing under variant names
    # consumed the entire cap on the first live run. Compare word overlap.
    def _words(t):
        return {w for w in t.lower().replace("&", " ").replace("—", " ").split() if len(w) > 2}
    new_words = _words(title)
    for s in existing:
        ew = _words(s.title or "")
        if ew and new_words and len(ew & new_words) / max(1, min(len(ew), len(new_words))) >= 0.6:
            return json.dumps({"status": "error",
                               "message": f"This looks like a duplicate of existing product '{s.title}'. "
                                          "Update that product instead (or have the user archive it first) — never create variants of the same product."})

    if len(existing) >= 3:
        return json.dumps({"status": "error", "message": "Product cap reached (3). Archive or merge a backlog product first — focus is the point."})
    has_main = any((s.seed_metadata or {}).get("rank") == "main" for s in existing)
    rank = "backlog" if has_main else "main"

    pillar_list = [{"id": i, "name": str(p["name"])[:80], "problem_facet": str(p.get("problem_facet", ""))[:200]}
                   for i, p in enumerate(pillars)]
    content = (
        f"# {title}\n\n## The Problem\n{problem[:600]}\n\n## Pillars\n"
        + "\n".join(f"- **{p['name']}** — {p['problem_facet']}" for p in pillar_list)
        + (f"\n\n## Success\n{success[:500]}" if success else "")
    )
    seed = Seed(
        tenant_id=user.tenant_id,
        user_id=user.id,
        title=title[:170],
        content=content,
        seed_type="product",
        seed_metadata={
            "seed_type": "product",
            "tags": ["product"],
            "problem_statement": problem[:600],
            "pillars": pillar_list,
            "rank": rank,
            "success_definition": success[:500],
            "story_so_far": f"Defined: {problem[:180]}",
            "story_events": [],
        },
        created_at=datetime.utcnow(),
    )
    db.add(seed)
    db.commit()
    db.refresh(seed)
    return json.dumps({
        "status": "ok", "product_id": str(seed.id), "title": title, "rank": rank,
        "message": f"Product '{title}' created as {rank.upper()}. "
                   + ("It now anchors the Studio — every PRD should serve its problem." if rank == "main"
                      else "Parked in the backlog — promote it from the Product view when it earns focus."),
    })


TOOL_HANDLERS["write_product"] = write_product


# ── build_ledger: adaptive interrogations (spec: adaptive-agents.md) ──────────

async def build_ledger(args: dict, user: User, db: Session) -> str:
    """Grade what's already known before asking the user anything."""
    from app.agent_ledger import build_ledger as _build
    kind = (args.get("kind") or "spec").strip()
    seed_id = (args.get("seed_id") or "").strip() or None
    try:
        return json.dumps(_build(kind, seed_id, user, db))
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)[:200]})


TOOL_HANDLERS["build_ledger"] = build_ledger
