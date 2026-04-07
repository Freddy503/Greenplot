# End-to-End Agent Collaboration Pipeline

## Goal
Run a full cycle: voice memo → seed → Research Agent → Synthesis Agent → Critique Agent → Action Agent → wiki update → notification—showing how human insight grows through agent collaboration.

## Why
The magic isn't in any single agent—it's in the pipeline. This demonstrates:
- A human spark ("What if LLMs could simulate warehouse chaos?")
- Is enriched by automated research
- Synthesized into a coherent idea
- Challenged for robustness
- Turned into an actionable experiment
- Finalized in the wiki
- All steps logged, traceable, and improvable

This is Seedify not as a passive second brain, but as an active thinking partner.

## Steps
1. **Voice memo → seed (existing, enhance)**
   - Edit `openclaw-workspace/skills/idea-garden-rag/voice_to_seeds.py`
   - After creating seed:
     - Set `created_by: voice_to_seed`
     - Set `created_via: voice_to_seeds.py`
     - Add tag: `needs-research`
     - Initialize `provenance_log`:
       `[{ "timestamp": now, "actor": "human", "action": "voice_to_seed", "reason": "spoken idea" }]`
     - Set `last_interacted_at`, `interaction_count = 1`

2. **Trigger Research Agent on voice-memo seeds**
   - In `openclaw-api/app/agent_spawner.py`, add logic (or via cron):
     - Query seeds where `created_by = 'voice_to_seed'` AND `tags CONTAINS 'needs-research'`
     - For each:
       - Remove `needs-research` tag (prevent re-spawning)
       - Add tag: `research-triggered`
       - Spawn `research_agent` with context: `{ "seed_title": seed.title, "seed_tags": seed.tags }`
   - `research_agent` (from prompts.yaml):
     - Uses `web_search` to find sources
     - Calls `create_seed_from_source` for each
     - Tags new seeds with `researched-by-agent`
     - Logs: `"Researched [seed_title] → found [N] sources"`

3. **Trigger Synthesis Agent on researched seeds**
   - Cron or MCP-triggered:
     - Find seeds with tag `researched-by-agent`
     - Group by domain (simple: first word of title, or tag similarity)
     - If group size >= 3 and no existing `wiki-draft` in group:
       - Spawn `synthesis_agent` with context: `{ "domain": domain, "seed_titles": [list] }`
   - `synthesis_agent`:
     - Uses LLM to draft wiki section outline (200-300 words) from seed titles/summaries
     - Creates new seed: title="[Domain] Wiki Draft", body=outline, tag=`wiki-draft`
     - Logs: `"Synthesized [domain] → wiki draft"`
     - Sets `created_by: agent_synthesis`

4. **Trigger Critique Agent on wiki drafts**
   - Find seeds with tag `wiki-draft`
   - For each:
     - Spawn `critique_agent` with context: `{ "wiki_draft_title": seed.title }`
   - `critique_agent`:
     - Asks: "What assumption is risky here? What evidence contradicts this?"
     - Uses `web_search` to find 1 source
     - Seeds it as `Critique: [wiki_draft title]`, body=reasoning, tag=`critique-of-[domain]`
     - Logs: `"Critiqued [wiki-draft] → found counterpoint"`
     - Sets `created_by: agent_critique`

5. **Trigger Action Agent on wiki drafts**
   - Find seeds with tag `wiki-draft` that have at least one `critique-of-` link (or after critique runs)
   - Spawn `action_agent` with context: `{ "wiki_draft_title": seed.title }`
   - `action_agent`:
     - Asks: "What experiment would test this idea in the real world?"
     - Uses `web_search` to find 1 similar experiment, method, or prototype
     - Seeds it as `Experiment: [wiki_draft title]`, body=plan, tag=`experiment-of-[domain]`
     - Logs: `"Acted on [wiki-draft] → proposed experiment"`
     - Sets `created_by: agent_action`

6. **Auto-wiki compilation & notification**
   - Enhance existing `auto-wiki-compiler` cron job (runs every 30m):
     - Prioritize seeds with tags: `wiki-draft`, `synthesized-by-agent`
     - After compilation:
       - If wiki article created/updated:
         - Send push notification:
           `"Your wiki on [topic] just grew from agent collaboration—read it?"`
         - Log to activity feed: `"wiki updated via agent pipeline: [topic]"`

7. **Log the full chain to provenance**
   - Every step appends to the relevant seed's `provenance_log`:
     - Voice memo seed: `{actor: human, action: voice_to_seed}`
     - Research seed: `{actor: research_agent, action: web_search}`
     - Wiki draft seed: `{actor: synthesis_agent, action: draft_wiki}`
     - Critique seed: `{actor: critique_agent, action: challenge}`
     - Experiment seed: `{actor: action_agent, action: propose_experiment}`
   - Final wiki article (if created) includes a `provenance` field showing:
     - Which seeds contributed
     - Which agents acted
     - The full chain from voice to action

## File Changes
- `openclaw-workspace/skills/idea-garden-rag/voice_to_seeds.py` → enhance seed creation
- `openclaw-api/app/agent_spawner.py` → add triggering logic (or use separate cron)
- New: `openclaw-api/app/agent_trigger_cron.py` (or add to existing cron)
- `openclaw-api/app/wiki.py` → enrich wiki article with provenance chain
- `openclaw-api/app/seeds.py` → ensure provenance log updates on create/update
- Update: `openclaw-api/mcp_server.py` (if using MCP to trigger agents)

## Success Criteria
- Record a voice memo: "What if LLMs could simulate warehouse chaos?"
- Within 2 hours:
  - New seed exists with:
    - `created_by: voice_to_seed`
    - Tag: `needs-research` (then removed)
    - Provenance: `[{actor: human, action: voice_to_seed}]`
  - 2-3 research-spawned seeds:
    - `created_by: agent_research`
    - Tag: `researched-by-agent`
    - Provenance of source seed shows research action
  - One wiki draft seed:
    - `created_by: agent_synthesis`
    - Tag: `wiki-draft`
    - Provenance: `[{actor: synthesis_agent, action: draft_wiki}]`
    - Links to research seeds
  - One critique seed:
    - `created_by: agent_critique`
    - Tag: `critique-of-[domain]`
    - Provenance shows challenge action
  - One experiment seed:
    - `created_by: agent_action`
    - Tag: `experiment-of-[domain]`
    - Provenance shows proposed experiment
  - Wiki article updated or created (if threshold met)
  - Push notification sent: "Your wiki on [topic] just grew…"
  - All provenance logs traceable from voice to action
- No infinite loops (tags prevent re-spawning)
- All agents complete in <90s

## Notes
- Start with voice memo as trigger—later, any seed can start the pipeline
- Grouping by domain: simple heuristic (e.g., first word of title) is fine for MVP
- Wiki compilation already exists—we're just biasing it toward agent-generated seeds
- Notification reuses existing push system (`/root/.openclaw/workspace/scripts/push_notify.sh`)
- This is the "minimum viable magic"—enough to feel alive, not perfect
