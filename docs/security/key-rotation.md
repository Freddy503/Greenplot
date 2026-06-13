# Key Rotation Runbook

One pass rotates every secret the app uses. Run it **before inviting the first
test users** and any time a key may have leaked (committed to git, pasted into
a chat or log, shared in a screenshot).

> Why now: the repo history contains an old `openclaw-api/.env`, a root `.env`
> with Odoo credentials, and at least one user JWT was pasted into chat
> transcripts. The repo is private, but rotation makes all of that history
> harmless without rewriting it.

## 1. Generate self-issued secrets (1 minute)

```bash
./scripts/rotate-keys.sh
```

Prints to stdout only (never written to disk): `SECRET_KEY`,
`HARVEST_API_KEY`, fresh `INVITE_CODES`, a VAPID keypair
(`VAPID_PRIVATE_KEY_BASE64` for the backend, `NEXT_PUBLIC_VAPID_KEY` for
Vercel), plus the provider checklist below.

## 2. Rotate provider keys (5–10 minutes, dashboards)

Create the new key first, then delete the old one:

| Env var | Where |
|---|---|
| `OPENROUTER_API_KEY` | <https://openrouter.ai/settings/keys> |
| `OPENAI_API_KEY` | <https://platform.openai.com/api-keys> |
| `RESEND_API_KEY` | <https://resend.com/api-keys> |
| `EXA_API_KEY` | <https://dashboard.exa.ai/api-keys> |
| `NVIDIA_API_KEY` | <https://build.nvidia.com> → profile → API keys |
| `GROQ_API_KEY` | <https://console.groq.com/keys> |
| `GITHUB_TOKEN` | <https://github.com/settings/tokens> — use fine-grained, repo-scoped |

Old Odoo credentials (`ODOO_PASSWORD` in the removed root `.env`) — change the
Odoo account password if that instance still exists; the integration itself is
retired.

## 3. Apply + redeploy (5 minutes)

On the server:

```bash
ssh root@<server>
cd /root/.openclaw/workspace && git pull
nano openclaw-api/.env        # paste the new values
cd openclaw-api && docker compose up -d --build
```

On Vercel: Project → Settings → Environment Variables → update
`NEXT_PUBLIC_VAPID_KEY` → redeploy.

## 4. Expected fallout (by design)

- **All sessions log out** — JWTs are signed with `SECRET_KEY`. The JWT pasted
  into past chats is dead the moment the backend restarts.
- **GitHub reconnect** — stored PATs are Fernet-encrypted with a key derived
  from `SECRET_KEY`; reconnect via Settings → GitHub.
- **Push re-opt-in** — VAPID change invalidates existing subscriptions; users
  toggle notifications on once.
- **Old magic-link invites die**; access-code invites use the new
  `INVITE_CODES`.

## 5. Optional: purge git history

Rotation makes leaked values worthless, so this is hygiene, not urgency.
If/when the repo gets collaborators:

```bash
pip install git-filter-repo
git filter-repo --invert-paths --path .env --path openclaw-api/.env --force
git push origin main --force
```

Then on the server re-clone (`git pull` will refuse after a history rewrite):

```bash
cd /root/.openclaw && mv workspace workspace.bak \
  && git clone https://github.com/Freddy503/Seedify.git workspace \
  && cp workspace.bak/openclaw-api/.env workspace/openclaw-api/.env \
  && cd workspace/openclaw-api && docker compose up -d --build
```

## 6. Verify

- `curl -s https://api.greenplot.ink/api/v1/auth/validate-code -X POST -H 'Content-Type: application/json' -d '{"code":"<new code>"}'` → `{"valid":true}`
- Old JWT → any authed endpoint returns 401.
- Log in fresh, send a chat message (OpenRouter key works), trigger a digest
  (Resend works), enable push (new VAPID works).
