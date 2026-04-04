# Garden Operations — Cron Job Optimization Plan

**Date:** 2026-04-04
**Status:** In Progress
**Priority:** High

## Problem

The 14 OpenClaw cron jobs powering the Garden pipeline have 4 categories of issues:

1. **Silent failures** — Biweekly Challenge errored for days before detection
2. **Wasteful execution** — 30-min harvest/wiki jobs consume tokens when nothing is new
3. **No feedback loop** — Zero telemetry on which jobs Freddy finds useful vs ignores
4. **Error opacity** — `consecutiveErrors` exists but never triggers alerts or recovery

## Fix 1. Silent Failures

**What happened:** Biweekly Challenge agent had an `AttributeError` (string vs response object). Ran for 13+ days with `consecutiveErrors: 1` but never alerted anyone.

**Fix applied:**
- Fixed the LLM response parsing bug in `biweekly_challenge_agent.py`
- Rewrote the cron payload to detect `ERROR:` output and alert Freddy
- Added error logging to the CronJob Knowledge Base on every failure

**Policy going forward:**
- Any job with `consecutiveErrors >= 1` → log to Notion + Telegram Freddy
- Any job with `consecutiveErrors >= 3` → auto-disable + alert
- Weekly error audit (Sunday 6pm Content Eval includes cron health)

## Fix 2. Wasteful Execution

**Before:** Auto-seed harvest and Wiki compiler ran every 30 minutes regardless, consuming API calls and agent turns even when nothing was new.

**Fix applied:**
- **Auto-seed harvest:** Checks `harvested` count. Only notifies Freddy if `> 0`. Silent `HEARTBEAT_OK` otherwise.
- **Wiki compiler:** Checks Weaviate for new enriched links/uncovered seeds. Compiles only if new content exists. Uses `compiled` count as the signal.
- **Future:** Add similar guards to Voice→Seeds check.

**Expected savings:** ~80% reduction in wasted agent turns (from ~288/month for empty polls to ~57 for actual activity).

## Fix 3. No Feedback Loop

**Problem:** Freddy has no mechanism to signal "this was useful" or "this was noise." All 14 jobs blast into Telegram with equal priority.

**Proposed solution — Job Feedback Protocol:**

```
Every cron delivery gets a footer:
─────────────────────────
👍 Helpful  ·  👎 Skip this  ·  🔇 Mute this job
(Reply 1/2/3)
```

- `1` (👍): Log positive signal. After 3+ 👍 over 2 weeks, upgrade to "high priority" delivery.
- `2` (👎): Log negative signal. After 3+ 👎 over 2 weeks, suggest reducing frequency or killing job.
- `3` (🔇): Immediately pause the job (disable cron). Can re-enable from Settings.

**Tracking:** Store feedback in a new Notion DB "Cron Job Analytics":
| Job Name | 👍 Count | 👎 Count | Last Feedback | Action Taken |
|----------|----------|----------|---------------|--------------|

**Implementation:**
- Parse numbered replies from Freddy in cron job delivery responses
- Update Notion DB via API
- Heartbeat reviews the stats weekly

## Fix 4. Error Opacity

**Before:** `consecutiveErrors` exists in cron state but agents never check it. Errors go stale.

**New protocol:**
```python
# In every cron job that calls a script:
result = subprocess.run([script], capture_output=True, text=True, timeout=120)

if result.returncode != 0:
    # 1. Log to Cron Job Knowledge Base
    exec python3 log_cron_output.py --job_name "Job Name" --output f"ERROR: {result.stderr[-1000:]}"
    # 2. Check consecutiveErrors
    # 3. Alert Freddy with context
    print(f"⚠️ Job Name failed ({consecutiveErrors + 1} consecutive errors)")
    print(f"Error: {result.stderr[-500:]}")
    print(f"Reply 'fix' to attempt auto-repair, 'disable' to pause this job.")
```

## Current Job Inventory (14 Jobs)

| Name | Schedule | Last Status | Issues Fixed |
|------|----------|-------------|--------------|
| Voice Memos → Seeds | Every 30 min | OK | Waste reduced (conditional notify) |
| Auto-seed Harvest | Every 30 min | OK | Waste reduced |
| Auto-Wiki Compiler | Every 30 min | OK | Pre-check added |
| Pending Link Enrichment | 7AM/7PM CET | OK | — |
| Weaviate Watchdog | Every 30 min | OK | — |
| Daily Seed Extraction | 23:00 UTC | OK | — |
| Daily Backup | 02:00 UTC | OK | — |
| Daily Briefing | 8:30 AM CET | OK | — |
| Morning Idea Spark | 8:30 AM CET | OK | — |
| FDE Interview Prep | Bi-daily 9AM CET | OK | — |
| Daily Reflection | 4:00 PM CET | OK | — |
| Weekly Content Eval | Sun 18:00 CET | OK | — |
| FDE Study Check-in | Sun 18:00 CET | Never ran | New — needs trigger |
| Biweekly Challenge | 1st & 15th 10AM CET | ❌ Error (fixed now) | Bug fixed, error handling added |

## Next Steps

- [ ] Implement Job Feedback Protocol (Notion DB + reply parsing)
- [ ] Add Voice→Seeds conditional notification
- [ ] Weekly cron health report (auto-generated in Content Eval)
- [ ] Consider consolidating 30-min jobs into a single "Garden Sweep" job
- [ ] Add job-level timeout alerts (jobs running > 2x typical duration)
