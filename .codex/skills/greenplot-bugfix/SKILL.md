---
name: greenplot-bugfix
description: Structured bug research and repair workflow for Freddy503/Greenplot. Use when Codex is asked to audit, fix, verify, commit, deploy, or summarize bugs in the Greenplot Next.js frontend/API proxy and related backend-facing routes, especially repeated bugfix runs that should compound from prior findings.
---

# Greenplot Bugfix

## Operating Loop

State the verification plan before touching files. Then run the loop in this order:

1. Inspect the repo rules, branch, scripts, app shape, and dirty state.
2. Run the baseline checks: `npm ci`, `npm run build`, `npm run lint`, and targeted searches for auth, proxying, redirects, cron, token handling, public fetches, and SSRF surfaces.
3. Rank findings by impact/effort. Prefer deploy-blocking, auth/security, data-loss, and broken primary workflows before broad lint cleanup.
4. Patch narrowly. Keep frontend and backend/API changes in as few commits as practical.
5. Verify with build/lint plus targeted HTTP smoke checks or UI checks for every touched route.
6. Update this skill when a reusable bug pattern appears.
7. Summarize what changed, what was verified, remaining risks, and exact SSH/deploy commands if deployment is requested or implied.

## Greenplot Project Facts

Treat Greenplot as a Next.js App Router project with many `src/app/api/**/route.ts` handlers proxying to `BACKEND_URL` and a lightweight auth proxy in `src/proxy.ts`.

Official checks are:

```bash
npm ci
npm run build
npm run lint
```

Lint currently has many existing warnings. A successful run with warnings is not itself a failure, but new warnings in touched files should be investigated.

## High-Value Research Queries

Use `rg` before manual browsing:

```bash
rg -n "process\\.env|BACKEND|fetch\\(|NextResponse\\.redirect|new URL\\(|authorization|Bearer|token=" src/app/api src/proxy.ts src/lib
rg -n "TODO|FIXME|HACK|@ts-ignore|eslint-disable|throw new Error|console\\.error|any\\b" src --glob '!**/*.css'
rg -n "window\\.open|download|export|subscribe|cron|secret|webhook" src/app src/components src/hooks
find src/app/api -name route.ts -maxdepth 5 | sort
```

When a proxy/auth change is suspected, also inspect the client call sites that hit the route. Avoid fixes that secure an endpoint by silently breaking the UI's auth transport.

## Learned Bug Patterns

### Auth Proxy Root Prefix

Do not place `/` in a public-prefix list that is checked with `pathname.startsWith(p)`. That makes every route public. Use exact public page paths for `/`, and keep public API prefixes separate from public exact paths.

After changing `src/proxy.ts`, smoke-test at least:

```bash
curl -s -o /tmp/out -w '%{http_code}' http://localhost:PORT/api/seeds
curl -s -o /tmp/out -w '%{http_code}' -X POST http://localhost:PORT/api/chat -H 'Content-Type: application/json' --data '{"messages":[]}'
curl -s -o /tmp/out -w '%{http_code}' http://localhost:PORT/login
curl -s -o /tmp/out -w '%{http_code}' http://localhost:PORT/api/push/subscribe
curl -s -o /tmp/out -w '%{http_code}' -X POST http://localhost:PORT/api/push/subscribe -H 'Content-Type: application/json' --data '{"subscription":{"endpoint":"x"}}'
```

Expected shape: protected API routes without Bearer return `401`; public pages return `200`; public push-key GET may return `503` when VAPID is unconfigured but must not return `401`; push subscription POST without Bearer returns `401`.

### Cron Fail-Closed

Cron/admin trigger routes must fail closed when their secret is missing. A pattern like `if (SECRET && auth !== SECRET)` leaves the route public whenever the environment is misconfigured. Prefer:

```ts
if (!SECRET) return NextResponse.json({ error: 'Secret is not configured' }, { status: 503 })
if (auth !== `Bearer ${SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### Bearer Tokens In Query Strings

Avoid adding new routes that accept long-lived Bearer tokens via query params. Query tokens leak through browser history, logs, analytics, and referrers. Prefer `Authorization` headers. If an existing download route needs `window.open`, either keep the change scoped out or add a deliberate short-lived download-token flow.

### Push Subscribe Exception

`GET /api/push/subscribe` is public because the browser needs the VAPID public key. `POST /api/push/subscribe` should require user auth because it registers a subscription for a user.

### React Compiler Purity Warnings

Treat React Compiler warnings in touched UI files as runtime risk, not style-only lint. In client components, avoid `Math.random()`, `Date.now()`, or other impure calls during render and inside JSX animation props. Prefer deterministic module-level constants, lazy event-time values, or state initialized from explicit user actions. Also declare callbacks before other callbacks that invoke them so hook dependencies stay truthful.

## Verification Discipline

For every fix, pair broad checks with route-level checks:

- Build/type safety: `npm run build`
- Static hygiene: `npm run lint`
- Local server: `npm run start -- -p PORT`
- HTTP smoke tests: check status codes for public, protected, and misconfigured-secret paths

Stop the local server before finishing unless the user explicitly asked to keep it running.

## Commit Discipline

Prefer one commit for related API/backend security fixes and a separate commit only if frontend UI behavior changes. Include commit messages that name the production risk, not just the file touched.

When summarizing deployment, include SSH commands in this shape and adapt host/path/service names to the actual deployment:

```bash
ssh <deploy-user>@<host>
cd <greenplot-deploy-path>
git fetch origin
git checkout <branch-or-main>
git pull --ff-only
npm ci
npm run build
pm2 restart <greenplot-service>
```
