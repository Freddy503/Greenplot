import json
import weaviate
from weaviate.exceptions import UnexpectedStatusCodeException
from app.config import settings

class WeaviateClient:
    def __init__(self):
        self.client = weaviate.Client(
            url=settings.WEAVIATE_URL,
            additional_headers={
                "X-OpenAI-Api-Key": settings.OPENROUTER_API_KEY or ""  # if needed for modules
            }
        )
        self._ensure_schema()

    def _ensure_schema(self):
        # Create AppSeed class if it doesn't exist
        try:
            existing = [c["class"] for c in self.client.schema.get()["classes"]]
        except:
            existing = []

        if settings.WEAVIATE_CLASS not in existing:
            class_obj = {
                "class": settings.WEAVIATE_CLASS,
                "description": "Seed objects for OpenClaw multi-tenant app",
                "properties": [
                    {"name": "tenant_id", "dataType": ["text"]},
                    {"name": "user_id", "dataType": ["text"]},
                    {"name": "thought_id", "dataType": ["text"]},
                    {"name": "title", "dataType": ["text"]},
                    {"name": "content", "dataType": ["text"]},
                    {"name": "text", "dataType": ["text"]},
                    {"name": "summary", "dataType": ["text"]},
                    {"name": "tags", "dataType": ["text"]},
                    {"name": "entities", "dataType": ["text"]},
                    {"name": "backlinks", "dataType": ["text"]},
                    {"name": "domain", "dataType": ["text"]},
                    {"name": "energy", "dataType": ["text"]},
                    {"name": "source", "dataType": ["text"]},
                    {"name": "url", "dataType": ["text"]},
                    {"name": "source_url", "dataType": ["text"]},
                    {"name": "notion_id", "dataType": ["text"]},
                    {"name": "status", "dataType": ["text"]},
                    {"name": "enrichment_version", "dataType": ["text"]},
                    {"name": "parent_id", "dataType": ["text"]},
                    {"name": "chunk_idx", "dataType": ["int"]},
                    {"name": "metadata", "dataType": ["text"]},
                    {"name": "image_url", "dataType": ["text"]},
                    {"name": "created_at", "dataType": ["date"]},
                    {"name": "created", "dataType": ["date"]},
                ],
                "vectorIndexConfig": {
                    "vector": {"dimensions": 1024, "distance": "cosine"}
                }
            }
            self.client.schema.create_class(class_obj)

        # Create Link class for Hub
        if "Link" not in existing:
            link_class = {
                "class": "Link",
                "description": "Collected links for the Hub tab",
                "properties": [
                    {"name": "tenant_id", "dataType": ["text"]},
                    {"name": "user_id", "dataType": ["text"]},
                    {"name": "url", "dataType": ["text"]},
                    {"name": "title", "dataType": ["text"]},
                    {"name": "summary", "dataType": ["text"]},
                    {"name": "domain", "dataType": ["text"]},
                    {"name": "tags", "dataType": ["text"]},
                    {"name": "favicon", "dataType": ["text"]},
                    {"name": "og_image", "dataType": ["text"]},
                    {"name": "raw_text", "dataType": ["text"]},
                    {"name": "status", "dataType": ["text"]},
                    {"name": "starred", "dataType": ["boolean"]},
                    {"name": "connection_count", "dataType": ["int"]},
                    {"name": "garden_seed_id", "dataType": ["text"]},
                    {"name": "created_at", "dataType": ["date"]},
                    {"name": "enriched_at", "dataType": ["date"]},
                ],
                "vectorizer": "none",
            }
            self.client.schema.create_class(link_class)

        # Create WikiArticle class
        if "WikiArticle" not in existing:
            wiki_class = {
                "class": "WikiArticle",
                "description": "LLM-compiled wiki articles from garden seeds",
                "properties": [
                    {"name": "tenant_id", "dataType": ["text"]},
                    {"name": "user_id", "dataType": ["text"]},
                    {"name": "title", "dataType": ["text"]},
                    {"name": "category", "dataType": ["text"]},
                    {"name": "summary", "dataType": ["text"]},
                    {"name": "content", "dataType": ["text"]},
                    {"name": "source_seed_ids", "dataType": ["text"]},
                    {"name": "source_link_ids", "dataType": ["text"]},
                    {"name": "backlinks", "dataType": ["text"]},
                    {"name": "status", "dataType": ["text"]},
                    {"name": "health_score", "dataType": ["int"]},
                    {"name": "created_at", "dataType": ["date"]},
                    {"name": "updated_at", "dataType": ["date"]},
                    {"name": "last_regenerated_at", "dataType": ["date"]},
                ],
                "vectorizer": "none",
            }
            self.client.schema.create_class(wiki_class)

    def add_seed(self, tenant_id: str, user_id: str, thought_id: str, title: str, content: str, embedding: list, metadata: dict = None, image_url: str = None, created_at: str = None):
        obj = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "thought_id": thought_id,
            "title": title,
            "content": content,
            "metadata": metadata or {},
            "image_url": image_url,
            "created_at": created_at or datetime.utcnow().isoformat()
        }
        uuid = self.client.data_object.create(
            class_name=settings.WEAVIATE_CLASS,
            data_object=obj,
            vector=embedding
        )
        return uuid

    def search_seeds(self, tenant_id: str, embedding: list, limit: int = 10):
        nearVector = {"vector": embedding}
        # Search IdeaSeed class — include enrichment fields, filter by tenant
        query = self.client.query.get(
            settings.WEAVIATE_CLASS,
            ["title", "text", "source", "url", "created", "notion_id",
             "summary", "tags", "entities", "backlinks", "domain", "energy", "tenant_id"]
        ).with_near_vector(nearVector).with_where({
            "path": ["tenant_id"],
            "operator": "Equal",
            "valueText": tenant_id,
        }).with_limit(limit * 3)
        result = query.do()
        objects = result.get("data", {}).get("Get", {}).get(settings.WEAVIATE_CLASS, []) or []

        # Deduplicate by notion_id (keep best match per seed)
        seen = {}
        for o in objects:
            nid = o.get("notion_id", "")
            if not nid:
                nid = o.get("title", "")
            if nid in seen:
                continue

            # Parse metadata JSON blob as fallback for enrichment fields
            metadata = o.get("metadata") or {}
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except:
                    metadata = {}

            seen[nid] = {
                "title": o.get("title", ""),
                "content": o.get("text", ""),
                "created_at": o.get("created", ""),
                "source": o.get("source", ""),
                "url": o.get("url", ""),
                # Prefer top-level fields, fallback to metadata JSON
                "summary": o.get("summary") or metadata.get("summary", ""),
                "tags": o.get("tags") or metadata.get("tags", ""),
                "entities": o.get("entities") or metadata.get("entities", ""),
                "backlinks": o.get("backlinks") or metadata.get("backlinks", ""),
                "domain": o.get("domain") or metadata.get("domain", ""),
                "energy": o.get("energy") or metadata.get("energy", ""),
            }
            if len(seen) >= limit:
                break

        return list(seen.values())

    def delete_tenant_seeds(self, tenant_id: str):
        # Delete all objects for a tenant (for account deletion)
        where = {"path": ["tenant_id"], "operator": "Equal", "valueText": tenant_id}
        self.client.batch.delete_objects(
            class_name=settings.WEAVIATE_CLASS,
            where=where
        )

    def search_similar(self, tenant_id: str, embedding: list, limit: int = 10) -> list[dict]:
        """
        Search for similar seeds by vector similarity.
        Returns list of dicts with id, title, content, metadata, certainty.
        Used by backlinker for autonomous link creation.
        """
        nearVector = {"vector": embedding}
        query = self.client.query.get(
            settings.WEAVIATE_CLASS,
            ["title", "content", "metadata", "image_url", "created_at", "thought_id"]
        ).with_near_vector(nearVector).with_where({
            "path": ["tenant_id"],
            "operator": "Equal",
            "valueText": tenant_id
        }).with_additional(["id", "certainty"]).with_limit(limit)
        result = query.do()
        objects = result.get("data", {}).get("Get", {}).get(settings.WEAVIATE_CLASS, [])

        # Normalize to flat dicts
        results = []
        for obj in objects:
            metadata = obj.get("metadata", {})
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except:
                    metadata = {}
            results.append({
                "id": obj.get("_additional", {}).get("id"),
                "title": obj.get("title", ""),
                "summary": metadata.get("summary", ""),
                "content": obj.get("content", ""),
                "entities": metadata.get("entities", []),
                "topics": metadata.get("topics", []),
                "certainty": obj.get("_additional", {}).get("certainty", 0.0),
                "thought_id": obj.get("thought_id", "")
            })
        return results

    # ── Link CRUD (Hub) ───────────────────────────────

    def add_link(self, tenant_id: str, user_id: str, url: str, title: str, summary: str,
                 domain: str, tags: str, favicon: str, og_image: str = None,
                 raw_text: str = None, status: str = "pending", starred: bool = False) -> str:
        from datetime import datetime as dt
        obj = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "url": url,
            "title": title,
            "summary": summary,
            "domain": domain,
            "tags": tags,
            "favicon": favicon,
            "og_image": og_image or "",
            "raw_text": raw_text or "",
            "status": status,
            "starred": starred,
            "connection_count": 0,
            "garden_seed_id": "",
            "created_at": dt.utcnow().isoformat(),
            "enriched_at": "",
        }
        return self.client.data_object.create(class_name="Link", data_object=obj)

    def get_links(self, tenant_id: str, search: str = None, tag: str = None,
                  starred: bool = None, sort: str = "recent", limit: int = 50) -> list[dict]:
        where = {"path": ["tenant_id"], "operator": "Equal", "valueText": tenant_id}
        query = self.client.query.get("Link", [
            "url", "title", "summary", "domain", "tags", "favicon", "og_image",
            "status", "starred", "connection_count", "garden_seed_id", "created_at", "enriched_at"
        ]).with_where(where).with_limit(limit)

        if starred is not None:
            query = query.with_where({
                "operator": "And",
                "operands": [
                    where,
                    {"path": ["starred"], "operator": "Equal", "valueBoolean": starred}
                ]
            })

        result = query.do()
        objects = result.get("data", {}).get("Get", {}).get("Link", []) or []

        links = []
        for obj in objects:
            tags_str = obj.get("tags", "") or ""
            tag_list = [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else []

            # Client-side search/filter
            if search:
                q = search.lower()
                searchable = f"{obj.get('title', '')} {obj.get('domain', '')} {tags_str} {obj.get('summary', '')}".lower()
                if q not in searchable:
                    continue
            if tag:
                if tag.lower() not in [t.lower() for t in tag_list]:
                    continue

            links.append({
                "id": obj.get("_additional", {}).get("id", ""),
                "url": obj.get("url", ""),
                "title": obj.get("title", ""),
                "summary": obj.get("summary", ""),
                "domain": obj.get("domain", ""),
                "tags": tag_list,
                "favicon": obj.get("favicon", ""),
                "og_image": obj.get("og_image", ""),
                "status": obj.get("status", "pending"),
                "starred": obj.get("starred", False),
                "connection_count": obj.get("connection_count", 0),
                "garden_seed_id": obj.get("garden_seed_id", ""),
                "addedAt": obj.get("created_at", ""),
                "enrichedAt": obj.get("enriched_at", ""),
            })

        # Sort
        if sort == "starred":
            links.sort(key=lambda x: (x["starred"], x["addedAt"]), reverse=True)
        else:
            links.sort(key=lambda x: x["addedAt"], reverse=True)

        return links

    def update_link(self, link_id: str, **kwargs) -> bool:
        try:
            self.client.data_object.update(
                class_name="Link",
                uuid=link_id,
                data_object=kwargs
            )
            return True
        except Exception:
            return False

    def delete_link(self, link_id: str) -> bool:
        try:
            self.client.data_object.delete(uuid=link_id, class_name="Link")
            return True
        except Exception:
            return False

    # ── WikiArticle CRUD ──────────────────────────────

    def add_wiki_article(self, tenant_id: str, user_id: str, title: str, category: str,
                         summary: str, content: str, source_seed_ids: str = "",
                         source_link_ids: str = "", backlinks: str = "",
                         status: str = "published", health_score: int = 50) -> str:
        from datetime import datetime as dt
        now = dt.utcnow().isoformat()
        obj = {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "title": title,
            "category": category,
            "summary": summary,
            "content": content,
            "source_seed_ids": source_seed_ids,
            "source_link_ids": source_link_ids,
            "backlinks": backlinks,
            "status": status,
            "health_score": health_score,
            "created_at": now,
            "updated_at": now,
            "last_regenerated_at": "",
        }
        return self.client.data_object.create(class_name="WikiArticle", data_object=obj)

    def get_wiki_articles(self, tenant_id: str, category: str = None,
                          search: str = None, sort: str = "recent", limit: int = 50) -> list[dict]:
        where = {"path": ["tenant_id"], "operator": "Equal", "valueText": tenant_id}
        query = self.client.query.get("WikiArticle", [
            "title", "category", "summary", "content", "source_seed_ids",
            "source_link_ids", "backlinks", "status", "health_score",
            "created_at", "updated_at", "last_regenerated_at"
        ]).with_where(where).with_limit(limit)

        result = query.do()
        objects = result.get("data", {}).get("Get", {}).get("WikiArticle", []) or []

        articles = []
        for obj in objects:
            bl_str = obj.get("backlinks", "") or ""
            bl_list = [b.strip() for b in bl_str.split(",") if b.strip()] if bl_str else []
            ss_str = obj.get("source_seed_ids", "") or ""
            ss_list = [s.strip() for s in ss_str.split(",") if s.strip()] if ss_str else []
            sl_str = obj.get("source_link_ids", "") or ""
            sl_list = [s.strip() for s in sl_str.split(",") if s.strip()] if sl_str else []

            # Client-side filter
            if category and obj.get("category", "").lower() != category.lower():
                continue
            if search:
                q = search.lower()
                searchable = f"{obj.get('title', '')} {obj.get('content', '')} {obj.get('category', '')}".lower()
                if q not in searchable:
                    continue

            articles.append({
                "id": obj.get("_additional", {}).get("id", ""),
                "title": obj.get("title", ""),
                "category": obj.get("category", ""),
                "summary": obj.get("summary", ""),
                "content": obj.get("content", ""),
                "sourceSeedIds": ss_list,
                "sourceLinkIds": sl_list,
                "backlinks": bl_list,
                "status": obj.get("status", "published"),
                "healthScore": obj.get("health_score", 50),
                "createdAt": obj.get("created_at", ""),
                "updatedAt": obj.get("updated_at", ""),
                "lastRegeneratedAt": obj.get("last_regenerated_at", ""),
            })

        if sort == "alpha":
            articles.sort(key=lambda x: x["title"])
        elif sort == "connections":
            articles.sort(key=lambda x: len(x["backlinks"]), reverse=True)
        else:
            articles.sort(key=lambda x: x["updatedAt"], reverse=True)

        return articles

    def update_wiki_article(self, article_id: str, **kwargs) -> bool:
        try:
            self.client.data_object.update(
                class_name="WikiArticle",
                uuid=article_id,
                data_object=kwargs
            )
            return True
        except Exception:
            return False

    def delete_wiki_article(self, article_id: str) -> bool:
        try:
            self.client.data_object.delete(uuid=article_id, class_name="WikiArticle")
            return True
        except Exception:
            return False

# Singleton instance
weaviate_client = WeaviateClient()
