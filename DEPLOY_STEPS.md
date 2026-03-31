# Deploy Guide — Seedify

## Architecture
- **Frontend:** Next.js on Vercel → `seedify-six.vercel.app` (will move to `greengarden.ink`)
- **Backend:** FastAPI in Docker → tunneled via Cloudflare named tunnel
- **Tunnel URL:** `https://api.greengarden.ink`
- **Tunnel ID:** `0416fc12-a95d-4dfd-9782-5973918bf583`
- **Supabase:** `https://kpdxrpeuzwzilonvjzcy.supabase.co`

## DNS (Cloudflare — greengarden.ink)
| Type | Name | Target | Status |
|------|------|--------|--------|
| A | @ | 216.198.79.1 | ✅ (Vercel) |
| CNAME | api | 0416fc12...cfargotunnel.com | ✅ (Tunnel) |
| TXT | _vercel | vc-domain-verify=... | ✅ |

## Step 1: Run SQL in Supabase
Go to Supabase → SQL Editor → paste & run:
`/root/.openclaw/workspace/supabase/schema.sql`

## Step 2: Get Supabase JWT Secret
Settings → API → JWT Secret → send to assistant

## Step 3: Vercel Environment Variables
Settings → Environment Variables → add:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://kpdxrpeuzwzilonvjzcy.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_BgHcdX6tei-jFcr2qRdTqQ_taKgt3qr`
- `NEXT_PUBLIC_API_URL` = `https://api.greengarden.ink`

## Step 4: Push to GitHub
```bash
cd /root/.openclaw/workspace
git add -A && git commit -m "Add Supabase config and new tunnel URL" && git push
```

## Step 5: Test
Open https://seedify-six.vercel.app → sign up → send a message

## Tunnel Service
```bash
systemctl status cloudflared-seedify   # check
systemctl restart cloudflared-seedify  # restart
journalctl -u cloudflared-seedify -f   # logs
```
Config: `/root/.cloudflared/config.yml`
Auto-starts on boot via systemd.
