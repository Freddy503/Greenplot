# CLAUDE.md — Seedify Knowledge Base

_Tells any AI how to work with Freddy's personal knowledge system._

## What This Is

**Seedify** is Freddy's personal knowledge base. It captures ideas, enriches them with web research, synthesizes wiki articles, and uses the accumulated knowledge to provide better answers over time.

> "Flat files and a good schema will outperform a fancy tool stack 90% of the time."

## How It Works

```
Voice/Chat → Raw seed in Notion Seeds DB (State: Raw 🌀)
    ↓ (enrichment cron, every 5 min)
Garden search + Web research → LLM synthesis → Planted seed (Notion)
    ↓ (wiki compilation, every 6h)
Wiki articles compiled → wiki/*.md files (PRIMARY STORE)
    ↓ (sync to Weaviate — index only)
Weaviate WikiArticle class → vector search index
    ↓
Chat: search_seeds + search_wiki + web_search → better answers
```

**The flywheel:** Capture → Enrich → Synthesize → Answer better → Capture more.

## File Structure

| Directory | Purpose | Primary or Index? |
|-----------|---------|-------------------|
| `seeds/` (Notion DB) | Raw captured thoughts, voice memos, chat ideas | Source of truth |
| `wiki/*.md` | Synthesized knowledge articles | **PRIMARY STORE** |
| `wiki/INDEX.md` | Auto-generated index of all wiki topics | Reference |
| `memory/` | Agent memory (daily logs, MEMORY.md) | Memory |
| `outputs/` | Reports, briefings, health checks | Generated |
| `skills/idea-garden-rag/` | Pipeline scripts (enrich, plant, sync) | Tooling |

## Wiki Rules

- **`wiki/*.md` is the primary store.** Weaviate WikiArticle is just the search index built FROM these files.
- Every wiki article starts with a one-paragraph summary.
- Link related topics using `[[topic-name]]` format.
- `wiki/INDEX.md` lists every topic with a one-line description.
- When new raw sources are added, update the relevant wiki articles.
- The AI (me) reads `wiki/*.md` files directly when answering questions.
- Don't edit wiki files by hand unless intentional saves — let the pipeline compile.

## For Any AI Reading This

When asked a question about a topic:
1. **Read** `wiki/*.md` files for relevant articles (they're plain text, you can read them).
2. **Check** `memory/` for recent context (today + yesterday + MEMORY.md).
3. **Answer** using what's here + your knowledge.
4. **If the answer adds real value**, ask if Freddy wants it saved to wiki or outputs.

Don't reconfigure. Don't overengineer. Use the system as built.

## Focus Areas

1. **Forward Deployed Engineering** — enterprise software Academy, career trajectory, skills (Git, CI/CD, Docker, safe deployment, code review, API design, ABAP)
2. **Agentic AI** — NemoCore, context graphs, tool architectures, multi-agent systems
3. **Enterprise AI** — Deployment patterns, customer delivery, architecture design
4. **PKM & Knowledge Graphs** — This system itself is a case study
5. **Creative projects** — Idea generation, green plot, second brain design
