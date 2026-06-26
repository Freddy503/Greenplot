# Context Graph Retrieval — Differentiation Spec

**Status:** v1 positioned, implementation pieces live across search, graph, workflows, and MCP.

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

## Current Implementation Map

- `openclaw-api/app/tool_executor.py` already performs hybrid retrieval over vector, BM25, and graph centrality signals.
- `openclaw-api/app/main.py` exposes a dual-edge graph payload through `/api/v1/graph`.
- `openclaw-api/app/workflows.py` now adds graph context, relevance reasons, feedback actions, and lineage edges for workflow inbox actions.
- `src/app/api/seeds/graph/route.ts` exposes a multi-signal graph route for the frontend.
- The MCP server makes garden search and paper retrieval available to coding agents.

## Near-Term Product Work

1. Add a dedicated "Ask with graph context" response view showing starting nodes, traversed context, and next action.
2. Promote graph paths in Workflows: "what led to this?" and "what depends on this?"
3. Add citations and lineage to every generated PRD and wiki draft.
4. Feed user actions back into ranking: More like this, Less like this, Block source, Block topic.
5. Surface project-space context packs for coding agents so builds inherit decisions, constraints, papers, and prior outcomes.

## Non-Goals

- Do not add meetings or email ingestion as the default product story.
- Do not claim Neo4j unless Greenplot actually ships a Neo4j-backed graph service.
- Do not replace the existing Postgres + Weaviate stack before the product requires it.
