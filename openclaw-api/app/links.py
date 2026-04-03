from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from app.auth import get_current_user
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
async def create_link(body: LinkCreate, request: Request):
    user = await get_current_user(request)
    tenant_id = str(user.tenant_id)
    user_id = str(user.id)

    url = body.url
    if not url.startswith("http"):
        url = f"https://{url}"

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

    return {"id": link_id, "url": url, "title": title, "summary": summary, "domain": domain}


@router.get("")
async def list_links(
    request: Request,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    starred: Optional[bool] = None,
    sort: str = "recent",
    limit: int = 50,
):
    user = await get_current_user(request)
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
async def update_link(link_id: str, body: LinkUpdate, request: Request):
    user = await get_current_user(request)

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

    return {"ok": True}


@router.delete("/{link_id}")
async def delete_link(link_id: str, request: Request):
    user = await get_current_user(request)

    success = weaviate_client.delete_link(link_id)
    if not success:
        raise HTTPException(status_code=404, detail="Link not found")

    return {"ok": True}


@router.post("/bulk")
async def bulk_create_links(body: LinkBulkCreate, request: Request):
    user = await get_current_user(request)
    tenant_id = str(user.tenant_id)
    user_id = str(user.id)

    results = []
    for url in body.urls[:20]:  # Cap at 20
        url = url.strip()
        if not url:
            continue
        if not url.startswith("http"):
            url = f"https://{url}"

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
        results.append({"id": link_id, "url": url, "title": title})

    return {"created": len(results), "links": results}


# ── P1: Connection Detection ──────────────────────────

@router.post("/detect-connections")
async def detect_connections(body: ConnectionDetectRequest, request: Request):
    """Detect connections between links based on tag overlap, domain, and vector similarity."""
    user = await get_current_user(request)
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
async def get_related(link_id: str, request: Request):
    """Get related links/seeds for a given link."""
    user = await get_current_user(request)

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
