from __future__ import annotations

import logging
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Seed, SeedLink, User

logger = logging.getLogger(__name__)

try:
    from neo4j import GraphDatabase
except Exception:  # pragma: no cover - dependency is optional at runtime
    GraphDatabase = None  # type: ignore[assignment]


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _tags(meta: dict[str, Any]) -> list[str]:
    value = meta.get("tags") or []
    if isinstance(value, list):
        return [str(tag).strip() for tag in value if str(tag).strip()]
    return [tag.strip() for tag in str(value).split(",") if tag.strip()]


def _seed_payload(seed: Seed) -> dict[str, Any]:
    meta = seed.seed_metadata if isinstance(seed.seed_metadata, dict) else {}
    return {
        "id": str(seed.id),
        "tenant_id": str(seed.tenant_id),
        "title": seed.title or "Untitled",
        "summary": str(meta.get("summary") or (seed.content or "")[:240]),
        "seed_type": seed.seed_type or meta.get("seed_type") or "idea",
        "domain": str(meta.get("domain") or "untagged"),
        "tags": _tags(meta),
        "embedding_ref": seed.embedding_ref or "",
        "created_at": _iso(seed.created_at),
        "updated_at": _iso(getattr(seed, "updated_at", None)),
        "product_id": str(meta.get("product_id") or ""),
        "pillar_id": str(meta.get("pillar_id") or ""),
        "source_paper_id": str(meta.get("source_paper_id") or ""),
    }


def _link_payload(link: SeedLink) -> dict[str, Any]:
    return {
        "id": str(link.id),
        "source": str(link.source_seed_id),
        "target": str(link.target_seed_id),
        "link_type": link.link_type or "related",
        "confidence": int(link.confidence or 0),
        "created_at": _iso(link.created_at),
    }


@dataclass
class Neo4jStatus:
    enabled: bool
    available: bool
    message: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "available": self.available,
            "message": self.message,
            "uri": settings.NEO4J_URI if self.enabled else "",
            "database": settings.NEO4J_DATABASE if self.enabled else "",
        }


class Neo4jGraphService:
    """Optional Neo4j projection for Greenplot's context graph.

    Weaviate still performs semantic retrieval. Postgres remains the durable
    source of truth. Neo4j stores a per-tenant projection for traversal queries.
    """

    def __init__(self) -> None:
        self._driver = None

    def enabled(self) -> bool:
        return bool(settings.NEO4J_ENABLED and settings.NEO4J_PASSWORD)

    def _get_driver(self):
        if not self.enabled():
            return None
        if GraphDatabase is None:
            raise RuntimeError("neo4j Python driver is not installed")
        if self._driver is None:
            self._driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            )
        return self._driver

    def status(self) -> Neo4jStatus:
        if not self.enabled():
            return Neo4jStatus(False, False, "Neo4j is disabled or NEO4J_PASSWORD is missing")
        try:
            driver = self._get_driver()
            with driver.session(database=settings.NEO4J_DATABASE) as session:
                session.run("RETURN 1 AS ok").single()
            return Neo4jStatus(True, True, "Neo4j is reachable")
        except Exception as exc:
            logger.warning("Neo4j status check failed: %s", exc)
            return Neo4jStatus(True, False, str(exc))

    def ensure_schema(self) -> None:
        driver = self._get_driver()
        if driver is None:
            return
        statements = [
            "CREATE CONSTRAINT greenplot_node_id IF NOT EXISTS FOR (n:GreenplotNode) REQUIRE n.id IS UNIQUE",
            "CREATE INDEX greenplot_tenant IF NOT EXISTS FOR (n:GreenplotNode) ON (n.tenant_id)",
            "CREATE INDEX greenplot_seed_type IF NOT EXISTS FOR (n:GreenplotNode) ON (n.seed_type)",
            "CREATE INDEX greenplot_domain IF NOT EXISTS FOR (n:GreenplotNode) ON (n.domain)",
        ]
        with driver.session(database=settings.NEO4J_DATABASE) as session:
            for statement in statements:
                session.run(statement)

    def sync_tenant(self, db: Session, user: User, limit: int | None = None) -> dict[str, Any]:
        """Project current seeds and SeedLinks into Neo4j for one tenant."""
        if not self.enabled():
            return {"status": "disabled", "message": "Neo4j is not enabled", "nodes": 0, "relationships": 0}

        limit = min(limit or settings.NEO4J_MAX_SYNC_SEEDS, settings.NEO4J_MAX_SYNC_SEEDS)
        self.ensure_schema()

        seeds = (
            db.query(Seed)
            .filter(
                Seed.tenant_id == user.tenant_id,
                (Seed.archived == False) | (Seed.archived == None),  # noqa: E712
            )
            .order_by(Seed.created_at.desc())
            .limit(limit)
            .all()
        )
        seed_ids = [seed.id for seed in seeds]
        links = []
        if seed_ids:
            links = (
                db.query(SeedLink)
                .filter(
                    SeedLink.source_seed_id.in_(seed_ids),
                    SeedLink.target_seed_id.in_(seed_ids),
                )
                .all()
            )

        node_payloads = [_seed_payload(seed) for seed in seeds]
        relationship_payloads = [_link_payload(link) for link in links]

        # Semantic edges — project Weaviate nearest-neighbors so Neo4j has a graph
        # to traverse even when explicit SeedLinks are sparse (which is the common
        # case). Uses the stored-vector path (no re-embedding), certainty-gated,
        # tagged source="semantic" so it stays distinct from the user's own links.
        semantic_payloads: list[dict[str, Any]] = []
        try:
            from app.weaviate_client import weaviate_client

            tenant_str = str(user.tenant_id)
            ref_to_id = {s.embedding_ref: str(s.id) for s in seeds if s.embedding_ref}
            seen_pairs: set[tuple[str, str]] = set()
            certainty_min = settings.NEO4J_SEMANTIC_CERTAINTY_MIN
            for seed in seeds:
                if not seed.embedding_ref:
                    continue
                for nb in weaviate_client.near_object_seeds(tenant_str, seed.embedding_ref, limit=4):
                    if float(nb.get("certainty") or 0) < certainty_min:
                        continue
                    other = ref_to_id.get(nb.get("id"))
                    if not other or other == str(seed.id):
                        continue
                    pair = tuple(sorted((str(seed.id), other)))
                    if pair in seen_pairs:
                        continue
                    seen_pairs.add(pair)
                    semantic_payloads.append({
                        "id": f"sem:{pair[0]}:{pair[1]}",
                        "source": pair[0],
                        "target": pair[1],
                        "certainty": round(float(nb["certainty"]), 3),
                    })
        except Exception as exc:  # pragma: no cover - semantic edges are best-effort
            logger.warning("Neo4j semantic edge projection failed: %s", exc)

        driver = self._get_driver()
        with driver.session(database=settings.NEO4J_DATABASE) as session:
            session.run(
                """
                UNWIND $nodes AS row
                MERGE (n:GreenplotNode:Seed {id: row.id})
                SET n.tenant_id = row.tenant_id,
                    n.title = row.title,
                    n.summary = row.summary,
                    n.seed_type = row.seed_type,
                    n.domain = row.domain,
                    n.tags = row.tags,
                    n.embedding_ref = row.embedding_ref,
                    n.created_at = row.created_at,
                    n.updated_at = row.updated_at,
                    n.product_id = row.product_id,
                    n.pillar_id = row.pillar_id,
                    n.source_paper_id = row.source_paper_id
                """,
                nodes=node_payloads,
            )
            session.run(
                """
                UNWIND $relationships AS row
                MATCH (a:GreenplotNode {id: row.source, tenant_id: $tenant_id})
                MATCH (b:GreenplotNode {id: row.target, tenant_id: $tenant_id})
                MERGE (a)-[r:RELATES_TO {id: row.id}]->(b)
                SET r.tenant_id = $tenant_id,
                    r.link_type = row.link_type,
                    r.confidence = row.confidence,
                    r.created_at = row.created_at,
                    r.source = "seed_link"
                """,
                relationships=relationship_payloads,
                tenant_id=str(user.tenant_id),
            )
            session.run(
                """
                UNWIND $semantic AS row
                MATCH (a:GreenplotNode {id: row.source, tenant_id: $tenant_id})
                MATCH (b:GreenplotNode {id: row.target, tenant_id: $tenant_id})
                MERGE (a)-[r:RELATES_TO {id: row.id}]->(b)
                SET r.tenant_id = $tenant_id,
                    r.link_type = "semantic",
                    r.confidence = row.certainty,
                    r.source = "semantic"
                """,
                semantic=semantic_payloads,
                tenant_id=str(user.tenant_id),
            )
            session.run(
                """
                MATCH (n:GreenplotNode {tenant_id: $tenant_id})
                WHERE n.product_id <> ""
                MATCH (p:GreenplotNode {id: n.product_id, tenant_id: $tenant_id})
                MERGE (p)-[r:CONTAINS]->(n)
                SET r.tenant_id = $tenant_id, r.source = "metadata"
                """,
                tenant_id=str(user.tenant_id),
            )
            session.run(
                """
                MATCH (n:GreenplotNode {tenant_id: $tenant_id})
                WHERE n.source_paper_id <> ""
                MATCH (p:GreenplotNode {id: n.source_paper_id, tenant_id: $tenant_id})
                MERGE (p)-[r:SUPPORTS]->(n)
                SET r.tenant_id = $tenant_id, r.source = "metadata"
                """,
                tenant_id=str(user.tenant_id),
            )

        return {
            "status": "ok",
            "nodes": len(node_payloads),
            "relationships": len(relationship_payloads),
            "semantic_relationships": len(semantic_payloads),
            "limit": limit,
        }

    def expand(self, tenant_id: str, seed_ids: list[str], hops: int = 2, limit: int = 80) -> dict[str, Any]:
        """Expand around starting seed IDs in Neo4j."""
        if not self.enabled():
            return {"status": "disabled", "nodes": [], "relationships": [], "paths": []}
        if not seed_ids:
            return {"status": "empty", "nodes": [], "relationships": [], "paths": []}

        hops = max(1, min(int(hops or 2), 3))
        limit = max(1, min(int(limit or 80), 200))
        query = f"""
        MATCH (start:GreenplotNode {{tenant_id: $tenant_id}})
        WHERE start.id IN $seed_ids
        OPTIONAL MATCH path=(start)-[*1..{hops}]-(neighbor:GreenplotNode {{tenant_id: $tenant_id}})
        WITH start, path
        LIMIT $limit
        RETURN collect(DISTINCT properties(start)) AS starts,
               collect(path) AS paths
        """
        driver = self._get_driver()
        with driver.session(database=settings.NEO4J_DATABASE) as session:
            record = session.run(query, tenant_id=tenant_id, seed_ids=seed_ids, limit=limit).single()
        if not record:
            return {"status": "empty", "nodes": [], "relationships": [], "paths": []}

        nodes: dict[str, dict[str, Any]] = {}
        relationships: dict[str, dict[str, Any]] = {}
        path_summaries: list[list[str]] = []
        for start in record.get("starts") or []:
            if start.get("id"):
                nodes[start["id"]] = start
        for path in record.get("paths") or []:
            if path is None:
                continue
            path_ids = []
            for node in path.nodes:
                props = dict(node)
                node_id = props.get("id")
                if node_id:
                    nodes[node_id] = props
                    path_ids.append(node_id)
            for rel in path.relationships:
                props = dict(rel)
                rel_id = props.get("id") or f"{rel.start_node.get('id')}:{rel.type}:{rel.end_node.get('id')}"
                relationships[rel_id] = {
                    "id": rel_id,
                    "source": rel.start_node.get("id"),
                    "target": rel.end_node.get("id"),
                    "type": rel.type,
                    "link_type": props.get("link_type") or rel.type.lower(),
                    "confidence": props.get("confidence") or 0,
                    "provenance": props.get("source") or "neo4j",
                }
            if path_ids:
                path_summaries.append(path_ids)

        return {
            "status": "ok",
            "nodes": list(nodes.values())[:limit],
            "relationships": list(relationships.values())[:limit],
            "paths": path_summaries[:limit],
            "hops": hops,
        }


neo4j_graph = Neo4jGraphService()


def postgres_expand(db: Session, user: User, seed_ids: list[str], hops: int = 2, limit: int = 80) -> dict[str, Any]:
    """Fallback traversal over Postgres SeedLink rows."""
    if not seed_ids:
        return {"status": "empty", "nodes": [], "relationships": [], "paths": []}

    hops = max(1, min(int(hops or 2), 3))
    limit = max(1, min(int(limit or 80), 200))
    tenant_id = user.tenant_id

    parsed_ids: list[uuid.UUID] = []
    for seed_id in seed_ids:
        try:
            parsed_ids.append(uuid.UUID(str(seed_id)))
        except (TypeError, ValueError):
            continue

    seen_ids = set(parsed_ids)
    frontier = deque((seed_id, 0) for seed_id in parsed_ids)
    relationships: dict[str, dict[str, Any]] = {}

    while frontier and len(seen_ids) < limit:
        current, depth = frontier.popleft()
        if depth >= hops:
            continue
        rows = (
            db.query(SeedLink)
            .join(Seed, or_(Seed.id == SeedLink.source_seed_id, Seed.id == SeedLink.target_seed_id))
            .filter(
                Seed.tenant_id == tenant_id,
                or_(SeedLink.source_seed_id == current, SeedLink.target_seed_id == current),
            )
            .limit(limit)
            .all()
        )
        for link in rows:
            source_id = link.source_seed_id
            target_id = link.target_seed_id
            source = str(source_id)
            target = str(target_id)
            relationships[str(link.id)] = {
                "id": str(link.id),
                "source": source,
                "target": target,
                "type": "RELATES_TO",
                "link_type": link.link_type or "related",
                "confidence": link.confidence or 0,
                "provenance": "postgres_seed_link",
            }
            for candidate in (source_id, target_id):
                if candidate not in seen_ids and len(seen_ids) < limit:
                    seen_ids.add(candidate)
                    frontier.append((candidate, depth + 1))

    seeds = (
        db.query(Seed)
        .filter(
            Seed.tenant_id == tenant_id,
            Seed.id.in_(list(seen_ids)),
        )
        .all()
    )
    return {
        "status": "ok",
        "nodes": [_seed_payload(seed) for seed in seeds],
        "relationships": list(relationships.values())[:limit],
        "paths": [],
        "hops": hops,
    }
