#!/usr/bin/env bash
# rotate-keys.sh — generate every self-issued secret in one pass and print the
# manual rotation checklist for provider keys.
#
# Prints secrets to stdout ONLY. Never writes them to disk or git.
# Usage:  ./scripts/rotate-keys.sh
# Then:   paste the generated block into openclaw-api/.env on the server,
#         rotate the provider keys listed in the checklist, and redeploy.
#
# Full runbook: docs/security/key-rotation.md
set -euo pipefail

echo "──────────────────────────────────────────────────────────"
echo " Greenplot key rotation — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "──────────────────────────────────────────────────────────"
echo
echo "# ── Self-issued secrets (paste into openclaw-api/.env) ──"
echo "SECRET_KEY=$(openssl rand -hex 32)"
echo "HARVEST_API_KEY=$(openssl rand -hex 24)"

# Three fresh 6-char invite codes (A-Z, no ambiguous 0/O/1/I)
python3 - <<'PYEOF'
import secrets
alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
codes = [''.join(secrets.choice(alphabet) for _ in range(6)) for _ in range(3)]
print(f"INVITE_CODES={','.join(codes)}")
PYEOF

# VAPID keypair (openssl only, no python deps):
# private as base64(PKCS8 PEM) for the backend,
# public as base64url(raw uncompressed point) for the frontend (NEXT_PUBLIC_VAPID_KEY)
VAPID_TMP="$(mktemp -d)"
trap 'rm -rf "$VAPID_TMP"' EXIT
openssl ecparam -name prime256v1 -genkey -noout 2>/dev/null \
  | openssl pkcs8 -topk8 -nocrypt -out "$VAPID_TMP/vapid.pem" 2>/dev/null
echo "VAPID_PRIVATE_KEY_BASE64=$(base64 < "$VAPID_TMP/vapid.pem" | tr -d '\n')"
echo
echo "# ── Vercel env (frontend) ──"
# Raw public point = last 65 bytes of the DER-encoded public key
echo "NEXT_PUBLIC_VAPID_KEY=$(openssl ec -in "$VAPID_TMP/vapid.pem" -pubout -outform DER 2>/dev/null \
  | tail -c 65 | base64 | tr '+/' '-_' | tr -d '=\n')"

cat <<'CHECKLIST'

# ── Provider keys: rotate in each dashboard, then update .env ──
#  OPENROUTER_API_KEY   https://openrouter.ai/settings/keys
#  OPENAI_API_KEY       https://platform.openai.com/api-keys
#  RESEND_API_KEY       https://resend.com/api-keys
#  EXA_API_KEY          https://dashboard.exa.ai/api-keys
#  NVIDIA_API_KEY       https://build.nvidia.com (profile → API keys)
#  GROQ_API_KEY         https://console.groq.com/keys
#  GITHUB_TOKEN         https://github.com/settings/tokens (fine-grained, repo-scoped)
#  SENTRY_DSN           only if it leaked (Sentry → project settings → client keys)

# ── After updating .env, redeploy ──
#  ssh server, then:
#    cd /root/.openclaw/workspace && git pull \
#      && cd openclaw-api && docker compose up -d   # recreates with new .env; no rebuild
#  Vercel: update NEXT_PUBLIC_VAPID_KEY env var → redeploy.

# ── Side effects of rotating SECRET_KEY ──
#  • Every JWT is invalidated — all users (including you) must log in again.
#  • GitHub PATs stored by repo-sync are Fernet-encrypted with SECRET_KEY:
#    users must reconnect GitHub in Settings.
#  • Magic-link invite tokens already sent become invalid (code invites keep working).
# ── Side effect of rotating VAPID ──
#  • Existing push subscriptions go stale — users re-enable pushes once.
CHECKLIST
