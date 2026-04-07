# Provenance & Interaction Logging

## Goal
Extend the Seed, Source, and WikiArticle models to track provenance (who/what created it, why) and log every interaction (reads, writes, agent actions) so the knowledge graph has memory, trust, and replayability.

## Why
Today's seeds are flat—we know what they are, but not how they came to be. With provenance:
- You can trace an idea from voice memo → web search → wiki draft
- Agents can see why a seed was trusted (e.g., "created by human after voice memo")
- Interaction logs enable micro-personalization: "show me seeds Freddy has rated highly"
- Critical for agent accountability: "Did the Research Agent actually check arXiv?"

This turns the garden from a dump into a living audit trail.

## Steps
1. **Extend database models**
   - Edit `openclaw-api/app/models.py`
   - Add to `Seed`, `Source`, `WikiArticle`:
     ```python
     created_by = Column(Enum('human', 'agent_research', 'agent_synthesis', 'agent_critique', 'agent_action', 'cron_harvest', 'voice_to_seed', name='created_by_enum'), nullable=False)
     created_via = Column(String, nullable=False)  # e.g., "voice_to_seeds.py", "web_search", "mcp::cursor"
     provenance_log = Column(JSONB, nullable=False, server_default='[]')  # list of dicts
     last_interacted_at = Column(DateTime, nullable=True)
     interaction_count = Column(Integer, nullable=False, server_default='0')
     ```
   - Add import: `from sqlalchemy import Enum, JSONB` (if using PostgreSQL)
   - For SQLite compatibility, use `JSON` and handle fallback

2. **Automate provenance on creation**
   - Edit `openclaw-api/app/seeds.py`, `sources.py`, `wiki.py`
   - In `create_seed` function:
     - Determine `created_by` based on call context:
       - If called from `voice_to_seeds.py` → `voice_to_seed`
       - If called from MCP with source `cursor` → `human`
       - If called from agent spawner → `agent_research`/`agent_synthesis`/etc.
       - Default: `human`
     - Set `created_via` to the script or tool name (e.g., `"web_search"`)
     - Initialize `provenance_log` with:
       `[{ "timestamp": now.isoformat(), "actor": created_by, "action": "create", "reason": "voice memo" if from voice else "manual" }]`

3. **Log provenance on updates**
   - In `update_seed`, `update_source`, `update_wiki`:
     - Before committing, append to `provenance_log`:
       `{ "timestamp": now.isoformat(), "actor": "system" or "human", "action": "update", "reason": "added tag X", "details": { "field": "tags", "change": "added AI" } }`
   - Update `last_interacted_at = now`, `interaction_count += 1`

4. **Log MCP and agent interactions**
   - In `mcp_server.py`, wrap tool calls:
     - Before: log to Redis stream `mcp:log`: `{ "ts": now, "tool": "search_seeds", "query": x, "agent_id": y }`
     - After: log result count, seed IDs returned
   - In agent spawner/logger: after agent runs, append to its seed's `provenance_log`

5. **Backfill existing data**
   - Create script: `openclaw-api/scripts/backfill_provenance.py`
   - For all seeds:
     - Set `created_by = 'human'`
     - `created_via = 'legacy'`
     - `provenance_log = [{ "timestamp": seed.created_at.isoformat(), "actor": "human", "action": "create", "reason": "legacy import" }]`
     - `interaction_count = 1` (or seed.view_count if available)
     - `last_interacted_at = seed.updated_at`

## File Changes
- `openclaw-api/app/models.py` → extend Seed, Source, WikiArticle
- `openclaw-api/app/seeds.py` → enhance create/update seed
- `openclaw-api/app/sources.py` → same for sources
- `openclaw-api/app/wiki.py` → same for wiki
- New: `openclaw-api/scripts/backfill_provenance.py`
- `openclaw-api/mcp_server.py` → add interaction logging

## Success Criteria
- New seeds (e.g., from voice memo) have correct `created_by` and `created_via`
- Updating a seed appends to `provenance_log`
- MCP tool calls appear in Redis `mcp:log` stream
- Backfill script runs without error and populates legacy data
- No breaking changes to existing API

## Notes
- Use `JSONB` for efficient querying (PostgreSQL); fallback to `JSON` for SQLite
- Keep `provenance_log` size bounded? (Optional: trim to last 100 entries)
- `created_via` helps distinguish MCP vs. CLI vs. agent vs. human
- This enables future features: "Show me all seeds the Research Agent touched today"
