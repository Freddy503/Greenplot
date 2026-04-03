# GreenPlot: Link Collection Hub & Wiki — Detailed Specs

## 1. Hub (`/links`)

### Purpose
A tab where users drop URLs, and the system auto-fetches content, enriches it with LLM summaries, tags it, and surfaces connections. Think of it as the "raw data" intake layer.

### Core Features

#### 1.1 Link Drop Zone
- **Input:** Single URL input field (paste or type)
- **Auto-fetch:** On submit, backend fetches page title, meta description, OG image, and raw text
- **LLM Summary:** Auto-generate a 1-2 sentence summary of the page content
- **Auto-tags:** LLM assigns 2-4 tags based on content (e.g., "ai", "startup", "research")
- **Domain detection:** Extract domain, show favicon, color-code by category (GitHub=gray, YouTube=red, arXiv=purple, etc.)

#### 1.2 Link Card Display
Each link shows:
- Favicon + domain badge (color-coded)
- Title (clickable, opens in new tab)
- 1-2 line LLM summary (collapsible on mobile)
- Tags (clickable — filter by tag on click)
- Added timestamp ("2h ago", "3d ago")
- Star/favorite toggle
- Connection count (# of related links)
- Delete button (with confirmation)

#### 1.3 Search & Filter
- **Search bar:** Filter by title, domain, tags, or summary content
- **Tag pills:** Clickable tag chips for quick filtering
- **Sort:** Recent / Most connected / Starred
- **Filter bar:** All / Starred / Unread (new links not yet viewed)

#### 1.4 Bulk Import
- **Paste multiple URLs** (one per line) → batch add
- **Bookmark import** (JSON export from browser)
- **RSS/Feed auto-add** (future: subscribe to feeds, auto-ingest new articles)

#### 1.5 Enrichment Pipeline Integration
- New links enter the enrichment queue automatically
- Background job: fetch full text → LLM summary → tag assignment → Weaviate indexing
- Status indicator per link: "Enriching..." → "Enriched ✅" → "Connected 🔗"
- Enriched links show related links (backlinks from garden seeds)

### Data Model

```typescript
interface Link {
  id: string                    // UUID
  url: string                   // Original URL
  title: string                 // Page title (auto-fetched)
  summary: string               // LLM-generated summary
  domain: string                // e.g., "github.com"
  favicon: string               // URL to favicon
  tags: string[]                // Auto-assigned tags
  ogImage?: string              // Open Graph image URL
  rawText?: string              // Extracted page text (for search/enrichment)
  status: 'pending' | 'enriching' | 'enriched' | 'connected'
  starred: boolean
  addedAt: string               // ISO timestamp
  enrichedAt?: string           // When enrichment completed
  connectionCount: number       // # of related garden seeds/links
  gardenSeedId?: string         // If converted to a garden seed
}
```

### API Endpoints

```
POST   /api/links              — Add a new link (body: { url })
GET    /api/links              — List links (query: ?search=&tag=&sort=&filter=)
PATCH  /api/links/:id          — Update link (star, tags, title)
DELETE /api/links/:id          — Delete link
POST   /api/links/bulk         — Bulk add (body: { urls: string[] })
GET    /api/links/enrich       — Trigger enrichment for pending links
```

---

## 2. Wiki (`/wiki`)

### Purpose
An LLM-compiled knowledge base. The system takes enriched links and garden seeds, then synthesizes them into structured "wiki articles" with summaries, categories, and backlinks. The user rarely edits directly — the LLM maintains it.

### Core Features

#### 2.1 Article Browser
- **Card grid or list view** (toggle, like Garden)
- **Category sidebar/pills:** Filter by category (Concepts, Projects, Research, Tools, etc.)
- **Search:** Full-text across titles and content
- **Sort:** Recently updated / Most connected / Alphabetical

#### 2.2 Article Structure
Each wiki article contains:
- **Title:** Auto-generated from seed cluster theme
- **Category:** Auto-assigned (LLM determines topic area)
- **Summary:** 1-paragraph overview
- **Content:** Structured markdown (sections, bullet points, key takeaways)
- **Source seeds:** Links back to original seeds/links that contributed
- **Backlinks:** Other wiki articles that reference this one
- **Last updated:** Timestamp of last LLM revision
- **Health score:** Data completeness, connection density

#### 2.3 Article Generation (LLM Pipeline)
Triggered when:
- 3+ enriched seeds share a common domain/theme
- User requests "Compile wiki article from these seeds"
- Scheduled batch job (nightly) finds new clusters

Process:
1. **Cluster detection:** Group seeds by domain/tags/embedding similarity
2. **Content synthesis:** LLM reads all source seeds, generates structured article
3. **Backlink generation:** LLM identifies connections to existing articles, adds backlinks
4. **Category assignment:** LLM classifies article into existing or new category
5. **Quality check:** Verify article is non-empty, non-redundant, well-structured

#### 2.4 Article Detail View
- Full markdown render (headings, lists, bold, links, code blocks)
- Source seeds section: clickable list of contributing seeds
- Backlinks section: linked articles that reference this one
- "Ask about this" button: opens chat with article context pre-loaded
- "Regenerate" button: re-run LLM synthesis on source seeds
- Edit mode (optional): manual text override, marked as "user-edited"

#### 2.5 Wiki Health Dashboard
- **Coverage:** % of enriched seeds that have been compiled into articles
- **Orphans:** Seeds with no wiki article or connections
- **Stale articles:** Haven't been updated in 30+ days
- **Suggested questions:** LLM suggests "what to explore next" based on gaps
- **Connection density:** Average backlinks per article

### Data Model

```typescript
interface WikiArticle {
  id: string                    // UUID
  title: string                 // Article title
  category: string              // e.g., "Concepts", "Projects", "Research"
  summary: string               // 1-paragraph overview
  content: string               // Full markdown content
  sourceSeedIds: string[]       // Garden seeds that contributed
  sourceLinkIds: string[]       // Links that contributed
  backlinks: string[]           // Other wiki article IDs
  status: 'draft' | 'published' | 'stale' | 'user-edited'
  healthScore: number           // 0-100 completeness
  createdAt: string
  updatedAt: string
  lastRegeneratedAt?: string
}
```

### API Endpoints

```
GET    /api/wiki               — List articles (query: ?category=&search=&sort=)
GET    /api/wiki/:id           — Get article detail
POST   /api/wiki/compile       — Trigger article compilation (body: { seedIds? })
POST   /api/wiki/:id/regenerate — Re-run LLM synthesis on article
PATCH  /api/wiki/:id           — Manual edit override
GET    /api/wiki/health        — Wiki health dashboard stats
GET    /api/wiki/suggestions   — LLM-suggested exploration topics
```

---

## 3. Navigation Changes

### Bottom Nav (Mobile)
```
Chat | Garden | Links | Wiki | Settings
```
- Links icon: `link`
- Wiki icon: `auto_stories`

### Header Nav (Desktop)
```
Chat | Garden | Links | Wiki
```
- Same icons, consistent styling

---

## 4. Integration Points

### Link → Garden Pipeline
1. User drops link → Link Collection Hub
2. Auto-enrichment (fetch, summarize, tag)
3. If link has high relevance/energy → auto-create Garden seed
4. Seed goes through existing enrichment pipeline
5. When 3+ related seeds exist → Wiki article auto-compiles

### Wiki ↔ Chat
- "Ask about this article" → opens chat with context pre-loaded
- Chat can reference wiki articles in responses
- "Save to wiki" from chat → creates new wiki article from conversation

### Wiki ↔ Garden
- Wiki articles link back to source seeds
- Garden seed detail shows which wiki articles it contributed to
- Knowledge graph shows wiki articles as high-level nodes connecting seeds

---

## 5. UI/UX Principles

- **Mobile-first:** Both tabs work great on Telegram/PWA mobile
- **Instant feedback:** Optimistic UI, show skeleton while loading
- **Progressive disclosure:** Summary → expand for detail
- **Dark mode native:** Match existing GreenPlot design system (#69f6b8 primary, #01120b bg)
- **Keyboard shortcuts:** Cmd+K for search, Cmd+N for new link
- **Material Symbols:** Consistent icon language with existing tabs
