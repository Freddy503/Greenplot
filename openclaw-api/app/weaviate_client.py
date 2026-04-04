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
                    {"name": "related_ids", "dataType": ["text"]},
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

        # Create GreenPlotNode class (unified node type)
        if "GreenPlotNode" not in existing:
            node_class = {
                "class": "GreenPlotNode",
                "description": "Unified node: seed, link, wiki, or chat-insight. One store, multiple views.",
                "properties": [
                    # Core discriminated fields
                    {"name": "node_type", "dataType": ["text"]},  # seed | link | wiki | chat-insight
                    {"name": "tenant_id", "dataType": ["text"]},
                    {"name": "user_id", "dataType": ["text"]},

                    # Universal fields (all types)
                    {"name": "title", "dataType": ["text"]},
                    {"name": "content", "dataType": ["text"]},
                    {"name": "summary", "dataType": ["text"]},
                    {"name": "domain", "dataType": ["text"]},
                    {"name": "tags", "dataType": ["text"]},
                    {"name": "source", "dataType": ["text"]},  # chat | hub | voice | auto
                    {"name": "status", "dataType": ["text"]},  # raw | enriched | compiled
                    {"name": "url", "dataType": ["text"]},

                    # Connections (JSON array of connected node IDs)
                    {"name": "connections", "dataType": ["text"]},
                    {"name": "backlinks", "dataType": ["text"]},

                    # Type-specific (JSON blob)
                    {"name": "data", "dataType": ["text"]},

                    # Enrichment
                    {"name": "entities", "dataType": ["text"]},
                    {"name": "energy", "dataType": ["text"]},

                    # Metadata
                    {"name": "starred", "dataType": ["boolean"]},
                    {"name": "favicon", "dataType": ["text"]},
                    {"name": "image_url", "dataType": ["text"]},
                    {"name": "created_at", "dataType": ["date"]},
                    {"name": "updated_at", "dataType": ["date"]},
                ],
                "vectorIndexConfig": {
                    "vector": {"dimensions": 1024, "distance": "cosine"}
                }
            }
            self.client.schema.create_class(node_class)

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
        now = dt.utcnow().isoformat() + 'Z'
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
            "last_regenerated_at": now,
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

    # ── GreenPlotNode CRUD (Unified) ──────────────────

    def add_node(self, node_type: str, tenant_id: str, user_id: str,
                 title: str, content: str = "", summary: str = "",
                 domain: str = "", tags: str = "", source: str = "chat",
                 status: str = "raw", url: str = "", connections: list = None,
                 backlinks: list = None, entities: str = "", energy: str = "",
                 starred: bool = False, favicon: str = "", image_url: str = "",
                 data: dict = None, embedding: list = None,
                 created_at: str = None) -> str:
        """Create a unified node (seed, link, wiki, or chat-insight)."""
        from datetime import datetime as dt
        now = dt.utcnow().isoformat() + 'Z'
        obj = {
            "node_type": node_type,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "title": title,
            "content": content,
            "summary": summary,
            "domain": domain,
            "tags": tags,
            "source": source,
            "status": status,
            "url": url,
            "connections": json.dumps(connections or []),
            "backlinks": json.dumps(backlinks or []),
            "entities": entities,
            "energy": energy,
            "starred": starred,
            "favicon": favicon,
            "image_url": image_url or "",
            "data": json.dumps(data or {}),
            "created_at": created_at or now,
            "updated_at": now,
        }
        if embedding:
            return self.client.data_object.create(
                class_name="GreenPlotNode", data_object=obj, vector=embedding
            )
        return self.client.data_object.create(class_name="GreenPlotNode", data_object=obj)

    def get_nodes(self, tenant_id: str, node_type: str = None,
                  search: str = None, limit: int = 50) -> list[dict]:
        """Get unified nodes, optionally filtered by type."""
        where = {"path": ["tenant_id"], "operator": "Equal", "valueText": tenant_id}
        props = [
            "node_type", "title", "content", "summary", "domain", "tags",
            "source", "status", "url", "connections", "backlinks",
            "entities", "energy", "starred", "favicon", "image_url",
            "data", "created_at", "updated_at"
        ]
        query = self.client.query.get("GreenPlotNode", props).with_where(where).with_limit(limit)

        if node_type:
            query = query.with_where({
                "operator": "And",
                "operands": [
                    where,
                    {"path": ["node_type"], "operator": "Equal", "valueText": node_type}
                ]
            })

        result = query.do()
        objects = result.get("data", {}).get("Get", {}).get("GreenPlotNode", []) or []

        nodes = []
        for obj in objects:
            # Client-side search
            if search:
                q = search.lower()
                searchable = f"{obj.get('title', '')} {obj.get('content', '')} {obj.get('summary', '')} {obj.get('domain', '')} {obj.get('tags', '')}".lower()
                if q not in searchable:
                    continue

            tags_str = obj.get("tags", "") or ""
            tag_list = [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else []
            connections_raw = obj.get("connections", "[]") or "[]"
            connections_list = json.loads(connections_raw) if isinstance(connections_raw, str) else connections_raw
            backlinks_raw = obj.get("backlinks", "[]") or "[]"
            backlinks_list = json.loads(backlinks_raw) if isinstance(backlinks_raw, str) else backlinks_raw
            data_raw = obj.get("data", "{}") or "{}"
            data_obj = json.loads(data_raw) if isinstance(data_raw, str) else data_raw

            nodes.append({
                "id": obj.get("_additional", {}).get("id", ""),
                "node_type": obj.get("node_type", ""),
                "title": obj.get("title", ""),
                "content": obj.get("content", ""),
                "summary": obj.get("summary", ""),
                "domain": obj.get("domain", ""),
                "tags": tag_list,
                "source": obj.get("source", ""),
                "status": obj.get("status", "raw"),
                "url": obj.get("url", ""),
                "connections": connections_list,
                "backlinks": backlinks_list,
                "entities": obj.get("entities", ""),
                "energy": obj.get("energy", ""),
                "starred": obj.get("starred", False),
                "favicon": obj.get("favicon", ""),
                "image_url": obj.get("image_url", ""),
                "data": data_obj,
                "created_at": obj.get("created_at", ""),
                "updated_at": obj.get("updated_at", ""),
            })

        nodes.sort(key=lambda x: x["created_at"], reverse=True)
        return nodes

    def search_nodes(self, tenant_id: str, embedding: list, node_type: str = None,
                     limit: int = 10) -> list[dict]:
        """Vector search across unified nodes."""
        where = {"path": ["tenant_id"], "operator": "Equal", "valueText": tenant_id}
        if node_type:
            where = {
                "operator": "And",
                "operands": [
                    {"path": ["tenant_id"], "operator": "Equal", "valueText": tenant_id},
                    {"path": ["node_type"], "operator": "Equal", "valueText": node_type}
                ]
            }

        query = self.client.query.get("GreenPlotNode", [
            "node_type", "title", "content", "summary", "domain", "tags",
            "url", "connections", "data", "created_at"
        ]).with_near_vector({"vector": embedding}).with_where(where).with_additional(
            ["id", "certainty"]
        ).with_limit(limit)

        result = query.do()
        objects = result.get("data", {}).get("Get", {}).get("GreenPlotNode", []) or []

        return [{
            "id": obj.get("_additional", {}).get("id", ""),
            "node_type": obj.get("node_type", ""),
            "title": obj.get("title", ""),
            "content": obj.get("content", ""),
            "summary": obj.get("summary", ""),
            "domain": obj.get("domain", ""),
            "tags": obj.get("tags", ""),
            "url": obj.get("url", ""),
            "certainty": obj.get("_additional", {}).get("certainty", 0.0),
            "created_at": obj.get("created_at", ""),
        } for obj in objects]

    def update_node(self, node_id: str, **kwargs) -> bool:
        """Update a unified node."""
        # Serialize list/dict fields to JSON strings
        for key in ("connections", "backlinks", "data"):
            if key in kwargs and isinstance(kwargs[key], (list, dict)):
                kwargs[key] = json.dumps(kwargs[key])
        try:
            self.client.data_object.update(
                class_name="GreenPlotNode", uuid=node_id, data_object=kwargs
            )
            return True
        except Exception:
            return False

    def delete_node(self, node_id: str) -> bool:
        try:
            self.client.data_object.delete(uuid=node_id, class_name="GreenPlotNode")
            return True
        except Exception:
            return False

    def add_node_connection(self, node_id: str, target_id: str) -> bool:
        """Add a bidirectional connection between two nodes."""
        try:
            # Get current connections for source node
            obj = self.client.data_object.get(uuid=node_id, class_name="GreenPlotNode")
            current = json.loads(obj.get("connections", "[]") or "[]")
            if target_id not in current:
                current.append(target_id)
                self.client.data_object.update(
                    class_name="GreenPlotNode", uuid=node_id,
                    data_object={"connections": json.dumps(current)}
                )
            # Reverse connection on target
            target = self.client.data_object.get(uuid=target_id, class_name="GreenPlotNode")
            target_conns = json.loads(target.get("connections", "[]") or "[]")
            if node_id not in target_conns:
                target_conns.append(node_id)
                self.client.data_object.update(
                    class_name="GreenPlotNode", uuid=target_id,
                    data_object={"connections": json.dumps(target_conns)}
                )
            return True
        except Exception:
            return False

    def migrate_to_unified(self, tenant_id: str, user_id: str) -> dict:
        """Migrate existing seeds, links, wiki articles to GreenPlotNode class."""
        stats = {"seeds": 0, "links": 0, "wiki": 0, "errors": 0}

        # Migrate seeds
        try:
            seeds = self.search_seeds(tenant_id, embedding=[0.0] * 1024, limit=200)
            for seed in seeds:
                try:
                    self.add_node(
                        node_type="seed", tenant_id=tenant_id, user_id=user_id,
                        title=seed.get("title", "Untitled"),
                        content=seed.get("content", ""),
                        summary=seed.get("summary", ""),
                        domain=seed.get("domain", ""),
                        tags=seed.get("tags", ""),
                        source=seed.get("source", "chat"),
                        status="enriched" if seed.get("summary") else "raw",
                        url=seed.get("url", ""),
                        entities=seed.get("entities", ""),
                        energy=seed.get("energy", ""),
                    )
                    stats["seeds"] += 1
                except Exception:
                    stats["errors"] += 1
        except Exception:
            pass

        # Migrate links
        try:
            links = self.get_links(tenant_id, limit=200)
            for link in links:
                try:
                    self.add_node(
                        node_type="link", tenant_id=tenant_id, user_id=user_id,
                        title=link.get("title", link.get("url", "")),
                        summary=link.get("summary", ""),
                        domain=link.get("domain", ""),
                        tags=",".join(link.get("tags", [])) if isinstance(link.get("tags"), list) else link.get("tags", ""),
                        source="hub",
                        status=link.get("status", "pending"),
                        url=link.get("url", ""),
                        starred=link.get("starred", False),
                        favicon=link.get("favicon", ""),
                        data={"og_image": link.get("og_image", ""), "connection_count": link.get("connection_count", 0)},
                    )
                    stats["links"] += 1
                except Exception:
                    stats["errors"] += 1
        except Exception:
            pass

        # Migrate wiki articles
        try:
            articles = self.get_wiki_articles(tenant_id, limit=200)
            for article in articles:
                try:
                    self.add_node(
                        node_type="wiki", tenant_id=tenant_id, user_id=user_id,
                        title=article.get("title", ""),
                        content=article.get("content", ""),
                        summary=article.get("summary", ""),
                        domain=article.get("category", ""),
                        source="auto",
                        status="compiled",
                        backlinks=article.get("backlinks", []),
                        data={
                            "source_seed_ids": article.get("sourceSeedIds", []),
                            "source_link_ids": article.get("sourceLinkIds", []),
                            "health_score": article.get("healthScore", 50),
                        },
                    )
                    stats["wiki"] += 1
                except Exception:
                    stats["errors"] += 1
        except Exception:
            pass

        return stats

    def get_seeds_by_tenant(self, tenant_id: str, limit: int = 50) -> list[dict]:
        """Get all seeds for a tenant (no vector search, just tenant filter)."""
        where = {"path": ["tenant_id"], "operator": "Equal", "valueText": tenant_id}
        query = self.client.query.get(settings.WEAVIATE_CLASS, [
            "title", "text", "source", "url", "created", "notion_id",
            "summary", "tags", "entities", "backlinks", "domain", "energy", "tenant_id"
        ]).with_where(where).with_limit(limit)
        result = query.do()
        objects = result.get("data", {}).get("Get", {}).get(settings.WEAVIATE_CLASS, []) or []

        seeds = []
        for o in objects:
            metadata = o.get("metadata") or {}
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except:
                    metadata = {}
            seeds.append({
                "id": o.get("_additional", {}).get("id", ""),
                "title": o.get("title", ""),
                "content": o.get("text", ""),
                "created_at": o.get("created", ""),
                "source": o.get("source", ""),
                "url": o.get("url", ""),
                "summary": o.get("summary") or metadata.get("summary", ""),
                "tags": o.get("tags") or metadata.get("tags", ""),
                "entities": o.get("entities") or metadata.get("entities", ""),
                "backlinks": o.get("backlinks") or metadata.get("backlinks", ""),
                "domain": o.get("domain") or metadata.get("domain", ""),
                "energy": o.get("energy") or metadata.get("energy", ""),
            })
        return seeds

# Singleton instance
weaviate_client = WeaviateClient()
