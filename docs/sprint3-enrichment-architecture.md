# Sprint 3: Enrichment Pipeline Architecture

## Goal
Turn raw thoughts into a connected knowledge graph — not just stored notes.

## Three Pillars

### 1. Semantic Chunking
Split long notes into meaningful, embeddable units.

**Strategy:** Recursive character splitting
- Split on paragraph boundaries first (`\n\n`)
- If a block exceeds target size, split on sentence boundaries (`. `)
- Fallback: split on clause boundaries (`, `, `; `)
- Target: 400-600 tokens per chunk
- Overlap: 1 sentence (~50-80 tokens) between adjacent chunks
- Each chunk stores: `chunk_index`, `text`, `parent_seed_id`

**When to chunk:**
- Content > 800 tokens (~3200 chars) → chunk it
- Content ≤ 800 tokens → embed as single unit (no chunking overhead)

**Weaviate storage:**
- Chunks stored as separate vectors with `parent_id` back-reference
- Search returns chunks → grouped by parent seed for display

### 2. Entity Extraction
Pull structured metadata from text using LLM.

**Entity types:**
| Type | Examples | Use case |
|------|----------|----------|
| `person` | Freddy, Sam Altman | People network |
| `project` | Idea Garden, OpenClaw, Odoo PoC | Project tracking |
| `concept` | RAG, knowledge graphs, A2A | Concept graph |
| `tool` | Weaviate, FastAPI, Exa | Tech stack awareness |
| `org` | Anthropic, SAP, Google | Organization context |
| `source` | URLs, paper titles, book names | Provenance |

**Output format:**
```json
{
  "entities": [
    {"name": "Weaviate", "type": "tool", "confidence": 0.95},
    {"name": "knowledge graphs", "type": "concept", "confidence": 0.88}
  ],
  "topics": ["vector-databases", "second-brain", "rag"],
  "summary": "One-line summary of the core idea"
}
```

**Storage:**
- Entities → Postgres `entities` table (name, type, first_seen, mention_count)
- Entity-seed links → Postgres `seed_entities` join table
- Topics → Weaviate metadata on seed object
- Summary → Weaviate metadata (for search result previews)

### 3. Autonomous Backlinking
When a new seed is created, automatically find and link related existing seeds.

**Algorithm:**
1. Embed new seed content (with chunks if applicable)
2. Query Weaviate: top-10 nearest neighbors, same tenant
3. Filter by similarity threshold:
   - **≥ 0.85** → auto-link (strong connection)
   - **0.72 – 0.85** → LLM confirms (is this a real connection?)
   - **< 0.72** → skip (noise)
4. Check entity overlap (shared entities = additional signal)
5. Create bidirectional link with `link_type`

**Link types:**
| Type | Condition |
|------|-----------|
| `similar` | High vector similarity |
| `builds_on` | New seed references existing seed's concepts |
| `contradicts` | LLM detects opposing views |
| `related_entity` | Shared entities but lower semantic similarity |
| `part_of` | One seed is a sub-component of another |

**Storage:**
```sql
CREATE TABLE seed_links (
    id UUID PRIMARY KEY,
    source_seed_id UUID REFERENCES seeds(id),
    target_seed_id UUID REFERENCES seeds(id),
    link_type VARCHAR(32),
    confidence FLOAT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_seed_id, target_seed_id, link_type)
);
```

## Implementation Plan

### New files
| File | Purpose |
|------|---------|
| `chunker.py` | Recursive text splitting |
| `entity_extractor.py` | LLM-based entity extraction |
| `backlinker.py` | Similarity search + link creation |
| `enricher_v2.py` | Orchestrates the full pipeline |
| `migrations/seed_links.sql` | DB migration for links table |

### Pipeline flow (enricher_v2)
```
Raw Thought
    │
    ├─1─► chunker.py → chunks[]
    │
    ├─2─► entity_extractor.py → entities[], topics[], summary
    │
    ├─3─► embed_text() → vector per chunk
    │
    ├─4─► Store in Postgres (seed + entities + chunks metadata)
    │
    ├─5─► Store in Weaviate (seed + chunks as separate vectors)
    │
    └─6─► backlinker.py → find similar → create links
```

### Weaviate schema update
Add to IdeaSeed class:
- `chunk_index: int` (null for whole-doc embeddings)
- `parent_id: string` (null for top-level seeds)
- `entities: string[]` (entity names)
- `topics: string[]` (topic tags)
- `summary: string`

## Dependencies
- No new external packages needed
- Uses existing: Weaviate client, OpenRouter, httpx
- LLM: Nemotron Super (free) for entity extraction + link confirmation
- Embedding: NVIDIA nv-embedqa-e5-v5 (existing)

## Cost estimate
- Entity extraction: ~200 tokens input + ~100 output per seed → free tier
- Link confirmation: ~300 tokens input + ~50 output per candidate → free tier
- Chunking: no LLM cost (algorithmic)
- Embedding: same as current (1 call per chunk)
