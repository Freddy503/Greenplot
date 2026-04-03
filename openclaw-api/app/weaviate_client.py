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
            if settings.WEAVIATE_CLASS in existing:
                return
        except:
            pass

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
             "summary", "tags", "entities", "backlinks", "domain", "energy", "metadata", "tenant_id"]
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

# Singleton instance
weaviate_client = WeaviateClient()
