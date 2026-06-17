# Research sources — what to add beyond arXiv + Exa

**Status:** recommendation (2026-06-16) · **Owner:** Freddy
**Goal:** widen the Research Digest's candidate pool with sources that are *easy*
to integrate (free / no-key / simple JSON or RSS) and that complement, not
duplicate, what we already pull.

## What we have today
- **arXiv** — full papers (HTML → PDF fallback) via `paper_pipeline.fetch_paper`.
  Covers CS/AI/physics/math preprints. This is the backbone.
- **Exa** — web search + content extraction (`briefings.fetch_web_search`,
  `enricher_v2`). General discovery, keyed to user themes; also reaches
  publisher pages.
- **open-meteo** — weather only (not research).

So today's research signal = "arXiv preprints + whatever Exa surfaces on the
open web." Gaps: peer-reviewed/published work (Nature/Science), biomedical &
life-sciences, and the *industry/community pulse* (what practitioners are
actually talking about and shipping).

## The integration seam
Every source below only needs to become a **candidate generator**: return a list
of `{title, url, abstract, source}`, then hand each item to the *existing*
`fetch_paper → parse → chunk → index → compile_fulltext` pipeline. Discovery is
the only new code; storage, full-text compilation (just shipped for MCP), and
backlinking are already done. For paywalled sources we store **title + abstract**
(metadata-only); for OA sources we get full text for free.

---

## Tier 1 — add these first (no API key, trivial, high signal)

### 1. OpenAlex — the academic complement to arXiv  ⭐ top pick
- **What it adds:** 240M+ scholarly works across *every* publisher and field —
  including **Nature, Science, Cell, etc.** (metadata + abstract; full text only
  when OA). Fills the "peer-reviewed / published" gap arXiv can't.
- **Ease:** REST JSON, **no key**. "Polite pool" = just send your email in the
  `mailto` param for higher limits (100k/day). Rich filtering by concept, date,
  open-access status, citations.
- **Example (new AI works this week, OA-first):**
  `https://api.openalex.org/works?filter=concepts.id:C154945302,from_publication_date:2026-06-09,is_oa:true&sort=cited_by_count:desc&mailto=contact@example.com`
- **Full text:** `open_access.oa_url` when `is_oa` → feed straight into the
  paper pipeline. Otherwise title+abstract seed (still useful, links to DOI).
- **Maps to themes:** any (concepts taxonomy covers law, medicine, sustainability,
  design — not just CS).

### 2. Hacker News (Algolia Search API) — the tech/industry pulse  ⭐ top pick
- **What it adds:** what builders are reading & discussing *right now* — releases,
  essays, post-mortems, launches. The single best "is this actually mattering in
  practice" signal, and exactly the kind of thing the user named.
- **Ease:** **no key**, one GET, date+keyword+points filters, instant.
- **Example (front-page-worthy stories on a theme, last 24h):**
  `https://hn.algolia.com/api/v1/search_by_date?query=AI%20agents&tags=story&numericFilters=points%3E80,created_at_i%3E<unix_ts>`
- **Full text:** each hit has a `url` → Exa/`fetch_paper` text extraction already
  handles arbitrary article pages. The HN discussion itself (`objectID` →
  `/items/{id}`) is great extra context.
- **Note:** dedupe by URL against existing seeds; gate on `points`/`num_comments`
  so it's signal, not noise.

### 3. RSS via `feedparser` — universal, covers Nature & eng blogs
- **What it adds:** a generic feed reader unlocks dozens of curated sources with
  one dependency — **Nature journal feeds** (`https://www.nature.com/nature.rss`
  and per-subject feeds), MIT Tech Review, Quanta, big company eng/research blogs
  (DeepMind, OpenAI, Anthropic, Meta AI), Papers-with-Code, etc.
- **Ease:** `pip install feedparser`, ~5 lines. **No keys.** Per-source allowlist
  the user can curate in settings later.
- **Full text:** feeds give title+summary; follow `link` through the existing
  extractor for the body when the page is open.
- **Why it matters:** this is how we get **Nature** cheaply — the RSS gives the
  headline + abstract; full text stays paywalled (store metadata, link out).

---

## Tier 2 — strong, slightly more setup

### 4. Europe PMC + bioRxiv/medRxiv — life sciences & medicine (OA full text)
- **Adds:** biomedical/life-sciences coverage for the Medicine & Sustainability
  themes; **open-access full text** for a large subset.
- **Ease:** Europe PMC REST, **no key**
  (`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=...&format=json`);
  bioRxiv has a plain JSON details API. Full text via OA XML → clean to markdown.

### 5. Semantic Scholar (Graph API) — citations, influence, recommendations
- **Adds:** "papers like the ones in your garden" (recommendations endpoint),
  citation counts, influential-citation signal — great for ranking candidates
  and for the backlinker.
- **Ease:** JSON; works keyless at low volume, **free key** lifts limits. Clean.
- **Example:** `https://api.semanticscholar.org/graph/v1/paper/search?query=...&fields=title,abstract,openAccessPdf,citationCount`

### 6. Crossref — DOI/metadata for *any* publisher
- **Adds:** authoritative metadata for published articles (incl. Nature/Science)
  by DOI/query; good for enriching/deduping and resolving a paywalled item to a
  proper citation. **No key**, polite pool via `mailto`.

---

## Tier 3 — high value but more work / noisier

### 7. Reddit (r/MachineLearning, r/LocalLLaMA, r/science, …)
- **Adds:** practitioner sentiment, "what's overhyped," tooling chatter.
- **Cost:** now needs **OAuth app + User-Agent** (the old anonymous `.json` route
  is rate-limited/blocked). Noisier — needs score/flair gating. Worth it, but
  not "easy" like Tier 1.

### 8. GitHub Search API — tools & releases
- **Adds:** trending repos / new releases on a theme (`/search/repositories?q=
  topic:llm+pushed:>2026-06-01&sort=stars`). We already store a GitHub token for
  spec-shipping, so auth is half-done. Great for the "what to build with" angle.

### 9. Papers with Code, CORE, DOAJ, Lobsters
- Niche but free: PwC links papers↔code+SOTA; CORE = 250M OA papers w/ full text
  (free key); DOAJ = OA journal articles; Lobsters = high-signal tech (`.json`).

---

## Recommendation
Ship **Tier 1** first — it's the 80/20:
1. **OpenAlex** → published research incl. Nature/Science (the "real journals" gap).
2. **Hacker News (Algolia)** → the industry/practitioner pulse (what the user asked for).
3. **`feedparser` RSS** → a curated, user-extensible feed list (Nature feeds, eng blogs).

All three are keyless, a few lines each, and plug into the discovery step of the
existing digest without touching storage or full-text compilation. Together they
take Greenplot from "arXiv + open web" to "preprints + peer-reviewed + industry
pulse + curated feeds" — the spread a serious research companion needs.

Suggested next step: a small `app/sources/` package with one module per source
exposing `discover(themes, since) -> list[Candidate]`, fanned-in by the digest
and de-duped by URL/DOI before hitting `parse_paper_for_seed`.

---

## Implemented (2026-06-16) — Tier 1 shipped

`app/sources/` package, one async `discover(themes, …)` per source, fanned in by
`discover_all()` (concurrent, fail-soft, de-duped by normalized URL + title):
- **openalex.py** — published research incl. journals; reconstructs the inverted
  abstract; exposes `pdf_url` for OA works. `kind="paper"`.
- **hackernews.py** — Algolia search; filters recency server-side, gates on
  `points` client-side (the index doesn't allow numeric filtering on points).
  `kind="news"`.
- **rss.py** — `feedparser` over a curated, theme-filtered feed list (Nature
  feeds, MIT TR, Quanta, DeepMind/OpenAI/Anthropic, Papers-with-Code). Default
  list in-module; override via `settings.RSS_FEEDS` ("Name|url" comma list).
- **github.py** — GitHub Search API (repositories): active, well-starred repos
  on a theme (the "what's being built" pulse). Auth via `GITHUB_TOKEN` when set
  (5000 req/hr). `kind="news"`; READMEs are read in full during Deep Research.

### How it changes the digest (`build_academic_digest`)
- **Candidate pool:** arXiv (as before) **+** OpenAlex papers merged into the
  paper pool; HN + news-RSS become the "industry pulse" merged into the news
  pool. Each candidate carries `source` / `kind` / `pdf_url`.
- **Seeds:** `_save_papers_as_seeds` now records `source` + source-tag + sets
  `domain="Industry"` for HN/news (vs `Research`). Industry items are saved too
  (so they're in the garden + full-text-indexed for agents/MCP) but are
  **excluded from the auto-PRD autopilot** (`paper_pipeline`) — they're readings,
  not specs.
- **LLM context:** paper/news blocks are source-attributed (`PAPER [openalex]:`,
  `- [hackernews] …`) so the digest can say "per Nature" / "trending on HN".
- **Full text:** OA/arXiv → real full text via the existing pipeline; paywalled
  journal items (Nature/Science) → title + abstract seed, linked out.
- **Config:** `RESEARCH_SOURCES_ENABLED` (default on), `OPENALEX_MAILTO`,
  `RSS_FEEDS`. Requires `feedparser` (added to requirements).

**Live-verified:** OpenAlex returns recent OA works w/ venue+PDF; HN returns
high-signal recent stories; Nature/OpenAI/Quanta feeds parse. Net effect: the
digest goes from "arXiv + open web" to "preprints + peer-reviewed + industry
pulse + curated feeds," all flowing into the same seed → full-text → MCP path.
