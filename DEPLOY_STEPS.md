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

## Backend deploys (image-based — no more `git pull` to deploy)

The backend now runs a **published image**, not bind-mounted source. CI (`.github/workflows/ci.yml`) builds `openclaw-api/` and pushes to
`ghcr.io/freddy503/greenplot-api` (tags: `latest` + `sha-<commit>`) on every green push to `main`. The running version is whatever image the host pulled — it no longer depends on the host's git checkout, which is what caused the `ModuleNotFoundError: app.neo4j_graph` incident.

### One-time host setup
The GHCR package is private by default, so the host needs read access once:
```bash
# Create a token with read:packages at https://github.com/settings/tokens
echo <TOKEN> | docker login ghcr.io -u Freddy503 --password-stdin
```

### Deploy a new build (manual)
```bash
cd ~/Greenplot/openclaw-api
docker compose pull            # fetch the latest image from GHCR
docker compose up -d --remove-orphans
```
Do **not** use `docker compose up --build` on the server — that rebuilds from
local source and reintroduces drift. Use `pull`.

### Roll back / pin a specific build
```bash
IMAGE_TAG=sha-<commit> docker compose up -d   # any tag visible in the GHCR package
```

### Optional: automatic deploys (Watchtower, no inbound SSH)
After the one-time `docker login` above, start the bundled watcher:
```bash
docker compose --profile autodeploy up -d watchtower
```
It polls GHCR every 120s and recreates only the scoped `api`/`worker`
containers when a new image is published. No deploy key is stored in GitHub and
no port is opened to the host.
