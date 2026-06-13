# Greenplot — Launch Reference & Roadmap

The single doc to consult before, during, and after the private-beta rollout.
Companion runbooks: [security/key-rotation.md](security/key-rotation.md) ·
[mcp-coding-agents.md](mcp-coding-agents.md).

---

## 1 · One-time setup you (Freddy) must do

These are *developer-side* registrations — done once, they serve every user.

### 1.1 GitHub OAuth app — why registration is needed

"Connect with GitHub" can't exist without it. OAuth works like this: GitHub
shows users a consent screen — *"**Greenplot** wants access to your
repositories"* — and that "Greenplot" identity **is** the OAuth app you
register. It's not about connecting *your* GitHub; it's minting Greenplot's
identity card so *users* can connect theirs with one click. Without it, the
Settings UI automatically falls back to the manual PAT flow (which still
works, and now auto-installs the webhook too).

Register once (≈5 min): <https://github.com/settings/developers> → **New
OAuth App**:

| Field | Value |
|---|---|
| Application name | Greenplot |
| Homepage URL | `https://greenplot.ink` |
| Authorization callback URL | `https://api.greenplot.ink/api/v1/github/oauth/callback` |

Then in the server `openclaw-api/.env`:

```
GITHUB_OAUTH_CLIENT_ID=<client id>
GITHUB_OAUTH_CLIENT_SECRET=<client secret>
```

Trade-off to know: OAuth apps get classic `repo` scope (all the user's
repos). If beta users push back, the upgrade path is a **GitHub App**
(per-repo install permissions, auto-managed tokens) — more setup, finer
grain. PAT flow remains for the cautious.

### 1.2 Email — Resend

`RESEND_API_KEY` must be set or invite mails silently can't send. Domain
`greenplot.ink` must be verified in Resend.

### 1.3 Backups — rclone remote (off-site)

On the server, once: `rclone config` → create a remote named **`gp-backup`**
(Backblaze B2 ~$0/month at this scale, or any S3/Drive). The nightly script
picks it up automatically. See §3.

---

## 2 · Pre-launch checklist (in order)

1. **Rotate every key** — `./scripts/rotate-keys.sh`, follow
   [security/key-rotation.md](security/key-rotation.md). Kills the JWT pasted
   in old chats, re-keys GitHub PAT encryption, fresh invite codes.
2. **Set the gate** in server `.env`: `INVITE_CODES=<fresh codes>` and
   `INVITE_REQUIRED=true` (default is off!).
3. **Redeploy backend**:
   `cd /root/.openclaw/workspace && git pull && cd openclaw-api && docker compose up -d --build`
4. **Install the backup cron** (§3) and run it once by hand; confirm the
   archive appears and (if configured) lands off-site.
5. **Smoke the critical paths** (10 min):
   - `curl -X POST https://api.greenplot.ink/api/v1/auth/validate-code -d '{"code":"<code>"}' -H 'Content-Type: application/json'` → `{"valid":true}`
   - Send yourself an invite → tap the deep link → onboarding pre-validated → register a throwaway → first chat shows starter card → plant a thought → it appears in Garden.
   - Push opt-in on the phone (installed PWA) → trigger a briefing → banner → sheet.
   - Settings: mint an MCP key → `tools/list` curl from [mcp-coding-agents.md](mcp-coding-agents.md).
   - `/admin` shows you the dashboard (and shows "Nothing here." in an incognito session).
6. **Impressum address**: get a virtual business address (Impressum-Service /
   virtual office, ~€10–30/mo) and replace the `[Anschrift folgt]` placeholder
   in `src/app/impressum/page.tsx` — §5 DDG requires a real summonable
   address; home address stays private this way.
7. **Invite the first wave**:
   ```bash
   curl -X POST https://api.greenplot.ink/api/v1/admin/invite \
     -H "x-api-key: $HARVEST_API_KEY" -H "Content-Type: application/json" \
     -d '{"emails": ["a@b.com"], "code": "<CODE>"}'
   ```

### Known launch caveats

- Backend is a single Hetzner VPS behind a Cloudflare tunnel — solid for beta,
  but one box: a crash means downtime until restart, and nightly backups mean
  up to ~24h of data in the loss window (§5, infra).
- iOS share-sheet capture is limited by Safari; Android + desktop Chrome get
  the full share target.
- LLM cost figure on `/admin` is an estimate (blended $/Mtok constant in
  `src/app/admin/page.tsx`), for trend-watching not accounting.

---

## 3 · Operations

### Deploy

- **Frontend**: push to `main` → Vercel auto-deploys.
- **Backend**: `cd /root/.openclaw/workspace && git pull && cd openclaw-api && docker compose up -d --build`
  — required whenever `openclaw-api/` changes. "Feature 404s in prod" almost
  always means this step was skipped.
- **`.env` changes**: `docker compose up -d` does NOTHING when only `.env`
  changed (compose sees no config diff). Use `docker restart openclaw-api`
  (+ `docker restart openclaw-worker` if the var matters to background jobs).
  Rule of thumb: code → `up -d --build`; env → `restart`.

### Backups (`scripts/backup.sh`)

Nightly cron on the server:

```
30 3 * * * /root/.openclaw/workspace/scripts/backup.sh >> /var/log/gp-backup.log 2>&1
```

Captures Postgres (pg_dump), the Weaviate volume, push-subscription data,
the wiki directory, and `.env`; keeps 14 local archives; syncs off-site when
the `gp-backup` rclone remote exists. **Restore steps are documented at the
bottom of the script.** Test a restore once before launch — a backup that's
never been restored is a hope, not a backup.

### Monitoring

- **`/admin`** (ADMIN_EMAILS-gated): users, seeds, specs, tokens/day,
  estimated 30-day LLM cost, per-user activity.
- Sentry is wired when `SENTRY_DSN` is set.
- `GET /api/v1/admin/health` for service checks.

### Incident quick refs

- All users logged out unexpectedly → `SECRET_KEY` changed (intended after rotation).
- Invite mail not arriving → `RESEND_API_KEY` unset/rotated wrong, check API logs.
- Chat replies missing → confirm backend redeployed past commit `0032ae4` (agent-loop fixes).

---

## 4 · "Greenplot starts building" — dispatch assessment

Goal: a **Build this** button on a Ready PRD that produces a PR without the
user driving a coding agent by hand.

### OpenHands — yes, this is the engine

OpenHands (MIT) runs autonomous coding agents in sandboxed Docker runtimes
and ships a **GitHub resolver**: label an issue, OpenHands picks it up,
implements, and opens a PR. That snaps onto what Greenplot already does:

> Ship to GitHub already opens a PR + **implementation issue** → label it
> (e.g. `fix-me`) → an OpenHands instance (their cloud, or a $20 GPU-less
> VPS) resolves it → PR opens → existing webhook flips the board to
> **Built**.

Integration cost is small because the contract is GitHub itself: milestone 1
is "Ship to GitHub also applies the resolver label" + a settings toggle.
No sandbox infra to build, tenant isolation comes free (it runs against the
user's repo with the user's GitHub auth). The richer version later: OpenHands
agents get the user's Greenplot MCP key so the builder can read the full
garden context while implementing.

### Sia (hexo-ai/sia) — not for dispatch; file under "later, maybe"

Sia is a **self-improvement loop for benchmark tasks**: a meta-agent
generates a task agent, a feedback agent reviews logs and rewrites it across
generations, optimizing a *score*. Building a PRD has no automatic score
today, so Sia has nothing to climb — wrong tool for dispatch. It becomes
interesting exactly when the roadmap's **acceptance-eval runner** exists:
evals give builds a score, and then a Sia-style loop could evolve better
build agents against your own spec corpus. Sequence: dispatch (OpenHands) →
eval runner → only then revisit Sia.

---

## 5 · Roadmap (post-launch, in recommended order)

| # | Feature | Why | Size |
|---|---|---|---|
| 1 | **Feedback-driven fixes** from wave 1 | The whole point of a beta | — |
| 2 | **Agent dispatch via OpenHands resolver** (§4) | Completes Idea-to-Build; the demo nobody else has | ~1 wk |
| 3 | **Telegram capture bot** | Text a thought → seed; `gp_live_` keys make auth trivial | 1–2 d |
| 4 | **Uptime alerting** | healthchecks.io/UptimeRobot on `/api/v1/admin/health` + a ping when the backup cron fails — know about downtime before users do | ~2 h |
| 5 | **Acceptance-eval runner** | "Shipped" becomes *verified*, not just merged; unlocks Sia-style loops | ~1 wk |
| 6 | **Review queue / resurfacing** | Decay scores exist; surface 3 fading seeds in the briefing with 1-tap actions | ~3 d |
| 7 | **Public share links** (`/share/{token}` read-only wiki/PRD) | Beta users showing work = growth loop | 2–3 d |
| 8 | **Email-in capture** (`plant@greenplot.ink` via Resend inbound) | Newsletters/papers → seeds | ~2 d |
| 9 | **Stripe billing** | Fields exist on User; gate before opening past beta | ~1 wk |
| 10 | **GitHub App** (upgrade from OAuth app) | Per-repo permissions if users push back on `repo` scope | ~4 d |

Engineering debt to schedule alongside (not features): Alembic migrations
(startup `ALTER TABLE` won't scale), a smoke-test suite for `main.py`'s
critical paths, git-history purge once collaborators join
([key-rotation.md §5](security/key-rotation.md)).

---

## 6 · Env var reference (server `openclaw-api/.env`)

| Var | Purpose |
|---|---|
| `SECRET_KEY` | JWT signing + Fernet keying — rotate via script |
| `INVITE_CODES` / `INVITE_REQUIRED` | Beta gate (comma list / `true` to enforce) |
| `HARVEST_API_KEY` | Admin invite endpoint auth |
| `ADMIN_EMAILS` | Who sees `/admin` + admin endpoints |
| `RESEND_API_KEY` / `EMAIL_FROM` | Invite + digest mail |
| `OPENROUTER_API_KEY` / `CHAT_MODEL` / `ENRICH_MODEL` | LLM gateway |
| `DAILY_TOKEN_LIMIT` | Per-user daily LLM cap |
| `VAPID_PRIVATE_KEY_BASE64` | Web push (frontend pair: `NEXT_PUBLIC_VAPID_KEY` on Vercel) |
| `GITHUB_OAUTH_CLIENT_ID/SECRET` | One-click GitHub connect (§1.1) |
| `EXA_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `NVIDIA_API_KEY` | Search / Whisper / misc |
| `SENTRY_DSN` | Error monitoring |
| `FRONTEND_URL` | Used in invite links + OAuth redirects — must be the prod URL |
