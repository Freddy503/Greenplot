# Enrichment Pipeline

Weaviate-native enrichment for the Idea Garden. No Postgres dependency.

## Architecture

```
Seed (raw) → Chunker → Extractor → Backlinker → Weaviate (enriched)
                    ↓          ↓           ↓
              semantic     KERNEL      vector search
              chunks       entities    + LLM relevance
```

## Modules

| Module | Purpose |
|--------|---------|
| `schema.py` | Extend IdeaSeed class with enrichment properties |
| `chunker.py` | Paragraph-aware semantic chunking |
| `extractor.py` | KERNEL-style entity extraction & tagging (LLM) |
| `backlinker.py` | Autonomous backlinking (vector search + LLM) |
| `pipeline.py` | Main orchestrator (chunk → extract → backlink → upsert) |
| `reembed.py` | Re-process all existing seeds |
| `queue.py` | Redis job queue for background enrichment |

## Usage

```bash
# Extend schema first (one-time)
python3 enrichment/schema.py

# Dry-run a single seed
python3 enrichment/pipeline.py --notion-id <id> --dry-run

# Enrich a single seed
python3 enrichment/pipeline.py --notion-id <id>

# Re-embed all seeds (with limit for testing)
python3 enrichment/reembed.py --limit 5 --dry-run
python3 enrichment/reembed.py --all

# Background queue
python3 enrichment/queue.py --enqueue <id1> <id2> <id3>
python3 enrichment/queue.py --process 10
```

## Weaviate Properties Added

| Property | Type | Purpose |
|----------|------|---------|
| summary | text | LLM-generated 2-sentence summary |
| tags | text | Comma-separated kebab-case tags |
| entities | text | JSON: [{name, type, confidence}] |
| backlinks | text | JSON: [{notion_id, score, reason}] |
| energy | text | Spark / Hot / Flow / Cool |
| status | text | Seedling / Growing / Harvested |
| enrichment_version | int | Schema version for migration tracking |
| parent_id | text | notion_id for chunk linking |
| domain | text | Primary domain classification |
| source_url | text | Original source URL |
