# GreenPlot: P1 & P2 Features — Detailed Specs & Implementation

## P1.1 — Backlinks & Connection Detection

### Purpose
When a link or seed is enriched, automatically detect related items and create bidirectional connections. Surface connection counts and linked items throughout the UI.

### How It Works
1. **On enrich:** Take the enriched item's tags, domain, and summary text
2. **Vector similarity:** Query Weaviate for similar items (cosine similarity on embeddings)
3. **Tag overlap:** Also check for shared tags/domain as secondary signal
4. **Store connections:** Save related item IDs as a comma-separated `related_ids` field
5. **Bidirectional:** If A links to B, also add A to B's related_ids

### Backend Changes
- `Link.related_ids` field in Weaviate (text, comma-separated UUIDs)
- `POST /api/v1/links/{id}/detect-connections` — finds and stores related items
- `GET /api/v1/links/{id}/related` — returns related links/seeds with titles
- Auto-trigger on link enrichment

### Frontend Changes
- Link cards show "🔗 N connections" badge (tappable → shows related items)
- Related items panel in link detail view
- Wiki articles show source connections

---

## P1.2 — Garden Health Dashboard

### Purpose
A visual dashboard showing the health of the user's knowledge garden: coverage, gaps, orphans, and suggested actions.

### Metrics
- **Total items:** Links, seeds, wiki articles
- **Enrichment coverage:** % of links that are enriched (have summary + tags)
- **Wiki coverage:** % of enriched items compiled into wiki articles
- **Orphans:** Items with 0 connections
- **Stale items:** Not updated in 30+ days
- **Starred count**
- **Top domains:** Most-represented domains
- **Suggested actions:** "Compile wiki from these 5 links", "These 3 items need enrichment"

### Backend
- `GET /api/v1/wiki/health` (already exists) — returns all metrics
- `GET /api/v1/garden/health` — combined health for links + seeds + wiki

### Frontend
- New section in Wiki tab: "Garden Health" card at top (collapsible)
- Stats bar with key metrics
- Action cards: tappable suggestions that trigger actions
- Progress bars for coverage metrics

---

## P2.1 — Synthesis from Seed Clusters (LLM-Powered)

### Purpose
Auto-generate rich wiki articles from clusters of related seeds/links using LLM. Instead of just concatenating summaries, the LLM synthesizes insights, finds patterns, and writes coherent articles.

### How It Works
1. **Cluster detection:** Group enriched items by domain, shared tags, or vector similarity
2. **Content gathering:** Collect all summaries, titles, tags from cluster items
3. **LLM synthesis:** Send to Nemotron/GPT with prompt: "Write a structured wiki article from these sources. Include: overview, key themes, connections, insights."
4. **Quality check:** Verify article is substantive (>200 words), non-redundant
5. **Store as WikiArticle:** With backlinks to source items

### Backend
- `POST /api/v1/wiki/compile` (already exists) — enhanced with LLM synthesis
- New: uses OpenRouter to call Nemotron for article generation
- Cluster detection: domain-based + tag overlap scoring

### Frontend
- "Compile Wiki" button in Wiki tab → triggers auto-detection + synthesis
- Loading state: "Synthesizing article from 5 sources..."
- New article appears in list on completion

---

## P2.2 — Chat Against Garden

### Purpose
Ask questions against your knowledge garden. The system retrieves relevant seeds/links/wiki articles and generates answers grounded in your own data.

### How It Works
1. **User asks question** in a dedicated Garden Q&A input
2. **Vector search:** Embed the question, search Weaviate for relevant items
3. **Context assembly:** Gather top results (titles + summaries + content snippets)
4. **LLM generation:** Send context + question to LLM for grounded answer
5. **Source citations:** Return answer with links to source items

### Backend
- `POST /api/v1/garden/ask` — takes { question }, returns { answer, sources[] }
  - Embeds question via OpenRouter
  - Searches Weaviate (Link + WikiArticle + IdeaSeed)
  - Calls LLM with retrieved context
  - Returns answer + source references

### Frontend
- "Ask Garden" input in Wiki tab (or dedicated section)
- Chat-like UI: question → answer with source cards
- Source cards are tappable → open the original item
- Follow-up questions keep conversation context
