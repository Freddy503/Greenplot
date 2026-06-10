# Knowledge Graph v2 — Dual-Edge Visualization — PRD

**Status:** ready (implementation started) · **Owner:** Freddy

## Decision: react-force-graph-2d now, Sigma.js at scale

**We start with `react-force-graph-2d`.** Rationale: Greenplot is React/Next.js; react-force-graph ships Canvas/WebGL rendering with built-in d3-force physics, hover/click APIs, and custom node/link painting — everything the UX patterns below need, in ~50 lines of integration. Sigma.js is the better renderer at 5,000+ nodes but demands graphology data structures, manual layout workers, and more boilerplate; no current Greenplot garden is near that size.

**Trigger to swap to Sigma.js:** any tenant exceeds ~4,000 visible nodes or frame rate drops below 30fps on the median laptop. The payload format below is renderer-agnostic, so swapping is a frontend-only change.

## Problem Alignment

The current d3 SVG graph shows one undifferentiated edge type, no community color, no degree sizing, and turns into a hairball. Users can't tell what *they* connected from what the AI suggests, and can't explore. Weaviate gives us a superpower — explicit links AND semantic similarity — and the graph should show both.

## Solution Summary

A new backend endpoint assembles a **dual-edge payload**: explicit edges from Postgres `seed_links` (the user's brain) and semantic edges from Weaviate nearest-neighbors with certainty > 0.85, top 2 per node (the AI's brain). The frontend renders with react-force-graph-2d applying four UX rules: solid/bold explicit links vs dashed/translucent semantic links, node radius mapped to degree, color by domain group, and hover isolation (dim everything except the hovered node + 1st-degree neighbors).

## System Architecture

**Backend — `GET /api/v1/graph` (main.py):**
1. *Explicit edges:* all `SeedLink` rows for the tenant → `{source, target, type: 'explicit', linkType}`.
2. *Semantic edges:* for up to 300 most recent seeds, batch `nearVector` queries against Weaviate (vectors already stored — no re-embedding); keep top 2 neighbors with certainty > 0.85 that map back to known seed ids; dedupe against explicit pairs → `{source, target, type: 'semantic', strength}`.
3. *Nodes:* `{id, title, group: domain || 'untagged', size: 6 + 2×degree (capped 22), seedType}`.
4. Response cached 5 minutes per tenant in Redis (graph reads are bursty, writes are rare).

**Payload (renderer-agnostic):**
```json
{
  "nodes": [{ "id": "…", "title": "Flow States", "group": "Psychology", "size": 15 }],
  "links": [
    { "source": "…", "target": "…", "type": "explicit" },
    { "source": "…", "target": "…", "type": "semantic", "strength": 0.89 }
  ]
}
```

**Frontend — `react-force-graph-2d`:**
- Explicit links: solid, width 2, `rgba(126,240,168,0.9)`.
- Semantic links: dashed (`lineDash [4,3]`), width 1, `rgba(45,212,191,0.45)`; tooltip shows strength.
- Node paint: filled circle, radius = size, color hashed from group (stable palette), label drawn at zoom > 1.2.
- Hover isolation: on `onNodeHover`, compute 1st-degree set; paint others at 12% opacity.
- Click → existing deep link `/garden?seed={id}`.
- Dark-forest canvas background to match the existing overlay chrome.

## Scope & Capabilities

**In:** dual-edge endpoint, Redis cache, react-force-graph overlay replacing the d3 SVG in the garden, the four UX rules, legend (explicit vs semantic), deep-link click-through.
**Out (v1):** 3D mode, time-travel/history slider, community detection (Louvain) — group=domain is good enough until tags mature; Sigma.js port.

## Delivery Risks & Open Questions

- Weaviate batch neighbor queries for 300 nodes ≈ 300 GraphQL calls — batch via `near_object` per object with limit 3, concurrency 10; cache makes this a once-per-5-min cost.
- Seeds missing from Weaviate (older rows) simply contribute no semantic edges — acceptable degradation.
- Open: include wiki articles + sources as node types in v1.1 (the d3 view had them).

## Milestones

1. `GET /api/v1/graph` + Redis cache + proxy route (1–2 days)
2. react-force-graph overlay with the four UX rules (2 days)
3. Replace d3 KnowledgeGraph in the garden, keep deep links (0.5 day)
