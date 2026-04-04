# Product Cohesion — Glue Layer Implementation Plan

*Generated: 2026-04-04 | Source: [Notion Roadmap](https://www.notion.so/Product-Cohesion-Glue-Layer-Roadmap-338fbc8d40a58137b8f7d1ed58ab28a4)*

---

## Problem Statement
Each feature (Chat, Links, Garden, Cron) works in isolation, but the system lacks connective tissue. You built the pipes but not the circulatory system.

---

## Phase 1: Chat ↔ Knowledge Integration (Priority: 🔴 Critical)

### 1.1 Chat Tool Integration
**Goal:** Make every conversation knowledge-aware.

**Tools to add to Chat:**
- `search_seeds(query)` — Search the Idea Garden from chat
- `get_sources(query)` — Retrieve enriched sources on a topic
- `create_seed(text)` — Create a new seed directly from conversation
- `link_source_to_seed(source_id, seed_id)` — Connect sources to seeds

**Implementation:**
```python
# Backend: New endpoint /api/v1/seeds/search
@app.get("/api/v1/seeds/search")
def search_seeds(q: str, tenant_id: str = Depends(get_tenant)):
    results = weaviate_client.query.get("IdeaSeed").with_near_text({"concepts": [q]}).with_limit(5).do()
    return results
```

**Frontend: AI SDK tool registration**
```typescript
// In chat transport, add seed-search tool
tools: {
  search_seeds: {
    description: "Search the Idea Garden for relevant seeds",
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => fetch(`/api/v1/seeds/search?q=${query}`)
  }
}
```

**Estimate:** 2–3 days

---

## Phase 2: Daily Knowledge Loop (Priority: 🔴 Critical)

### 2.1 Daily Digest with Action
**Goal:** Not just a briefing — create a feedback loop.

**Digest Components:**
1. **3 seeds to review** — Random + decayed (not visited in 14+ days)
2. **2 new sources discovered** — From recent enrichment runs
3. **1 connection missed** — Seeds with shared tags but no explicit link

**Implementation:**
```python
# Cron job: daily at 08:00 UTC
def generate_daily_digest(tenant_id: str):
    stale_seeds = get_seeds_not_visited(tenant_id, days=14, limit=3)
    new_sources = get_recent_sources(tenant_id, hours=24, limit=2)
    missed_connections = find_unlinked_seed_pairs(tenant_id, limit=1)
    
    return format_digest(stale_seeds, new_sources, missed_connections)
```

**Delivery:** Telegram notification + PWA push

**Estimate:** 2 days

---

## Phase 3: Contextual Source Surfacing (Priority: 🟡 Medium)

### 3.1 Source → Chat Surfacing
**Goal:** When relevant, chat should say "you have a source on this."

**Implementation:**
```python
# Before LLM response, check for relevant sources
async def p<RESEND_API_KEY>(user_message: str, tenant_id: str):
    related_sources = await search_sources(user_message, tenant_id)
    if related_sources:
        context += f"\n📎 You have {len(related_sources)} related sources: {format_source_list(related_sources)}"
    return context
```

**Estimate:** 1–2 days

---

## Phase 4: Garden Intelligence (Priority: 🟡 Medium)

### 4.1 Smart Curation
**Goal:** The garden should have an opinion.

**Features:**
- **Trending seeds** — Based on visit frequency + recency score
- **Decay signal** — Visual indicator for seeds not visited in 30+ days
- **Revisit prompts** — "You haven't looked at this in a while"
- **Weekly top 5** — Auto-curated based on engagement

**Implementation:**
```python
# Add to seed schema
class SeedMetadata(BaseModel):
    last_visited: datetime
    visit_count: int
    relevance_score: float  # decay function: e^(-λt) * visit_count
```

**Frontend:** Add "Trending" and "Needs Attention" tabs to Garden view

**Estimate:** 2–3 days

---

## Phase 5: Activity Feed (Priority: 🟢 Nice-to-Have)

### 5.1 System Activity Stream
**Goal:** Show what the system did in the background.

**Feed Items:**
- "🌱 3 seeds enriched with new metadata"
- "🔗 5 new sources discovered from web search"
- "🕸️ New connection found between 'AI Agents' and 'MCP Protocol'"

**Implementation:**
```python
# Activity log schema
class ActivityItem(BaseModel):
    timestamp: datetime
    type: str  # "seed_enriched", "source_discovered", "connection_found"
    description: str
    entity_ids: list[str]
```

**Frontend:** New `/activity` tab or sidebar feed

**Estimate:** 1–2 days

---

## Phase 6: Knowledge Graph Interaction (Priority: 🟢 Nice-to-Have)

### 6.1 Functional Graph
**Goal:** Click a node → take action.

**On Node Click:**
- Open the seed detail panel
- Show related seeds (connected nodes)
- Suggest actions: "Merge with X", "Review sources", "Create task"

**Estimate:** 2–3 days

---

## Summary

| Phase | Priority | Est. Days | Dependencies |
|-------|----------|-----------|--------------|
| 1. Chat Tools | 🔴 Critical | 2–3 | Backend search endpoint |
| 2. Daily Digest | 🔴 Critical | 2 | Cron system, seed metadata |
| 3. Source Surfacing | 🟡 Medium | 1–2 | Source search index |
| 4. Garden Intel | 🟡 Medium | 2–3 | Seed visit tracking |
| 5. Activity Feed | 🟢 Nice | 1–2 | Activity logging |
| 6. Graph Interaction | 🟢 Nice | 2–3 | Graph component refactor |

**Total Estimate:** 10–15 days for critical path (Phases 1–2)

---

## Next Steps
1. ✅ Confirm this plan with Freddy
2. Start Phase 1: Backend seed search endpoint
3. Register search_seeds tool in chat transport
4. Wire up daily digest cron job

