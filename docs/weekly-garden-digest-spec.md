# Weekly Garden Digest — Feature Spec

## Overview
A weekly proactive research digest that analyzes the Garden/Plants, discovers emerging themes, researches them externally, and delivers a synthesized report. Combines **internal knowledge** (what you've been working on) with **external research** (what's happening in the world on those topics).

## How It Works

### Input Layer
1. **Scan the wiki** — collect all articles from the past week
2. **Scan the garden** — collect all new seeds with tags
3. **Scan the sources** — collect all new links/bookmarks
4. **Theme extraction** — cluster by tags, domains, content overlap to find top 3-5 themes

### Research Layer
For each top theme:
1. **Exa web search** — find latest developments, papers, tools
2. **Cross-reference** — compare external findings against your wiki stance
3. **Gap detection** — identify what's trending that you haven't captured yet

### Synthesis Layer
LLM generates a structured digest:
```markdown
# 📰 Garden Digest — Week of April 1-7, 2026

## Your Week in the Garden
- 3 new wiki articles created
- 12 new seeds planted across 4 domains
- Top theme: Agentic AI (8 mentions, 3 new articles)

## Deep Dive: Agentic AI
**Your current stance:** AI agents need human-in-the-loop, not full autonomy
**What's trending:** 
- Anthropic released Computer Use API (Mar 28) — your wiki predicted this
- enterprise software launched Joule Agent Studio — contradicts your "enterprise is slow" thesis
- AutoGen 0.8 dropped — worth adding to your Agentic-Ai article

**Sources:** 6 external articles analyzed

## What You're Missing: {Gap theme}
- Trending topic not in your garden
- Why it matters
- Suggested: plant a seed about this

## Quick Hits
- {Short updates on secondary themes}

## Suggested Actions This Week
1. Update Agentic-Ai article with Computer Use API
2. Plant a seed about enterprise software Joule Agent Studio  
3. Review Devops article for relevance
```

### Output Layer
1. **Wiki article** — saved as `status:digest` for browsing
2. **Push notification** — "📰 Your weekly digest is ready"
3. **Telegram deliver** — full text sent to chat
4. **Email** (optional future) — formatted HTML digest

## Architecture

```
Cron: Weekly Digest Runner (Sundays 9AM CET)
│
├─ Step 1: Gather (Python script)
│  ├─ Fetch weekly wiki articles (Weaviate)
│  ├─ Fetch weekly seeds (Weaviate)
│  └─ Group by theme/tag
│
├─ Step 2: Research (OpenClaw agent)
│  ├─ For top 3 themes → Exa web search
│  ├─ Parse and rank results
│  └─ Compare vs existing wiki content
│
├─ Step 3: Synthesize (LLM)
│  ├─ Generate digest via qwen/qwen3.6-plus:free
│  ├─ Save as WikiArticle
│  └─ Tag: digest, week-YYYY-WXX
│
└─ Step 4: Deliver
   ├─ Web Push notification
   ├─ Telegram message
   └─ Activity Summary update
```

## CronJob Definition

| Field | Value |
|---|---|
| **Name** | Weekly Garden Digest |
| **Schedule** | `0 9 * * 0` (Sundays 9AM CET) |
| **Type** | Agent session (isolated) |
| **Model** | qwen/qwen3.6-plus:free |
| **Timeout** | 300s |
| **Delivery** | Telegram + Web Push |

## PWA Integration

- `/digest` route: browse all past digest articles, filter by week
- Nav bar: Add "📰" icon to bottom nav
- Push notification with deep link: tap opens the digest

## Quick Wins (Phase 1)
1. Weekly cron that scans recent wiki/seeds → generates summary → saves as article
2. Push notification + Telegram delivery
3. Simple digest view in PWA

## Stretch Goals (Phase 2)
1. Daily mini-digest (3 bullet points, not full article)
2. Auto-update wiki articles with new external findings
3. Cross-reference digests (link to previous weeks)
4. Email delivery

## Status
✅ **Spec written** — awaiting approval to implement
📋 **Saved at:** `docs/weekly-garden-digest-spec.md`

## Approval Needed
1. Start with Phase 1 (weekly cron + Telegram/Push delivery)?
2. Use same cron infrastructure as existing 14 jobs?
3. Delivery to Telegram channel + PWA?
