# Weekly Eval & Biweekly Challenge — Creative Directions

## Weekly Content Eval (Sundays, 6:00 PM)

The weekly eval is a **meta-analysis of the week's learning**. Instead of a lecture, it's self-reflective:

**Structure:**
1. **What Stuck** — which theme appeared in 40%+ of conversations? (signal) Why?
2. **What Didn't** — which topic was touched once and never revisited? (noise or solved?)
3. **Creative Constraint for Next Week** — a rule that forces deeper thinking

**Example Constraints:**
- "Every answer must cite 2+ sources" (prevents hand-wavy synthesis)
- "No reusing the same concept twice; each conversation must explore new ground" (prevents echo chamber)
- "One conversation must be with an expert outside your field" (breaks silo thinking)
- "All seeds must be 50+ words; no hot-takes" (forces substantive capture)
- "Spend 30 min on something adjacent to your main theme" (serendipity)

---

## Biweekly Challenge (1st & 15th, 10:00 AM)

The biweekly challenge is a **specific cross-domain synthesis exercise**. Not abstract, not vague—executable in 2 hours.

### Challenge Format

```
Domain A (strong): Your primary research area
Domain B (weak/unstudied): A problem in your work that isn't solved yet
Task: Transplant ONE concept/pattern from Domain A into Domain B
Result: A 3-step experiment to test the idea
```

### Example Challenges for Your Interests

**Challenge 1: Agentic Systems → PKM Enrichment**
- **Domain A:** Capability-Centric Architecture (CCA) patterns
- **Domain B:** How do you decide which links to enrich vs. ignore?
- **Transplant:** Use CCA's "Efficiency Gradients" — different enrichment depth based on link criticality
  - Tier 1 (critical): full context extraction, multi-source verification, Odoo automation
  - Tier 2 (useful): headline + key insight, one citation
  - Tier 3 (interesting): save-and-skim, no enrichment yet
- **3-Step Experiment:**
  1. Classify your last 50 unprocessed links into 3 tiers (5 min)
  2. Run Tier 1 (5 links) through full enrichment, Tier 3 (5 links) as-is (15 min)
  3. Measure: time spent, seed quality, % used in chats (30 min review)

**Challenge 2: Enterprise Deployment Patterns → Seedify Growth**
- **Domain A:** How enterprise customers resist silos (RBAC, approval chains, audit trails)
- **Domain B:** How do you prevent Seedify from becoming a garden of dead links?
- **Transplant:** "Permission boundaries" — treat each source type as a capability with different approval gates
  - Web links: auto-ingest, low-friction (anyone can add)
  - Academic papers: require citation (semi-trusted)
  - Internal notes: require enrichment before wiki (gated)
- **3-Step Experiment:**
  1. Map your current link sources (web, academic, internal, Notion)
  2. Define ONE permission rule for the weakest source (web)
  3. Test: does the rule catch low-quality captures? (30 min)

**Challenge 3: Memory Consolidation (Academic) → Daily Workflows**
- **Domain A:** MemoryAgentBench: agents need 4 competencies (retrieval, forgetting, learning, consolidation)
- **Domain B:** Your PKM indexes everything but you forget where to find it
- **Transplant:** "Selective Forgetting" — archive seeds you haven't referenced in 90 days, then resurrect them as "forgotten but relevant" prompts
- **3-Step Experiment:**
  1. Export all seeds 90+ days old (5 min)
  2. Pick 5 seeds, ask Claude to contextualize them for today's work (10 min)
  3. Measure: % that spark new ideas vs. % that stay forgotten (15 min)

**Challenge 4: Distributed Systems (Coordination Tax) → Your Agentic Workflows**
- **Domain A:** Gartner: 40% of agentic initiatives cancelled before completion (coordination is hard)
- **Domain B:** Seedify has 3+ agents (Notion sync, PKM indexing, Odoo creation) — are they coupled?
- **Transplant:** "Tighter Failure Boundaries" — each agent works async with fallback retry + human escalation
- **3-Step Experiment:**
  1. Map agent dependencies: what happens if Notion sync fails?
  2. Test: kill one agent, see what breaks (manual/staged test, 10 min)
  3. Define: escalation path (Slack alert + manual fix option)

**Challenge 5: Decision Science → Your Research Process**
- **Domain A:** Contrarian thinking: don't ask "is this true?" but "why would this be wrong?"
- **Domain B:** Your daily research often confirms existing beliefs
- **Transplant:** "Opposite Research Day" — pick your strongest conviction, find the best arguments against it
- **3-Step Experiment:**
  1. Pick one conviction from this week ("Vector search is necessary for PKM")
  2. Spend 30 min finding the best counter-evidence
  3. Update your understanding or strengthen your original belief with evidence

---

## Implementation Notes

### For Backend

Each biweekly challenge should:
1. **Fetch user's seed history** → identify 2 domains (one strong, one weak)
2. **Call Claude** with prompt template:
   ```
   Based on these strong domains [A] and weak problem [B]:
   Design a 2-hour experiment where you apply one pattern from A to solve B.
   Be specific: 3 steps, measurable result, tools needed.
   ```
3. **Return as `SparkCard` type `challenge`** with sections: Setup, The Idea, How to Experiment

### Weekly Eval

1. **Fetch user's 7-day seeds + conversations**
2. **Call Claude** with:
   ```
   Based on [7-day activity]:
   1. What theme dominated?
   2. What was touched but not deepened?
   3. Propose ONE creative constraint for next week that forces depth, breadth, or rigor.
   ```
3. **Return as `SparkCard` type `weekly_eval`**

---

## Example Weekly Constraints (Rotating)

- **Rigor Week:** Every answer needs 2+ independent sources
- **Breadth Week:** Each conversation must explore a new domain (no repeats)
- **Speed Week:** Maximum 15 minutes per conversation; shallow is fine
- **Depth Week:** One conversation goes 2+ hours; no interruptions
- **Serendipity Week:** One conversation must be with someone/something outside your usual bubble
- **Writing Week:** Every insight becomes a 200-word seed (forces clarity)
- **Silence Week:** Only consume; no new seeds captured; just reading/learning

---

## Measurement Ideas

Track over time:
- Which constraints led to better seeds?
- Which biweekly challenges generated follow-up conversations?
- How many seeds from challenges made it to wiki articles?
