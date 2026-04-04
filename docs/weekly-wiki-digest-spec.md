# Weekly Wiki Digest — Feature Spec

## Concept
Each week, a cron job researches and synthesizes a digest email/in-app notification summarizing the latest developments across the Plant/Wiki knowledge base. It combines:
1. What's changed in the wiki this week (new articles, updated ones)
2. Cross-connections discovered between themes
3. External research on the top 3 themes from your garden
4. Suggestions for what to explore next

## Architecture

### 1. Data Sources
| Source | What it provides |
|---|---|
| **Weaviate WikiArticle** | Articles created/updated this week |
| **Weaviate IdeaSeed** | New seeds planted this week |
| **Weaviate Link** | New sources bookmarked this week |
| **Exa Web Search** | External research on top themes |

### 2. Digest Generation Pipeline (Cron: Sundays 10AM CET)

```
Step 1: Gather → Collect weekly changes
  ├── New wiki articles (count + titles)
  ├── Updated wiki articles (count + titles)
  ├── New seeds (count + top domains)
  ├── New links (count + top domains)
  └── Activity feed highlights (top events)

Step 2: Identify Top 3 Themes
  ├── Extract most frequent tags from new content
  ├── Group by domain/category
  └── Pick 3 highest-volume or highest-entropy themes

Step 3: External Research (per theme)
  ├── Exa web search: "{theme} 2026"
  ├── Find 2-3 significant recent developments
  └── Note any contradictions with your wiki's stance

Step 4: Synthesize Digest
  ├── LLM combines internal + external data
  ├── Format as structured markdown
  ├── Include: what's new, what's trending, what's missing
  └── Save as WikiArticle (status: "digest")

Step 5: Deliver
  ├── Web Push notification: "📰 Weekly Digest ready"
  ├── Telegram deliver (existing cron pipeline)
  └── Store in-app for viewing in PWA
```

### 3. Digest Article Format

```markdown
# Weekly Digest — {Week of YYYY-MM-DD}

## Overview
- X new wiki articles
- X updated articles  
- X new seeds across X domains
- X new sources bookmarked

## Top Theme: {Theme 1}
### In Your Garden
- {summary of wiki articles/seeds on this theme}
- {most discussed sub-topic}

### In The World
- {external finding 1 from Exa search}
- {external finding 2}
- {contradiction or opportunity note}

## Top Theme: {Theme 2}
...

## Top Theme: {Theme 3}
...

## What You're Missing
{Gap analysis: what themes are adjacent to your work but you haven't explored}

## Suggested Next Explorations
1. {Suggestion 1}
2. {Suggestion 2}
3. {Suggestion 3}
```

### 4. Cron Job Definition

| Field | Value |
|---|---|
| **Name** | Weekly Wiki Digest |
| **Schedule** | Every Sunday at 10:00 AM CET |
| **Type** | agentTurn (isolated session) |
| **Model** | qwen/qwen3.6-plus:free (primary) |
| **Timeout** | 300 seconds |
| **Delivery** | Telegram + Web Push |

### 5. PWA Integration

- **New page**: `/digest` — shows all past digest articles
- **Nav icon**: "Digest" in bottom nav (replaces Wiki → becomes tab)
- **Push notification**: "📰 Your weekly digest is ready" → taps opens digest

### 6. Implementation Phases

| Phase | What | Effort |
|---|---|---|
| **P0** | Backend script that generates digest from Weaviate + Exa | 1 day |
| **P0** | Cron job to run it weekly + deliver via Telegram/Push | ½ day |
| **P1** | `/digest` page in PWA | ½ day |
| **P1** | Add "Digest" to bottom nav | 1 hour |
| **P2** | Cross-reference digests (link to previous week's) | ½ day |

### 7. Dependencies
- ✅ Weaviate (WikiArticle, IdeaSeed, Link classes)
- ✅ Exa Search API (already configured)
- ✅ Web Push (already works, just need to send digest ready notification)
- ✅ Cron infrastructure (14 jobs already running)
- ❌ Need: LLM prompt for digest synthesis (create in wiki.py)

### 8. Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Exa rate limits | Cache results, use 1 query/month budget |
| Digest too long | Cap at 800 words, use structured sections |
| No changes this week | Send "quiet week" digest with reflection prompt instead |
| LLM hallucination | Ground all external claims in Exa results, cite sources |
