# Feature Spec: Sub-Agent Garden Insight Generator

## Concept
Create autonomous sub-agents that can independently scan the user's garden, find patterns, connections, and insights, and generate actionable reports. These agents run in parallel and can be triggered by the user or scheduled as cron jobs.

## Architecture

### Agent Types
1. **Pattern Agent** - Finds unexpected connections between seeds
2. **Gap Agent** - Identifies missing topics (where there are seeds but no wiki)
3. **Trend Agent** - Analyzes temporal patterns in seed creation
4. **Quality Agent** - Flags low-quality seeds, duplicates, or stale content

### Implementation
- Each agent is an OpenClaw sub-agent spawned with `sessions_spawn`
- Each agent queries Weaviate for relevant data
- Each agent writes results back as new seeds with specific tags
- User notified via push notification when agent completes

## Data Flow
```
Trigger (cron/manual) → Spawn agents → Each queries Weaviate → 
Each generates insights → Save as seeds → Notify user
```

## Agent Prompts

### Pattern Agent
```
You are an expert pattern-matching agent. 
Analyze the user's Garden seeds and find unexpected connections.
Look for:
1. Two or more seeds with shared concepts but different domains
2. Seeds that could inspire each other but are currently isolated
3. Emerging themes across multiple domains

For each pattern found, create a new seed with:
- title: "Pattern: [description]"
- content: detailed explanation of the pattern
- tags: "agent-insight, pattern-discovery, {related-domains}"
- domain: "agent-insight"
```

### Gap Agent
```
You are a knowledge gap detector.
Analyze the user's seeds and wiki articles.
Find:
1. Topics with 3+ seeds but no wiki article
2. Domains with seeds but no cross-linking
3. Missing backlinks between related concepts
```

## Implementation Plan
- Create endpoint: `/api/v1/garden/run-agent/{agent_type}`
- Use existing OpenClaw sub-agent API
- Cron schedule: Daily at midnight UTC
