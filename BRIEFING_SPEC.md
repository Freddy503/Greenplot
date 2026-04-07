# Briefing & Spark Notification Spec

This document defines the structure and requirements for Seedify's personalized notification pipeline.

---

## Architecture

Each cron job generates a push notification with a **rich, multi-section payload** that the frontend renders as a `SparkCard`. The payload follows this structure:

```typescript
{
  "type": "morning_spark" | "daily_briefing" | "reflection" | "weekly_eval" | "challenge",
  "title": "Main headline",
  "subtitle": "Optional context or date",
  "sections": [
    {
      "title": "Section heading",
      "icon": "material_symbol_name",
      "color": "text-primary" | "text-blue-400" | etc,
      "content": "Single string OR array of bullet points",
      "sources": [
        { "title": "Source name", "url": "https://..." }
      ]
    }
  ],
  "prompt": "Optional: raw text for 'Chat about this' fallback"
}
```

---

## Cron Jobs

### 1. **Morning Idea Spark** (8:30 AM CET)
**Type:** `morning_spark`

**Purpose:** Start the day with weather context + one deep pattern from user's research interests.

**Algorithm:**
1. Fetch user's last 5-10 chats (via `/api/v1/sessions`)
2. Extract 2-3 dominant themes (NLP or keyword clustering)
3. Fetch weather for user's city (from profile)
4. Web search for recent articles/papers in those themes (last 3-7 days)
5. Call Claude with:
   ```
   You are a research companion. Based on [user's themes], curate ONE deep pattern from recent articles. 
   Include: What it solves, How it works, Real example, [User]'s relevance to their PKM/agentic work.
   Keep to 150 words. Cite sources.
   ```

**Payload Structure:**
```json
{
  "type": "morning_spark",
  "title": "Monday, April 7 — Deep Pattern",
  "subtitle": "Tailored to your interests in agentic systems & enterprise AI",
  "sections": [
    {
      "title": "Weather — Munich",
      "icon": "cloud",
      "color": "text-blue-400",
      "content": "Partly cloudy, 4°C, gusty winds (32 km/h). Layer up."
    },
    {
      "title": "Deep Pattern: Capability-Centric Architecture",
      "icon": "architecture",
      "color": "text-primary",
      "content": [
        "What it solves: Multi-agent systems that don't collapse under coupling.",
        "How it works: Capability Registry + Lifecycle Manager + Evolution Envelopes.",
        "Example: 6-agent software pipeline (Requirements → Code Gen → Review → Docs → PR).",
        "Your relevance: Seedify's Notion ingestion + PKM indexing could adopt CCA contracts."
      ],
      "sources": [
        { "title": "stal.blogspot.com", "url": "https://..." },
        { "title": "augmentcode.com", "url": "https://..." }
      ]
    }
  ],
  "prompt": "... combined text for fallback ..."
}
```

---

### 2. **Daily Briefing** (9:30 AM CET)
**Type:** `daily_briefing`

**Purpose:** Enterprise news + academic papers in user's domain.

**Algorithm:**
1. Fetch user's theme(s) from chats (same as Morning Spark)
2. Web search for:
   - Enterprise AI news (last 1 day, sources: Reuters, Gartner, TechCrunch)
   - Academic papers (last 7 days, arXiv + major conferences)
3. Call Claude to synthesize 2-3 news items + 1-2 papers with:
   ```
   Curate 2 enterprise AI news items and 1 academic paper relevant to [themes].
   For each: headline, 1-2 sentence summary, actionable insight for [user's role].
   ```

**Payload Structure:**
```json
{
  "type": "daily_briefing",
  "title": "Daily Briefing",
  "subtitle": "Monday, April 7 – Enterprise AI & Research",
  "sections": [
    {
      "title": "Enterprise AI News",
      "icon": "newspaper",
      "color": "text-blue-400",
      "content": [
        "① Oracle Launches 22 Fusion Agentic Applications (Mar 24): ...",
        "② Gartner: LLM Observability → 50% of Deployments by 2028: ..."
      ],
      "sources": [...]
    },
    {
      "title": "Academic Spotlight: MemoryAgentBench",
      "icon": "school",
      "color": "text-purple-400",
      "content": "Paper: 'Evaluating Memory in LLM Agents'...",
      "sources": [
        { "title": "arXiv:2507.05257", "url": "https://arxiv.org/abs/2507.05257" }
      ]
    }
  ]
}
```

---

### 3. **Reflection** (4:00 PM CET)
**Type:** `reflection`

**Purpose:** Contrarian view + actionable move for the day.

**Algorithm:**
1. Fetch user's messages from today
2. Call Claude with:
   ```
   Based on these today's chats: [messages]
   1. Identify the main insight or decision made.
   2. Write a 1-sentence contrarian argument against it.
   3. Propose ONE concrete 15-min action for tomorrow.
   ```

**Payload Structure:**
```json
{
  "type": "reflection",
  "title": "Evening Reflection",
  "subtitle": "Monday, April 7",
  "sections": [
    {
      "title": "Contrarian View",
      "icon": "psychology",
      "color": "text-purple-400",
      "content": "You focused on vector search optimization, but maybe the real bottleneck is query intent classification. Measure that first."
    },
    {
      "title": "Actionable Move",
      "icon": "task_alt",
      "color": "text-green-400",
      "content": "Tomorrow: Run a 15-min audit of your last 5 search queries. What % could be answered by structured lookup instead of vector search? Document findings as a seed."
    }
  ]
}
```

---

### 4. **Weekly Content Eval** (Sundays, 6:00 PM CET)
**Type:** `weekly_eval`

**Purpose:** Reflection on the week's learning + creative constraint for next week.

**Algorithm:**
1. Fetch all user's seeds from the past 7 days
2. Fetch conversation counts, topics, and any user ratings
3. Call Claude with:
   ```
   Based on [seeds] and [7-day conversation pattern]:
   1. What theme emerged strongest? Why?
   2. What topic did you touch but not deep-dive? Why?
   3. Propose ONE creative constraint for next week (e.g., "Answer only with 3+ sources", "No vector search — only structured queries").
   ```

**Payload Structure:**
```json
{
  "type": "weekly_eval",
  "title": "Weekly Content Eval",
  "subtitle": "Week of Mar 31 – Apr 6",
  "sections": [
    {
      "title": "What Stuck",
      "icon": "trending_up",
      "color": "text-green-400",
      "content": "Agentic architecture dominated (6 of 8 conversations). CCA, capability contracts, failure boundaries. Why? Enterprise engagement this week."
    },
    {
      "title": "What Didn't",
      "icon": "help_outline",
      "color": "text-yellow-400",
      "content": "Vector search optimization—touched once, not revisited. Might be a distraction or solved enough."
    },
    {
      "title": "Creative Constraint for Next Week",
      "icon": "auto_awesome",
      "color": "text-purple-400",
      "content": "Rule: Every answer must cite 2+ independent sources. No hand-wavy synthesis. Forces deeper research, prevents echo-chamber."
    }
  ]
}
```

---

### 5. **Biweekly Challenge** (1st & 15th, 10:00 AM CET)
**Type:** `challenge`

**Purpose:** Cross-domain idea synthesis. Apply a concept from one field to a problem in another.

**Algorithm:**
1. Fetch user's seeds (all time, grouped by domain)
2. Identify 2 distinct domains (e.g., "agentic systems" + "PKM")
3. Identify a specific problem in domain B
4. Call Claude with:
   ```
   Cross-domain challenge:
   
   Domain A (strong): [agentic-systems concepts]
   Domain B (weak/unexplored): [PKM enrichment gap]
   
   Challenge: Take ONE concept from Domain A and apply it to solve the problem in Domain B.
   Example: Use the Capability Nucleus pattern from multi-agent systems to structure your Notion inbox triage.
   Be specific—outline 3 concrete steps.
   ```

**Payload Structure:**
```json
{
  "type": "challenge",
  "title": "Biweekly Cross-Domain Challenge",
  "subtitle": "April 7-20",
  "sections": [
    {
      "title": "Challenge Setup",
      "icon": "emoji_events",
      "color": "text-red-400",
      "content": "Apply [Agentic Architecture] to solve [PKM Enrichment Bottleneck]"
    },
    {
      "title": "The Idea",
      "icon": "lightbulb",
      "color": "text-amber-400",
      "content": [
        "Use the Capability Nucleus pattern (from multi-agent systems) to structure your Notion inbox triage.",
        "Instead of: 'Read link → add to relevant wiki'",
        "Try: 'Link arrives → Router agent classifies domain → Domain specialist agent enriches → Verifier checks quality → New seed created with capability contracts'"
      ]
    },
    {
      "title": "How to Experiment",
      "icon": "science",
      "color": "text-blue-400",
      "content": [
        "1. Pick 10 unprocessed links from your Sources page.",
        "2. Manually run them through the Capability Nucleus flow (5 min each).",
        "3. Track: time per link, quality of extracted seeds, missed connections.",
        "4. Compare to your normal flow."
      ]
    }
  ]
}
```

---

## Web Research Integration

For **Morning Spark**, **Daily Briefing**, and **Biweekly Challenge**, integrate web search:

```
GET /search?q=[theme]+2026&sort=recent&limit=20
```

Use Perplexity, SerpAPI, or Tavily to search:
- News: `[theme] AI news 2026`
- Academic: `[theme] site:arxiv.org 2026`
- Blogs: `[theme] -site:linkedin.com`

Parse results, extract key insights, call Claude to synthesize.

---

## User Context

All jobs should **personalize** based on:
1. **Last chats** → extract dominant themes
2. **Profile.city** → weather
3. **Profile.roles** → enterprise angle (e.g., "FDE" → focus on customer delivery, not pure research)
4. **Seed ratings** → what user marked valuable

---

## Error Handling

If any step fails:
- **Search fails** → use fallback seeds + chat history
- **Claude fails** → return simple summary of raw data + sources
- **City missing** → skip weather, start with Deep Pattern

Always return a valid payload. Partial data > no notification.

---

## Testing

To test cron job locally without waiting:

```bash
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/morning_spark \
  -H "Authorization: Bearer $TOKEN"

curl -X POST https://api.greenplot.ink/api/v1/push/send \
  -H "Content-Type: application/json" \
  -d @payload.json
```

Example `payload.json` in this repo: `examples/morning_spark.json`
