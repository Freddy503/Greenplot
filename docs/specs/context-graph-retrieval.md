# Context Graph Retrieval — Differentiation Spec

**Status:** v1 positioned; optional Neo4j projection added for traversal after semantic retrieval.

## Product Thesis

Greenplot should not compete as another flat note search app. It should answer with context:

1. Semantic retrieval finds the most relevant starting nodes, even without keyword overlap.
2. The context graph expands from those nodes through explicit links, citations, source lineage, project spaces, workflow history, and shipped outcomes.
3. The user gets an answer plus a next action: connect, cite, draft, spec, build, archive, or revisit.

This keeps Greenplot focused on research, thinking, decisions, specs, and outcomes. Email and meeting ingestion are intentionally out of scope.

## Native Node Types

| Node | Purpose |
| --- | --- |
| Seed | Personal thought, decision, idea, or research note |
| Source | Saved link, article, repo, video, or external reference |
| Paper | Parsed paper with full text and chunks |
| WikiArticle | Synthesized garden knowledge |
| ProjectSpace | Product or project context |
| PRD / Spec | Build-ready artifact from Studio |
| BuildTask | Implementation work or coding-agent handoff |
| Outcome | Shipped PR, merged work, or accepted wiki/project artifact |

## Retrieval Loop

```
User query
  -> hybrid retrieval
     -> vector similarity
     -> BM25 lexical match
     -> graph centrality / recency / user feedback
  -> starting nodes
  -> graph expansion
     -> explicit SeedLink edges
     -> source -> seed lineage
     -> citation edges
     -> project/workflow history
     -> semantic neighbors
  -> ranked context pack
  -> answer or workflow action
```

## Dual Combination

Greenplot now supports the explicit two-system path:

1. **Weaviate starts the query.** Vector similarity and BM25 find the seeds whose meaning is closest to the user question.
2. **Neo4j expands the context.** Starting seed IDs are traversed through `RELATES_TO`, `CONTAINS`, and `SUPPORTS` edges to recover source lineage, project context, decisions, specs, and shipped outcomes.
3. **Postgres remains truth.** Neo4j is a projection of durable Greenplot rows; if Neo4j is disabled or unavailable, the same endpoint falls back to `SeedLink` traversal in Postgres.

### API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/graph/neo4j/status` | Returns enabled/reachable status and target database |
| `POST /api/v1/graph/neo4j/sync` | Projects the current tenant graph into Neo4j |
| `POST /api/v1/context/retrieve` | Runs `query -> Weaviate starts -> Neo4j expands` |

Example request:

```json
{
  "query": "how should the coding agent handle multi-file refactors?",
  "start_limit": 5,
  "graph_hops": 2,
  "context_limit": 80,
  "sync": false
}
```

## Current Implementation Map

- `openclaw-api/app/tool_executor.py` performs hybrid retrieval over vector, BM25, and graph centrality signals.
- `openclaw-api/app/neo4j_graph.py` projects Greenplot seeds and links into Neo4j and expands neighborhoods around semantic starting nodes.
- `openclaw-api/app/main.py` exposes a dual-edge graph payload through `/api/v1/graph`.
- `openclaw-api/app/main.py` exposes Neo4j status/sync plus `/api/v1/context/retrieve`.
- `openclaw-api/app/workflows.py` now adds graph context, relevance reasons, feedback actions, and lineage edges for workflow inbox actions.
- `src/app/api/seeds/graph/route.ts` exposes a multi-signal graph route for the frontend.
- The MCP server makes garden search and paper retrieval available to coding agents.

## Local Neo4j

Neo4j is optional and disabled by default:

```bash
cd openclaw-api
printf '\nNEO4J_ENABLED=true\nNEO4J_PASSWORD=change-this\n' >> .env
docker compose --profile graph up -d neo4j
docker compose up -d api enrichment-worker   # recreate to pick up the new .env (no rebuild — code ships as an image)
```

Then call `POST /api/v1/graph/neo4j/sync` once per tenant, or set `NEO4J_SYNC_ON_RETRIEVE=true` for automatic sync during retrieval. Automatic sync is convenient for development, but explicit sync is safer for production.

## Near-Term Product Work

1. Add a dedicated "Ask with graph context" response view showing starting nodes, traversed context, and next action.
2. Promote graph paths in Workflows: "what led to this?" and "what depends on this?"
3. Add citations and lineage to every generated PRD and wiki draft.
4. Feed user actions back into ranking: More like this, Less like this, Block source, Block topic.
5. Surface project-space context packs for coding agents so builds inherit decisions, constraints, papers, and prior outcomes.

## Non-Goals

- Do not add meetings or email ingestion as the default product story.
- Do not replace the existing Postgres + Weaviate stack; Neo4j is a traversal index, not the primary database.
