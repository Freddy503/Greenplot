# Feature Spec: Sub-Agent Knowledge Garden Skimmer

## Problem
The user has 253+ seeds, 19 sources, 10 wiki articles growing every day. Finding new patterns and connections manually is impossible at scale.

## Solution
A sub-agent system that launches autonomous research agents to scan the Garden, find patterns, and generate insight reports.

## Architecture

### Agent Types
1. **Insight Agent** - Find connections between seeds that weren't previously linked
2. **Gap Agent** - Identify knowledge gaps (themes with many seeds but no wiki article)
3. **Trend Agent** - Track what's emerging (new tags, new domains, new patterns)
4. **Quality Agent** - Flag stale seeds, contradictions, low-value seeds

### Execution Model
```
Cron Job (Daily 6AM CET)
  → Spawns 4 isolated sub-agents via OpenClaw
    → Each reads Weaviate seeds/links/wiki
    → Each runs independent analysis
    → Results saved as new seeds with tag: "agent-discovery"
    → User notified via push notification
```

### Integration Points
- **OpenClaw subagent spawning** using `sessions_spawn` with `mode="run"`
- **Weaviate read access** for each sub-agent
- **Result storage** in Seeds DB with source="agent-insight"
- **Push notification** on discovery of interesting patterns

### Prompt Structure (per agent type)

**Insight Agent:**
"Analyze all seeds in the garden. Find 3-5 unexpected connections between seeds that weren't previously linked. Write a short insight for each. Save as seeds."

**Gap Agent:**
"Analyze all seeds and wiki articles. Where are there 3+ seeds on a theme with no wiki article? These are knowledge gaps. Flag them."

**Trend Agent:**
"What topics appeared in seeds this week that weren't there before? What domains are growing fastest? Generate a weekly trend report."

**Quality Agent:**
"Find seeds that are outdated (>30 days old with no visits), duplicated, or low-value (no tags, no content, no connections). Propose actions."

## Implementation
- Add `/api/v1/garden/skim` endpoint (triggers all 4 agents)
- OpenClaw cron job (Daily 6AM CET)
- Results stored in Weaviate as seeds with `source="agent-insight"` and `agent_type` tag
- Results also pushed to Telegram as digest

## Success Metrics
- User finds value in agent-generated insights
- New seeds discovered from connections
- Wiki articles created from gap agent findings
- User engagement increases over time
