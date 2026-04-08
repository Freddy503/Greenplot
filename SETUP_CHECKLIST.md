# Briefing Pipeline Setup Checklist

Complete these steps to enable the personalized briefing notification system.

## ✅ Frontend (Already Done)

- [x] Enhanced `SparkCard` component (multi-section rendering)
- [x] Updated Settings page with new notification times
- [x] Briefing payload structure defined
- [x] Push notification integration

**Status**: Ready to display multi-section briefings

---

## ✅ Backend Code (Already Done)

- [x] `briefings.py` module created
- [x] LLM integration via OpenRouter (Nemotron Super)
- [x] Exa API integration for web search
- [x] All 5 briefing builders implemented
- [x] Job handlers updated in `main.py`
- [x] Scheduler times configured (8:30, 9:30, 16:00, Sun 18:00, 1st/15th 10:00)

**Status**: Code is production-ready

---

## 🔧 Required: Environment Setup

### 1. OpenRouter API Key

Get free API key for Nemotron Super models:

1. Visit: https://openrouter.ai/
2. Sign up (free account)
3. Go to: https://openrouter.ai/keys
4. Copy your API key
5. Add to OpenClaw environment:

```bash
export OPENROUTER_API_KEY="<OPENROUTER_API_KEY>"
```

✅ **Verify**: 
```bash
curl https://api.openrouter.ai/api/v1/models \
  -H "Authorization: Bearer <OPENROUTER_API_KEY>"
```

### 2. Exa API Key

Get API key for web search (news + papers):

1. Visit: https://exa.ai/
2. Sign up (free tier available)
3. Copy your API key
4. Add to OpenClaw environment:

```bash
export EXA_API_KEY="..."
```

✅ **Verify**:
```bash
curl -X POST https://api.exa.ai/search \
  -H "x-api-key: ..." \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "numResults": 1}'
```

### 3. Database: Ensure User Exists

The jobs run for the first user in the database:

```sql
SELECT id, email FROM users LIMIT 1;
```

If no users exist, create one via the app or API.

---

## 🧪 Testing

### 1. Trigger Morning Spark

```bash
TOKEN=$(curl -s -X POST https://api.greenplot.ink/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "password": "your-password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/morning_spark \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response**: `{"status": "triggered", "job": "morning_spark"}`

### 2. Check Backend Logs

```bash
# Watch for [briefing] or [morning_spark] logs
tail -f openclaw-api.log | grep "Morning Spark\|Daily Briefing\|Reflection\|briefing"
```

**Expected Output**:
```
✅ Morning Spark generated
✓ Exa search returned 3 results for 'agentic systems AI news 2026'
```

### 3. Test in Frontend

1. Open Seedify app
2. Allow push notifications
3. Trigger the job via curl (step 1)
4. **You should see a SparkCard popup** at the bottom of the screen

### 4. Test All Briefing Types

```bash
# Test Daily Briefing (9:30 AM)
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/daily_briefing \
  -H "Authorization: Bearer $TOKEN"

# Test Reflection (4:00 PM)
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/reflection \
  -H "Authorization: Bearer $TOKEN"

# Test Weekly Eval (Sunday 6 PM)
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/weekly_eval \
  -H "Authorization: Bearer $TOKEN"

# Test Biweekly Challenge (1st/15th 10 AM)
curl -X POST https://api.greenplot.ink/api/v1/scheduler/trigger/biweekly_challenge \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📋 Checklist

- [ ] **OpenRouter API key** set in `.env` or OpenClaw environment
- [ ] **Exa API key** set in `.env` or OpenClaw environment
- [ ] **Database has at least 1 user** (for cron jobs to run)
- [ ] **Backend restarted** after env vars are set
- [ ] **Morning Spark trigger succeeds** (returns 200 OK)
- [ ] **Backend logs show** "✅ Morning Spark generated"
- [ ] **Frontend shows SparkCard** after triggering a job
- [ ] **SparkCard has multiple sections** (Weather, News, etc.)
- [ ] **"Chat about this" button works** (injects briefing as assistant message)
- [ ] **"Garden" button saves to seeds** (creates new seed entry)

---

## 📊 Monitoring

### Daily Checks

```bash
# Check if morning spark job ran today
grep "Morning Spark generated" openclaw-api.log | tail -1

# Check recent scheduler runs
grep -E "✅|❌" openclaw-api.log | tail -10
```

### Health Check

```bash
curl https://api.greenplot.ink/api/v1/scheduler/jobs \
  -H "Authorization: Bearer $TOKEN"
```

Response should list all 6 jobs with their schedules.

---

## 🐛 Troubleshooting

### Jobs not running on schedule?

1. Check timezone in `main.py`: Should be `timezone=_CET`
2. Check APScheduler logs: `grep "APScheduler started" openclaw-api.log`
3. Manually trigger to test: See Testing section above

### LLM failing?

```bash
# Test OpenRouter directly
curl https://api.openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer <OPENROUTER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/nemotron-super-49b-v1:free",
    "messages": [{"role": "user", "content": "Test"}]
  }'
```

### Web search failing?

```bash
# Test Exa directly
curl -X POST https://api.exa.ai/search \
  -H "x-api-key: ..." \
  -H "Content-Type: application/json" \
  -d '{"query": "AI news", "numResults": 3}'
```

### SparkCard not showing?

1. Check frontend console for errors
2. Verify push subscription is active: `navigator.serviceWorker.ready`
3. Check if notification payload has `sections` array (not just `title`/`body`)

---

## 📚 Documentation

- **BACKEND_BRIEFING_SETUP.md** — Full technical setup + architecture
- **BRIEFING_SPEC.md** — Detailed spec for each briefing type
- **WEEKLY_CHALLENGE_IDEAS.md** — Creative ideas + constraints

---

## ✨ What's Next?

After setup is complete:

1. **User onboarding** — Ask users to select their research interests (themes)
2. **Customization** — Let users choose which briefings to receive
3. **Time zones** — Add per-user timezone support (currently CET only)
4. **Per-user context** — Personalize briefings per user (currently uses first user in DB)
5. **Analytics** — Track which briefings are most engaged

---

**Questions?** Check the logs: `tail -f openclaw-api.log`

**Ready?** Time to start getting intelligent morning sparks! ☀️
