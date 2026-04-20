# SECURITY_PLAN.md — Greenplot Production Hardening

_Full audit of security issues, production risks, and required changes before onboarding new users._
_Last updated: 2026-04-16_

---

## Severity Legend

| Label | Meaning |
|-------|---------|
| 🔴 CRITICAL | Exploitable now; data leak or full compromise possible |
| 🟠 HIGH | Significant risk; must fix before any new users |
| 🟡 MEDIUM | Real issue; fix before public launch |
| 🟢 LOW | Hygiene / hardening; fix when convenient |

## Breaking-Change Risk Legend

| Label | Meaning |
|-------|---------|
| 💥 BREAKING | App stops working or users get logged out if deployed wrong |
| ⚠️ RISKY | Can degrade experience if misconfigured |
| ✅ SAFE | Additive or no user-facing impact |

---

## TIER 1 — Fix Before Anything Else

### 1. API Keys Exposed in Git History
**Severity**: 🔴 CRITICAL | **Breaking risk**: ⚠️ RISKY

`openclaw-api/.env` was committed to git and contains live production secrets. Anyone with repo access can exhaust all external API budgets, impersonate the Google OAuth app, and send push notifications.

**Exposed keys (all need rotation):**
| Key | Provider |
|-----|----------|
| `OPENROUTER_API_KEY` | openrouter.ai |
| `OPENAI_API_KEY` | platform.openai.com |
| `EXA_API_KEY` | exa.ai |
| `BFL_API_KEY` | api.bfl.ai |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console |
| `VAPID_PRIVATE_KEY_BASE64` | Regenerate with `web-push generate-vapid-keys` |
| `RESEND_API_KEY` | resend.com |

**Breaking-change risk**: Rotating a key without updating the server `.env` immediately will break the corresponding feature (LLM calls, image gen, email, push). Update the server `.env` within minutes of each rotation.

**Fix — two steps:**

Step 1 — Rotate all keys at each provider dashboard.

Step 2 — Purge `.env` from git history:
```bash
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch openclaw-api/.env' \
  --prune-empty --tag-name-filter cat -- --all
git push origin --force --all
```
Add to `.gitignore`:
```
openclaw-api/.env
```

---

### 2. `/api/v1/admin/tenants` — Unauthenticated User Email Leak
**Severity**: 🔴 CRITICAL | **Breaking risk**: ✅ SAFE

**File**: `openclaw-api/app/main.py` (line ~1317)

No authentication is required. Returns every user's email address, ID, signup date, and subscription status. Trivially enumerable by anyone who knows the URL.

**Fix**: Delete the endpoint entirely. No frontend UI calls it. If admin tooling is needed later, rebuild it with proper role-based auth.

---

### 3. Hardcoded `HARVEST_API_KEY` Fallback
**Severity**: 🔴 CRITICAL | **Breaking risk**: ✅ SAFE (if key is set in server `.env`)

**Files**:
- `openclaw-api/app/config.py` line ~68: `HARVEST_API_KEY: str = "<HARVEST_API_KEY>"`
- `openclaw-api/app/main.py` line ~1976: `os.environ.get("HARVEST_API_KEY", "<HARVEST_API_KEY>")`

The harvest endpoints (`POST /api/v1/chat/harvest-all`, `POST /api/v1/chat/harvest`) iterate ALL users' chat sessions and can write seeds into any user's garden. The fallback value is publicly known from git history.

**Fix**: Remove both hardcoded fallbacks. If `HARVEST_API_KEY` is not set → return 503. Before deploying, add a fresh random key to server `.env`:
```bash
python3 -c "import secrets; print('HARVEST_API_KEY=' + secrets.token_hex(32))" >> .env
```

---

## TIER 2 — Fix Before Onboarding New Users

### 4. `SECRET_KEY` Defaults to Known Weak Value
**Severity**: 🟠 HIGH | **Breaking risk**: 💥 BREAKING

**File**: `openclaw-api/app/config.py` line 6: `SECRET_KEY: str = "<SECRET_KEY>"`

All JWTs are signed with this key. If it's not overridden, any attacker who knows the value (it's in git history) can forge valid JWTs and authenticate as any user.

**Breaking-change risk**: Making `SECRET_KEY` required (no default) will cause the API container to **refuse to start** if the env var is not set. Changing the key *value* invalidates all existing sessions — users get silently logged out.

**Required server action BEFORE deploying this fix**:
```bash
# On server:
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))" >> .env
# Verify:
grep SECRET_KEY .env
```

**Fix**: Change `config.py` line 6 to `SECRET_KEY: str` (no default). Pydantic raises `ValidationError` on startup if missing — a loud, intentional failure.

---

### 5. Source Code Volume-Mounted in Docker
**Severity**: 🟠 HIGH | **Breaking risk**: ⚠️ RISKY

**File**: `openclaw-api/docker-compose.yml` line ~28: `- .:/app`

The entire source directory (including `.env`) is mounted live into the running API container. Any path traversal or file read vulnerability exposes the full codebase and all secrets.

**Additional issues in the same file**:
- API port bound to all interfaces: `8001:8000` → should be `127.0.0.1:8001:8000`
- `localhost:3000,localhost:5173` in `CORS_ORIGINS` (dev only)
- Weaviate: `AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: 'true'`

**Breaking-change risk**: Removing `- .:/app` means the container runs the image that was baked at `docker build` time. Any code change requires a rebuild (`docker compose build api`). This is correct production behaviour — but the team must remember it.

**Fix**: Create `docker-compose.prod.yml` as an override:
```yaml
# docker-compose.prod.yml
services:
  api:
    volumes: []          # remove source mount
    ports:
      - "127.0.0.1:8001:8000"
  enrichment-worker:
    volumes: []
  weaviate:
    environment:
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: 'false'
```
Deploy with: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

---

### 6. No Rate Limiting
**Severity**: 🟠 HIGH | **Breaking risk**: ⚠️ RISKY

**File**: `openclaw-api/app/config.py` line ~37: `RATE_LIMIT_REQUESTS: int = 100` is defined but **never enforced**.

Any user — or bot — can make unlimited requests to every endpoint, including the most expensive ones. This is a direct cost risk: chat and image generation call paid external APIs on every request.

**Breaking-change risk**: Misconfigured limits (too tight, wrong key function) can block legitimate users. Use JWT user ID as the rate-limit key, not IP. Start with generous limits.

**Fix**: Add `slowapi` to `openclaw-api/requirements.txt`. Apply to expensive endpoints:
| Endpoint | Limit |
|----------|-------|
| `POST /api/v1/register` | 5/hour per IP |
| `POST /api/v1/chat`, `POST /api/v1/chat/v2` | 100/hour per user |
| `POST /api/v1/images/generate` | 20/day per user |
| `POST /api/v1/briefing` | 10/day per user |
| `POST /api/v1/thoughts` | 200/day per user |
| All others | 300/hour per user |

---

### 7. No Daily Usage Quotas
**Severity**: 🟠 HIGH | **Breaking risk**: ⚠️ RISKY

**File**: `openclaw-api/app/models.py` — `Usage` table (columns: `llm_tokens`, `images_generated`, `date`, `tenant_id`) exists and is populated but **never checked**.

Any user can generate unlimited LLM tokens and images at the operator's cost. A single abusive account can exhaust a monthly budget in hours.

**Breaking-change risk**: A bug in the quota check could incorrectly 429 all users. Always check for `None` before comparing (new users won't have a `Usage` row yet).

**Fix**: Add quota checks before chat, image gen, and briefing endpoints:
```python
from datetime import date
today = db.query(Usage).filter(
    Usage.tenant_id == current_user.tenant_id,
    Usage.date == date.today()
).first()
if today:
    if today.llm_tokens > 500_000:
        raise HTTPException(429, "Daily token limit reached. Resets at midnight UTC.")
    if today.images_generated >= 15:
        raise HTTPException(429, "Daily image limit reached. Resets at midnight UTC.")
```

---

### 8. Open Registration — No Verification or Gate
**Severity**: 🟠 HIGH | **Breaking risk**: ✅ SAFE

**File**: `openclaw-api/app/main.py` line ~152

Anyone can register with any email and immediately receive a valid JWT. No email verification, no invite requirement, no CAPTCHA. Enables:
- Account spam
- Fake email registrations
- Immediate access to all expensive features

**Fix (short-term — invite codes)**: Add `invite_code: Optional[str]` to `RegisterRequest`. Check against a hardcoded or DB-stored set before allowing registration. Lowest friction to implement.

**Fix (proper — email verification)**:
1. On registration, set `User.email_verified = False`
2. Send verification email via Resend with a signed token
3. Block chat/briefing/image endpoints until verified
4. Add `POST /api/v1/verify-email?token=...` endpoint

---

### 9. CORS — Overly Permissive + Dev Origins in Production
**Severity**: 🟡 MEDIUM | **Breaking risk**: ✅ SAFE

**File**: `openclaw-api/app/main.py` lines ~138–142

```python
allow_methods=["*"],   # should list specific methods
allow_headers=["*"],   # acceptable but verbose
```

The `CORS_ORIGINS` env var in `docker-compose.yml` also includes `http://localhost:3000,http://localhost:5173`. Combined with `allow_credentials=True`, this is a CSRF vector if a dev machine is ever on a shared network.

**Fix**:
```python
allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
```
Remove localhost origins from the production `CORS_ORIGINS` env var.

---

### 10. Debug Print Statements Expose Environment Variable Values
**Severity**: 🟡 MEDIUM | **Breaking risk**: ✅ SAFE

**File**: `openclaw-api/app/main.py` lines 43, 55–60, 69

At startup, the VAPID loading block prints partial env var values to stdout:
```python
print(f"DEBUG: _vapid_key_b64 = {_vapid_key_b64[:50] if _vapid_key_b64 else 'EMPTY'}", flush=True)
print(f"DEBUG: Decoded key starts with: {VAPID_PRIVATE_KEY[:30]}", flush=True)
```
These appear in Docker logs, which may be shipped to log aggregation services.

**Fix**: Replace all `print("DEBUG: ...")` with `logger.debug(...)`. Remove the key-value partial prints entirely.

Also present in: `openclaw-api/app/email_sender.py` (~10 prints), `openclaw-api/app/enricher.py` (~10 prints).

---

### 11. `/api/v1/admin/health` — Public Internal Status
**Severity**: 🟡 MEDIUM | **Breaking risk**: ✅ SAFE

**File**: `openclaw-api/app/main.py` line ~1273

No authentication required. Returns status of Weaviate, Postgres, OpenRouter, Redis, queue depth, and cache stats. Useful for reconnaissance before an attack.

**Fix**: Add optional Bearer check — if `Authorization` header present, validate it; if absent on a known monitoring IP, pass through. Or restrict to Cloudflare Access.

---

### 12. Hardcoded Database Credentials in docker-compose
**Severity**: 🟡 MEDIUM | **Breaking risk**: ⚠️ RISKY

**File**: `openclaw-api/docker-compose.yml` lines ~14–15
```yaml
DATABASE_URL=postgresql+psycopg2://postgres:${POSTGRES_PASSWORD}@db:5432/openclaw
```
Default `postgres:${POSTGRES_PASSWORD}` credentials on the DB container. Since port 5432 is bound to `127.0.0.1` only, exploitation requires existing server access — medium risk, not critical.

**Fix**: Move to env var substitution: `DATABASE_URL=${DATABASE_URL}`. Set a strong password on the server.

---

### 13. Push Notification — Mismatched VAPID Public Keys
**Severity**: 🟡 MEDIUM | **Breaking risk**: ✅ SAFE

Two different hardcoded VAPID public keys exist in the frontend:
- `src/hooks/use-push-notifications.ts` — one key
- `src/app/api/push/subscribe/route.ts` — a different key

Devices that subscribed with the wrong key will never receive push notifications (silent failure). Neither key is fetched from the backend dynamically.

**Fix**:
1. Add `GET /api/v1/push/public-key` endpoint on backend that returns the matching public key
2. Unify both frontend files to fetch from this endpoint
3. Remove hardcoded keys

---

### 14. Push Subscriptions Stored in JSON (Lost on Redeploy)
**Severity**: 🟡 MEDIUM | **Breaking risk**: ✅ SAFE

**File**: `openclaw-api/app/main.py` — subscriptions saved to `/data/push_subscriptions.json`

Every fresh container deployment clears this file. Users must re-enable push notifications after each deploy.

**Fix**: Migrate to a `PushSubscription` DB table (Postgres). Schema:
```sql
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 15. No Database Migration System (Alembic)
**Severity**: 🟢 LOW | **Breaking risk**: ⚠️ RISKY (on schema changes with live data)

**File**: `openclaw-api/app/main.py` lines ~81–110

Schema changes are applied via raw `ALTER TABLE` SQL at startup — fragile and error-prone. No rollback mechanism. Will cause pain on the first breaking schema change with real user data.

**Fix**: Add Alembic:
```bash
pip install alembic
alembic init alembic
# Generate initial migration from existing models
alembic revision --autogenerate -m "initial"
alembic upgrade head
```

---

### 16. API Container Runs as Root
**Severity**: 🟢 LOW | **Breaking risk**: ✅ SAFE

**File**: `openclaw-api/Dockerfile`

No `USER` directive — container runs as root. Any container escape gives root on the host.

**Fix**: Add to Dockerfile:
```dockerfile
RUN adduser --disabled-password --gecos '' appuser
USER appuser
```

---

## Required Server Actions Before Code Deploy

These must happen on the server **before** pushing Tier 2 code changes:

```bash
cd /root/.openclaw/workspace/openclaw-api

# 1. Generate and add SECRET_KEY (required before making it non-optional in code)
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))" >> .env

# 2. Generate and add HARVEST_API_KEY (required before removing fallback in code)
python3 -c "import secrets; print('HARVEST_API_KEY=' + secrets.token_hex(32))" >> .env

# 3. Verify both are set
grep -E "SECRET_KEY|HARVEST_API_KEY" .env
```

---

## Complete Environment Variable Reference

### Required (startup fails without these — after Tier 2 fix)
```
SECRET_KEY                    # Min 32 chars, cryptographically random
DATABASE_URL                  # postgresql+psycopg2://user:pass@host/db
SYNC_DATABASE_URL             # Same as DATABASE_URL
OPENROUTER_API_KEY            # LLM API
EXA_API_KEY                   # Web search
```

### Should be set (features degrade without these)
```
GOOGLE_CLIENT_ID              # Calendar OAuth
GOOGLE_CLIENT_SECRET          # Calendar OAuth
GOOGLE_REDIRECT_URI           # Calendar OAuth callback
RESEND_API_KEY                # Email digest + welcome email
BFL_API_KEY                   # Image generation
VAPID_PRIVATE_KEY_BASE64      # Web push notifications
FRONTEND_URL                  # https://greenplot.ink
CORS_ORIGINS                  # Prod origins only, no localhost
HARVEST_API_KEY               # Internal job trigger (no fallback after fix)
```

### Optional (graceful degradation)
```
OPENAI_API_KEY                # Whisper voice, vision fallback
NVIDIA_API_KEY                # Enrichment model fallback
WEAVIATE_URL                  # Defaults to http://weaviate:8080
REDIS_URL                     # Defaults to redis://redis:6379/0
WEAVIATE_CLASS                # Defaults to IdeaSeed
```

---

## Implementation Order

Execute in this order to avoid downtime:

1. **Server**: Add `SECRET_KEY` + `HARVEST_API_KEY` to server `.env`
2. **Code**: Delete `/api/v1/admin/tenants`, remove HARVEST fallback, make SECRET_KEY required → commit + push → rebuild server
3. **Providers**: Rotate all API keys → update server `.env` → `docker compose restart api`
4. **Git**: Purge `.env` from history, add to `.gitignore` → force push
5. **Code**: Add slowapi rate limiting → commit + push → rebuild
6. **Code**: Add usage quota checks → commit + push → rebuild
7. **Code**: Add invite code gate to registration → commit + push → rebuild
8. **Code**: Create `docker-compose.prod.yml`, fix CORS, remove debug prints → commit + push → rebuild using prod file
9. **Later**: Fix VAPID key mismatch, migrate push subscriptions to DB, add Alembic

---

## Verification Checklist

After each deployment:

- [ ] `curl https://api.greenplot.ink/api/v1/admin/tenants` → 404 or 401 (not a user list)
- [ ] Start API without `SECRET_KEY` in env → container exits, does not start
- [ ] Send 101 chat requests in one hour → 429 on the 101st
- [ ] Register with no invite code (after item 7) → 403
- [ ] `docker exec api ls /app/.env` → no such file (prod compose only)
- [ ] Run `openclaw-api/tests/e2e_test.py` → all 13 tests pass
