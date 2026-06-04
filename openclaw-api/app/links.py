from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from app.auth import get_current_user
from app.models import User
from app.weaviate_client import weaviate_client
import httpx
from urllib.parse import urlparse
from bs4 import BeautifulSoup

router = APIRouter(prefix="/api/v1/links", tags=["links"])


class LinkCreate(BaseModel):
    url: str
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[str] = None
    starred: bool = False

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        parsed = urlparse(v.strip())
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("url must be a valid http or https URL")
        return v.strip()


class LinkUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[str] = None
    starred: Optional[bool] = None
    status: Optional[str] = None
    related_ids: Optional[str] = None


class LinkBulkCreate(BaseModel):
    urls: List[str]


class ConnectionDetectRequest(BaseModel):
    link_ids: Optional[List[str]] = None  # If empty, auto-detect for all pending


def extract_domain(url: str) -> str:
    try:
        parsed = urlparse(url)
        return parsed.netloc.replace("www.", "")
    except:
        return "unknown"


def get_favicon(domain: str) -> str:
    return f"https://www.google.com/s2/favicons?domain={domain}&sz=32"


async def fetch_page_metadata(url: str) -> dict:
    """Fetch page and extract title, description, keywords, OG image."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            resp = await client.get(url, headers={"User-Agent": "GreenPlot Bot/1.0"})
            if resp.status_code != 200:
                return {}

            html = resp.text
            soup = BeautifulSoup(html, "html.parser")

            # Title
            title = ""
            if soup.title and soup.title.string:
                title = soup.title.string.strip()
            if not title:
                og = soup.find("meta", property="og:title")
                if og:
                    title = og.get("content", "")

            # Description
            summary = ""
            desc = soup.find("meta", attrs={"name": "description"})
            if desc:
                summary = desc.get("content", "")
            if not summary:
                og = soup.find("meta", property="og:description")
                if og:
                    summary = og.get("content", "")

            # Keywords → tags
            tags = []
            kw = soup.find("meta", attrs={"name": "keywords"})
            if kw:
                tags = [t.strip() for t in kw.get("content", "").split(",") if t.strip()][:5]

            # OG Image
            og_img = soup.find("meta", property="og:image")
            og_image = og_img.get("content", "") if og_img else ""

            # Raw text (first 2000 chars for enrichment)
            for script in soup(["script", "style", "nav", "footer"]):
                script.decompose()
            raw_text = soup.get_text(separator=" ", strip=True)[:2000]

            return {
                "title": title,
                "summary": summary,
                "tags": ",".join(tags),
                "og_image": og_image,
                "raw_text": raw_text,
            }
    except Exception:
        return {}


@router.post("")
async def create_link(body: LinkCreate, request: Request, current_user = Depends(get_current_user)):
    user = current_user
    tenant_id = str(user.tenant_id)
    user_id = str(user.id)

    url = body.url
    if not url.startswith("http"):
        url = f"https://{url}"

    # Dedup: return existing link if this URL is already saved
    existing = weaviate_client.find_link_by_url(tenant_id=tenant_id, url=url)
    if existing:
        return {
            "id": existing["id"],
            "url": existing["url"],
            "title": existing["title"],
            "summary": existing["summary"],
            "domain": existing["domain"],
            "status": "exists",
            "message": "Link already in your sources",
        }

    domain = extract_domain(url)

    # Auto-fetch metadata
    meta = await fetch_page_metadata(url)

    title = body.title or meta.get("title") or domain
    summary = body.summary or meta.get("summary") or ""
    tags = body.tags or meta.get("tags") or ""
    favicon = get_favicon(domain)
    og_image = meta.get("og_image", "")
    raw_text = meta.get("raw_text", "")

    link_id = weaviate_client.add_link(
        tenant_id=tenant_id,
        user_id=user_id,
        url=url,
        title=title,
        summary=summary,
        domain=domain,
        tags=tags,
        favicon=favicon,
        og_image=og_image,
        raw_text=raw_text,
        status="enriched" if summary else "pending",
        starred=body.starred,
    )

    # Auto-connect to related seeds (best-effort, non-blocking)
    try:
        _auto_connect_link_to_seeds(link_id, tenant_id, title, summary, tags, domain)
    except Exception:
        pass

    return {"id": link_id, "url": url, "title": title, "summary": summary, "domain": domain}


def _auto_connect_link_to_seeds(link_id: str, tenant_id: str, title: str, summary: str, tags: str, domain: str):
    """Find related seeds by tag/domain overlap and store cross-references."""
    from app.config import settings
    # Get all seeds for this tenant
    seeds = weaviate_client.get_seeds_by_tenant(tenant_id, limit=200)
    if not seeds:
        return

    link_tags = set(t.strip().lower() for t in (tags or "").split(",") if t.strip())
    link_domain = (domain or "").lower()
    link_text = f"{title} {summary}".lower()

    scores = {}
    for seed in seeds:
        seed_id = seed.get("id") or seed.get("uuid", "")
        if not seed_id:
            continue
        score = 0

        # Tag overlap (weight 3)
        seed_tags = seed.get("tags", "")
        if isinstance(seed_tags, str):
            seed_tag_set = set(t.strip().lower() for t in seed_tags.split(",") if t.strip())
        elif isinstance(seed_tags, list):
            seed_tag_set = set(t.lower() for t in seed_tags if t)
        else:
            seed_tag_set = set()
        tag_overlap = link_tags & seed_tag_set
        score += len(tag_overlap) * 3

        # Domain match (weight 2)
        seed_domain = (seed.get("domain", "") or "").lower()
        if seed_domain and link_domain and seed_domain == link_domain:
            score += 2

        # Title keyword overlap (weight 1)
        seed_title = (seed.get("title", "") or "").lower()
        if seed_title and link_text:
            seed_words = set(seed_title.split()) - {"the", "a", "an", "is", "in", "on", "of", "for", "to", "and"}
            link_words = set(link_text.split()) - {"the", "a", "an", "is", "in", "on", "of", "for", "to", "and"}
            word_overlap = seed_words & link_words
            score += len(word_overlap)

        if score >= 3:
            scores[seed_id] = score

    # Store top 5 related seed IDs in the link's garden_seed_id field (comma-separated)
    if scores:
        top_seeds = sorted(scores.items(), key=lambda x: -x[1])[:5]
        related_str = ",".join(sid for sid, _ in top_seeds)
        weaviate_client.update_link(link_id, garden_seed_id=related_str)
    else:
        # AUTO-BRIDGE: No related seeds found → auto-create a seed from this source
        # This connects Sources → Garden automatically
        _auto_create_seed_from_link(link_id, tenant_id, title, summary, tags, domain)


def _auto_create_seed_from_link(link_id: str, tenant_id: str, title: str, summary: str, tags: str, domain: str):
    """Auto-create a seed from an enriched link when no related seeds exist.
    This is the Sources → Garden auto-bridge."""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        from app.enricher_v2 import embed_text
        
        # Build seed content
        seed_content = f"Source: {title}\n\n{summary}" if summary else f"Source: {title}"
        
        # Generate embedding
        try:
            embedding = embed_text(f"{title} {summary}")
        except Exception:
            embedding = [0.0] * 1536
        
        # Get user_id from tenant (simplified - use first user)
        from app.database import get_db
        from app.models import User
        db = next(get_db())
        user = db.query(User).filter(User.tenant_id == tenant_id).first()
        if not user:
            return
        
        # Create seed
        seed_id = weaviate_client.add_seed(
            tenant_id=tenant_id,
            user_id=str(user.id),
            thought_id=None,
            title=f"📌 {title}",
            content=seed_content,
            embedding=embedding,
            metadata={
                "source": "auto_bridge",
                "source_link_id": link_id,
                "domain": domain,
                "tags": tags,
            },
        )
        
        # Update link with seed reference
        weaviate_client.update_link(link_id, garden_seed_id=seed_id)
        
        logger.info(f"🔗→🌱 Auto-bridged source to seed: {title[:50]}")
        
        # Log activity
        try:
            from app.activity import log_seed_created
            log_seed_created(tenant_id, f"📌 {title}", "auto_bridge")
        except Exception:
            pass
            
    except Exception as e:
        logger.debug(f"Auto-bridge failed for link {link_id}: {e}")


@router.post("/enrich-pending")
async def enrich_pending_links(request: Request, current_user = Depends(get_current_user)):
    """Re-fetch metadata for links with status='pending'."""
    user = current_user
    tenant_id = str(user.tenant_id)

    links = weaviate_client.get_links(tenant_id=tenant_id, limit=100)
    pending = [l for l in links if l.get("status") == "pending"]

    enriched = 0
    for link in pending[:10]:  # Cap at 10 per call
        url = link.get("url", "")
        if not url:
            continue
        meta = await fetch_page_metadata(url)
        if meta.get("title") or meta.get("summary"):
            updates = {}
            if meta.get("title"):
                updates["title"] = meta["title"]
            if meta.get("summary"):
                updates["summary"] = meta["summary"]
                updates["status"] = "enriched"
            if meta.get("tags"):
                updates["tags"] = meta["tags"]
            weaviate_client.update_link(link["id"], **updates)
            enriched += 1

    return {"enriched": enriched, "remaining": len(pending) - enriched}


@router.get("")
async def list_links(
    request: Request,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    starred: Optional[bool] = None,
    sort: str = "recent",
    limit: int = 50,
    current_user = Depends(get_current_user),
):
    user = current_user
    tenant_id = str(user.tenant_id)

    links = weaviate_client.get_links(
        tenant_id=tenant_id,
        search=search,
        tag=tag,
        starred=starred,
        sort=sort,
        limit=limit,
    )
    return {"links": links}


@router.patch("/{link_id}")
async def update_link(link_id: str, body: LinkUpdate, request: Request, current_user = Depends(get_current_user)):
    user = current_user

    updates = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.summary is not None:
        updates["summary"] = body.summary
    if body.tags is not None:
        updates["tags"] = body.tags
    if body.starred is not None:
        updates["starred"] = body.starred
    if body.status is not None:
        updates["status"] = body.status
    if body.related_ids is not None:
        updates["related_ids"] = body.related_ids

    success = weaviate_client.update_link(link_id, **updates)
    if not success:
        raise HTTPException(status_code=404, detail="Link not found")

    # Auto-trigger connection detection when status changes to "enriched"
    if body.status == "enriched":
        try:
            # Run connection detection for this single link in background
            links = weaviate_client.get_links(tenant_id=str(user.tenant_id), limit=200)
            target = next((l for l in links if l.get("id") == link_id), None)
            if target:
                tag_index = {}
                domain_index = {}
                for l in links:
                    lid = l.get("id", "")
                    tags = l.get("tags", [])
                    if isinstance(tags, str):
                        tags = [t.strip() for t in tags.split(",") if t.strip()]
                    for tag in tags:
                        key = tag.lower()
                        if key not in tag_index:
                            tag_index[key] = []
                        tag_index[key].append(lid)
                    domain = l.get("domain", "").lower()
                    if domain:
                        if domain not in domain_index:
                            domain_index[domain] = []
                        domain_index[domain].append(lid)

                scores = {}
                target_tags = target.get("tags", [])
                if isinstance(target_tags, str):
                    target_tags = [t.strip() for t in target_tags.split(",") if t.strip()]
                for tag in target_tags:
                    for rid in tag_index.get(tag.lower(), []):
                        if rid != link_id:
                            scores[rid] = scores.get(rid, 0) + 2
                target_domain = target.get("domain", "").lower()
                for rid in domain_index.get(target_domain, []):
                    if rid != link_id:
                        scores[rid] = scores.get(rid, 0) + 3

                strong = [rid for rid, s in scores.items() if s >= 3][:10]
                if strong:
                    weaviate_client.update_link(link_id, related_ids=",".join(strong))
        except Exception:
            pass  # Non-blocking

    return {"ok": True}


@router.delete("/{link_id}")
async def delete_link(link_id: str, request: Request, current_user = Depends(get_current_user)):
    user = current_user

    success = weaviate_client.delete_link(link_id)
    if not success:
        raise HTTPException(status_code=404, detail="Link not found")

    return {"ok": True}


@router.post("/bulk")
async def bulk_create_links(body: LinkBulkCreate, request: Request, current_user = Depends(get_current_user)):
    user = current_user
    tenant_id = str(user.tenant_id)
    user_id = str(user.id)

    # Build existing-URL set to avoid duplicates across the whole batch
    existing_links = weaviate_client.get_links(tenant_id=tenant_id, limit=500)
    existing_urls = {lnk.get("url", "") for lnk in existing_links}

    results = []
    skipped = 0
    for url in body.urls[:20]:  # Cap at 20
        url = url.strip()
        if not url:
            continue
        if not url.startswith("http"):
            url = f"https://{url}"

        if url in existing_urls:
            skipped += 1
            continue

        domain = extract_domain(url)
        meta = await fetch_page_metadata(url)

        title = meta.get("title") or domain
        summary = meta.get("summary") or ""
        tags = meta.get("tags") or ""
        favicon = get_favicon(domain)

        link_id = weaviate_client.add_link(
            tenant_id=tenant_id,
            user_id=user_id,
            url=url,
            title=title,
            summary=summary,
            domain=domain,
            tags=tags,
            favicon=favicon,
            og_image=meta.get("og_image", ""),
            raw_text=meta.get("raw_text", ""),
            status="enriched" if summary else "pending",
        )
        existing_urls.add(url)  # prevent intra-batch duplicates
        results.append({"id": link_id, "url": url, "title": title})

    return {"created": len(results), "skipped": skipped, "links": results}


# ── P1: Connection Detection ──────────────────────────

@router.post("/detect-connections")
async def detect_connections(body: ConnectionDetectRequest, request: Request, current_user = Depends(get_current_user)):
    """Detect connections between links based on tag overlap, domain, and vector similarity."""
    user = current_user
    tenant_id = str(user.tenant_id)

    links = weaviate_client.get_links(tenant_id=tenant_id, limit=200)

    if body.link_ids:
        links = [l for l in links if l.get("id") in body.link_ids]

    # Build tag index: tag -> [link_ids]
    tag_index = {}
    domain_index = {}
    for link in links:
        lid = link.get("id", "")
        tags = link.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        for tag in tags:
            key = tag.lower()
            if key not in tag_index:
                tag_index[key] = []
            tag_index[key].append(lid)

        domain = link.get("domain", "").lower()
        if domain:
            if domain not in domain_index:
                domain_index[domain] = []
            domain_index[domain].append(lid)

    # Detect connections: shared tags (weight 2) or shared domain (weight 3)
    connections = {}  # link_id -> {related_id: score}
    for link in links:
        lid = link.get("id", "")
        if not lid:
            continue
        scores = {}

        tags = link.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        for tag in tags:
            for related_id in tag_index.get(tag.lower(), []):
                if related_id != lid:
                    scores[related_id] = scores.get(related_id, 0) + 2

        domain = link.get("domain", "").lower()
        for related_id in domain_index.get(domain, []):
            if related_id != lid:
                scores[related_id] = scores.get(related_id, 0) + 3

        # Keep connections with score >= 3
        strong = [rid for rid, s in scores.items() if s >= 3]
        if strong:
            connections[lid] = strong

    # Store connections as related_ids field
    updated = 0
    for lid, related in connections.items():
        related_str = ",".join(related[:10])  # Cap at 10
        if weaviate_client.update_link(lid, related_ids=related_str):
            updated += 1

    return {"detected": len(connections), "updated": updated}


@router.get("/{link_id}/related")
async def get_related(link_id: str, request: Request, current_user = Depends(get_current_user)):
    """Get related links/seeds for a given link."""
    user = current_user

    try:
        obj = weaviate_client.client.data_object.get_by_id(
            uuid=link_id, class_name="Link"
        )
        props = obj.get("properties", {})
        related_str = props.get("related_ids", "")
        related_ids = [r.strip() for r in related_str.split(",") if r.strip()] if related_str else []

        related_items = []
        for rid in related_ids[:10]:
            try:
                robj = weaviate_client.client.data_object.get_by_id(
                    uuid=rid, class_name="Link"
                )
                rp = robj.get("properties", {})
                related_items.append({
                    "id": rid,
                    "title": rp.get("title", ""),
                    "domain": rp.get("domain", ""),
                    "summary": rp.get("summary", ""),
                    "type": "link",
                })
            except:
                pass

        return {"related": related_items}
    except Exception:
        raise HTTPException(status_code=404, detail="Link not found")


@router.get("/{link_id}/seeds")
async def get_spawned_seeds(link_id: str, request: Request, current_user = Depends(get_current_user)):
    """Get all seeds spawned from this source link."""
    from app.models import Seed
    from app.database import get_db as _get_db

    # Find seeds where metadata.source_link_id matches this link
    try:
        obj = weaviate_client.client.data_object.get_by_id(uuid=link_id, class_name="Link")
        props = obj.get("properties", {})
    except:
        raise HTTPException(status_code=404, detail="Link not found")

    # Also check Weaviate for seeds with this source_link_id
    spawned = []
    try:
        # Check garden_seed_id field
        garden_id = props.get("garden_seed_id", "")
        if garden_id:
            try:
                seed_obj = weaviate_client.client.data_object.get_by_id(uuid=garden_id, class_name="IdeaSeed")
                sp = seed_obj.get("properties", {})
                spawned.append({
                    "id": garden_id,
                    "title": sp.get("title", ""),
                    "source": "source_to_seed",
                })
            except:
                pass
    except:
        pass

    return {"seeds": spawned, "link_id": link_id}


@router.post("/{link_id}/create-seed")
async def create_seed_from_link(link_id: str, request: Request, current_user = Depends(get_current_user)):
    """Bridge: Create a seed from a source link."""
    user = current_user

    try:
        obj = weaviate_client.client.data_object.get_by_id(
            uuid=link_id, class_name="Link"
        )
        props = obj.get("properties", {})
    except:
        raise HTTPException(status_code=404, detail="Link not found")

    title = props.get("title", "Untitled Source")
    url = props.get("url", "")
    summary = props.get("summary", "")
    domain = props.get("domain", "")
    tags = props.get("tags", "")

    # Create seed content from source
    seed_content = f"Source: {url}\n\n{summary}" if summary else f"Source: {url}"

    # Create seed in Weaviate
    from app.enricher_v2 import embed_text
    try:
        embedding = embed_text(f"{title} {summary}")
    except:
        embedding = None

    seed_id = weaviate_client.add_seed(
        tenant_id=str(user.tenant_id),
        user_id=str(user.id),
        thought_id=None,
        title=f"🌱 {title}",
        content=seed_content,
        embedding=embedding or [0.0] * 1536,
        metadata={
            "source": "source_to_seed",
            "source_link_id": link_id,
            "source_url": url,
            "domain": domain,
            "tags": tags,
        },
    )

    # Update link with garden_seed_id reference
    try:
        weaviate_client.update_link(link_id, garden_seed_id=seed_id)
    except:
        pass  # non-blocking

    return {
        "seed_id": seed_id,
        "title": f"🌱 {title}",
        "source_url": url,
        "message": "Seed created from source"
    }
