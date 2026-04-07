# Backend Briefing Pipeline Setup

This guide explains how to set up and test the new briefing generation system.

## What's New

The backend now generates personalized, multi-section briefings for five different cron jobs:

| Job | Time | Type | Sections |
|-----|------|------|----------|
| Morning Idea Spark | 8:30 AM CET | `morning_spark` | Weather + Deep Pattern |
| Daily Briefing | 9:30 AM CET | `daily_briefing` | Enterprise News + Academic Papers |
| Evening Reflection | 4:00 PM CET | `reflection` | Contrarian View + Actionable Move |
| Weekly Content Eval | Sun 6:00 PM CET | `weekly_eval` | What Stuck + Creative Constraint |
| Biweekly Challenge | 1st/15th 10 AM | `challenge` | Cross-domain Synthesis Experiment |

## Architecture

### New Module: `app/briefings.py`

Implements briefing builders and supporting functions:

- `build_morning_spark(user_id, db, city, weather, themes)` → briefing dict
- `build_daily_briefing(user_id, db, themes)` → briefing dict (async)
- `build_reflection(user_id, db)` → briefing dict
- `build_weekly_eval(user_id, db)` → briefing dict
- `build_biweekly_challenge(user_id, db)` → briefing dict

### Supporting Functions

- `fetch_user_themes(user_id, db)` — Extract dominant research themes from recent seeds
- `get_user_city(user_id, db)` — Fetch user's location
- `fetch_weather(city)` — Get weather via Open-Meteo API (free, no auth)
- `fetch_web_search(query, limit)` — Web search via SerpAPI or Tavily
- `_call_llm(prompt, system, max_tokens)` — Call configured LLM (Nemotron/Qwen/Claude)

### New Main.py Functions

- `_sto<RESEND_API_KEY>(briefing)` — Persist + push multi-section briefing
- `_broadcast_push_briefing(briefing)` — Send briefing to subscribers
- Updated `_job_morning_spark()`, `_job_daily_briefing()`, `_job_afternoon_reflection()`, `_job_weekly_eval()`, `_job_biweekly_challenge()`

## Payload Structure

All briefings follow this JSON structure:

```json
{
  "type": "morning_spark|daily_briefing|reflection|weekly_eval|challenge",
  "title": "Main headline",
  "subtitle": "Optional context or date",
  "sections": [
    {
      "title": "Section heading",
      "icon": "material_symbol_name",
      "color": "text-primary|text-blue-400|...",
      "content": "String or array of bullet points",
      "sources": [
        { "title": "Source name", "url": "https://..." }
      ]
    }
  ],
  "prompt": "Optional: raw text for 'Chat about this' fallback"
}
```

## Configuration

### LLM Client

By default, the system tries to use the configured LLM client from your settings:

```python
# In app/briefings.py
client = settings.llm_client  # Falls back to Anthropic if not set
```

**To use Nemotron or Qwen**, update your `app/config.py`:

```python
from anthropic import Anthropic

class Settings:
    llm_client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    # OR
    # llm_client = your_custom_nemotron_client()
```

### Web Search APIs

The system supports two web search providers:

**Option 1: SerpAPI** (recommended for news)
```bash
export SoperationalAPI_API_KEY="your_api_key"
```

**Option 2: Tavily** (free tier available)
```bash
export TAVILY_API_KEY="your_api_key"
export TAVILY=1  # Enable Tavily
```

### Weather (Free, No Auth)

Uses Open-Meteo geocoding + current weather API. No configuration needed.

## Testing

### Trigger a Job Manually

```bash
TOKEN=$(curl -s -X POST https://api.greenplot.ink/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"email": "contact@example.com", "password": "<password>"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Test Morning Spark
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/morning_spark \
  -H "Authorization: Bearer $TOKEN"

# Test Daily Briefing
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/daily_briefing \
  -H "Authorization: Bearer $TOKEN"

# Test Evening Reflection
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/reflection \
  -H "Authorization: Bearer $TOKEN"

# Test Weekly Eval
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/weekly_eval \
  -H "Authorization: Bearer $TOKEN"

# Test Biweekly Challenge
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/biweekly_challenge \
  -H "Authorization: Bearer $TOKEN"
```

### Verify in Frontend

The frontend `SparkCard` component will render the briefing. Check:
1. Type-specific header colors (Morning Spark ≠ Daily Briefing)
2. Multi-section rendering with icons + sources
3. "Chat about this" + "Garden" action buttons

### Check Server Logs

```bash
# Watch for briefing generation logs
tail -f openclaw-api.log | grep "\[suggestions\]\|\[briefing\]\|Morning Spark"
```

Expected output:
```
✅ Morning Spark generated
✅ Daily Briefing generated
✅ Evening Reflection generated
✅ Weekly Content Eval generated
✅ Biweekly Challenge generated
```

## Error Handling

If any step fails:
- **LLM unavailable** → Returns a fallback briefing with generic suggestions
- **Web search fails** → Skips news/academic sections, fills with seed-based context
- **Weather API down** → Omits weather, starts with deep pattern
- **No user found** → Logs warning, job skips

All errors are logged but don't block the notification from being sent.

## Next Steps

### Database Schema (Optional)

To support per-user personalization, add a `user_preferences` table:

```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  timezone VARCHAR(64) DEFAULT 'Europe/Berlin',
  notification_types TEXT[] DEFAULT ARRAY['morning_spark', 'daily_briefing', 'reflection'],
  web_search_enabled BOOLEAN DEFAULT TRUE,
  llm_synthesis_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

Then update briefing builders to check preferences:

```python
prefs = db.query(UserPreference).filter_by(user_id=user_id).first()
if prefs and 'morning_spark' not in prefs.notification_types:
    return None  # Skip this briefing for this user
```

### Push Notification Delivery

Currently, `_broadcast_push_briefing()` logs the briefing but doesn't send to clients. To integrate with your push subscription system:

```python
def _broadcast_push_briefing(briefing: dict) -> int:
    db = next(get_db())
    subscriptions = db.query(PushSubscription).all()
    
    sent = 0
    for sub in subscriptions:
        try:
            webpush(
                sub.subscription_json,
                json.dumps(briefing),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS
            )
            sent += 1
        except Exception as e:
            logger.error(f"Push delivery failed for {sub.user_id}: {e}")
    
    return sent
```

### Rate Limiting

If LLM calls become expensive, add caching:

```python
# In briefings.py
from app.cache import cache_get, cache_set

cached = cache_get(f"briefing:{briefing_type}:{user_id}")
if cached:
    return json.loads(cached)

# ... build briefing ...

cache_set(f"briefing:{briefing_type}:{user_id}", json.dumps(briefing), ttl=3600)
```

## Troubleshooting

### Jobs not triggering on schedule?

1. Check APScheduler logs: `grep "APScheduler started" openclaw-api.log`
2. Verify timezone: `grep "_CET\|timezone" openclaw-api/app/main.py`
3. Test manual trigger (see Testing section above)

### Briefing content is generic?

- **LLM failing silently**: Set `ANTHROPIC_API_KEY` and check logs for errors
- **Web search failing**: Set `SoperationalAPI_API_KEY` or `TAVILY_API_KEY`
- **User themes empty**: Check that user has recent seeds/chats

### Frontend not rendering multi-section?

- Check frontend console for errors
- Verify `SparkCard` component received the full briefing structure (not just title + body)
- Ensure JSON parsing is correct

## Files Modified

- `openclaw-api/app/briefings.py` — New module (400+ lines)
- `openclaw-api/app/main.py` — Updated job handlers + store/broadcast functions
- `src/components/ai-elements/spark-card.tsx` — Enhanced to render multi-section briefings
- `src/app/settings/page.tsx` — Updated notification schedule display
