# Lightweight A2A Agent System

## Goal
Spawn specialized, narrow agents (Research, Synthesis, Critique, Action) via OpenClaw's `sessions_spawn` that collaborate by reading/writing to Seedify's knowledge base and logging their work—no external frameworks needed.

## Why
We don't need LangGraph or CrewAI. With OpenClaw, we can:
- Spawn isolated agents on demand (via cron or MCP)
- Reuse the same 14 LLM tools agents use in chat (`web_search`, `create_seed`, etc.)
- Log agent actions to provenance and interaction logs for accountability
- Keep agents focused: one job, one role, no bloat

This gives us agent collaboration that's lightweight, observable, and tied directly to Seedify's memory.

## Steps
1. **Define agent role prompts**
   - Create directory: `openclaw-workspace/agents/`
   - Create file: `openclaw-workspace/agents/prompts.yaml`
   - Content:
     ```yaml
     research_agent: |
       You are the Research Agent.
       Given a seed title/tags (provided in context), use web_search to find 2-3 recent, credible sources.
       For each source: call create_seed_from_source, tag with "researched-by-agent".
       Log exactly: "Researched [seed_title] → found [N] sources".
       Do not chat—act and log only.
     synthesis_agent: |
       You are the Synthesis Agent.
       Find seeds with tag "researched-by-agent" and no wiki link, grouped by domain (title/tag similarity).
       If a group has >=3 seeds, draft a wiki section outline via LLM (200-300 words).
       Create a new seed: title="[Domain] Wiki Draft", body=outline, tag="wiki-draft".
       Log exactly: "Synthesized [domain] → wiki draft".
     critique_agent: |
       You are the Critique Agent.
       Find wiki draft seeds (tag: "wiki-draft").
       For each, ask: "What assumption is risky here? What evidence contradicts this?"
       Use web_search to find 1 counter-evidence source.
       Seed it with title="Critique: [wiki-draft title]", body=reasoning, tag="critique-of-[domain]".
       Log exactly: "Critiqued [wiki-draft] → found counterpoint".
     action_agent: |
       You are the Action Agent.
       Given a wiki draft seed, ask: "What experiment would test this idea in the real world?"
       Use web_search to find 1 similar experiment, method, or prototype.
       Seed it with title="Experiment: [wiki-draft title]", body=plan, tag="experiment-of-[domain]".
       Log exactly: "Acted on [wiki-draft] → proposed experiment".
     ```

2. **Create agent spawner service**
   - Create file: `openclaw-api/app/agent_spawner.py`
   - Content:
     ```python
     from fastapi import APIRouter, HTTPException
     import yaml, os
     from openclaw_api.app.sessions import sessions_spawn  # hypothetical helper

     router = APIRouter()
     PROMPTS_PATH = os.getenv("AGENT_PROMPTS_PATH", "/root/.openclaw/workspace/agents/prompts.yaml")

     with open(PROMPTS_PATH) as f:
         PROMPTS = yaml.safe_load(f)

     @router.post("/agent/spawn/{role}")
     def spawn_agent(role: str, context: dict = None):
         if role not in PROMPTS:
             raise HTTPException(status_code=404, detail=f"Unknown agent role: {role}")
         prompt = PROMPTS[role].format(**(context or {}))
         # Spawn isolated session with agent role
         session = sessions_spawn(
             task=prompt,
             label=f"agent-{role}",
             runtime="subagent",
             model="openrouter/nvidia/nemotron-super:free",
             toolsAllow=[
                 "web_search", "create_seed", "create_seed_from_source",
                 "list_recent_seeds", "search_seeds", "read_source"
             ],
             delivery={"mode": "none"},  # silent—agents log to seeds/Redis
             timeoutSeconds=90
         )
         return {"session_id": session.session_id, "status": "spawned"}
     ```
   - Add to `openclaw-api/app/main.py`: `app.include_router(agent_spawner.router, prefix="/agent")`

3. **Log agent outputs to provenance**
   - Create a lightweight log collector (could be in `mcp_server.py` or a separate script)
   - Poll Redis stream `agent:log:*` or parse agent session output
   - When agent logs `Researched [seed] → found N sources`:
     - Find the source seed by title
     - Append to its `provenance_log`:
       `{ "timestamp": now, "actor": "research_agent", "action": "research", "reason": "web_search", "details": { "sources_found": N } }`
   - Similarly for synthesis, critique, action

4. **Trigger agents via cron or MCP**
   - Option A (MCP): Add MCP tool `agent/spawn/{role}` → calls `/agent/spawn/{role}`
   - Option B (Cron): Add cron job that runs every 20m:
     - Seeds with `created_by: voice_to_seed` and no `researched-by-agent` → tag `needs-research` → spawn `research_agent`
     - Seeds with `researched-by-agent` and no `wiki-draft` → spawn `synthesis_agent`
     - Wiki draft seeds (`wiki-draft`) → spawn `critique_agent`
     - Wiki draft + critique → spawn `action_agent`

## File Changes
- New: `openclaw-workspace/agents/prompts.yaml`
- New: `openclaw-api/app/agent_spawner.py`
- `openclaw-api/app/main.py` → include agent spawner router
- New: `openclaw-api/app/agent_log_collector.py` (optional, or embed in mcp_server)
- Update cron jobs or add new: `agent-spawner-trigger`

## Success Criteria
- Spawn `research_agent` via MCP or API → it runs `web_search` → creates 2-3 seeds → logs correctly
- New seeds have `created_by: agent_research`, `created_via: web_search`
- Provenance log of source seed shows research action
- `synthesis_agent` groups seeds and creates wiki draft
- `critique_agent` finds one counterpoint per wiki draft
- `action_agent` proposes a testable experiment
- All agents complete in <90s
- No agent runs forever (timeout enforced)

## Notes
- Agents are stateless and isolated—no shared memory
- Prompts use `format()` to inject context (e.g., seed title)
- `toolsAllow` limits agents to safe, read-write tools (no arbitrary code)
- Logging is simplified: agents output a fixed string; collector parses it
- Later: agents could write directly to provenance via tool, but log parsing is easier to start
