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
                {"name": "metadata", "dataType": ["text"]},
                {"name": "created_at", "dataType": ["date"]},
                {"name": "image_url", "dataType": ["text"]}
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
        uuid = self.client.data.object.create(
            class_name=settings.WEAVIATE_CLASS,
            data_object=obj,
            vector=embedding
        )
        return uuid

    def search_seeds(self, tenant_id: str, embedding: list, limit: int = 10):
        nearVector = {"vector": embedding}
        query = self.client.query.get(
            settings.WEAVIATE_CLASS,
            ["title", "content", "metadata", "image_url", "created_at", "thought_id"]
        ).with_near_vector(nearVector).with_where({
            "path": ["tenant_id"],
            "operator": "Equal",
            "valueText": tenant_id
        }).with_limit(limit)
        result = query.do()
        return result.get("data", {}).get("Get", {}).get(settings.WEAVIATE_CLASS, [])

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
