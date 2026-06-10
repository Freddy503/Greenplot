# GitHub Repo Sync — PRDs Grounded in the Codebase — PRD

**Status:** ready · **Owner:** Freddy · **Target:** ~1.5 weeks

## Decision: repo-grounded + PRD-as-PR now; webhooks included (they're token-free)

Freddy's worry was token cost. The token math separates the options cleanly: **reading a repo costs tokens, syncing status does not.** Webhooks are plain API events — PR merged → flip board status involves zero LLM calls. So we take option 1 *and* the cheap half of option 3, and defer only the expensive part (LLM-driven "is this PRD stale?" analysis of diffs).

**Token economics (the design constraint):** we never ingest a repo. We build a cached **repo map** once per sync: file tree (depth ≤3, noise-filtered), README head, package/dependency manifest, and the first ~40 lines of up to 10 "hub" files (most-imported). Target ≤3K tokens, hard cap 4K, cached 24h in Redis. Injected only into PRD generation/vision flows — ~$0.001 per draft at Flash pricing. A 50-draft month adds cents.

## Problem Alignment

PRDs are generated blind to the codebase they'll land in: components float ("a TypeScript service") instead of naming real modules, and a coding agent receiving the spec must rediscover the repo from scratch — exactly the insufficient-context failure Vishnyakova (2026) describes. Meanwhile shipped specs live only inside Greenplot; the repo carries no trace of *why* code exists, and board status updates depend on the agent remembering to call `report_build_progress`.

## Solution Summary

Connect a GitHub repo per project. A **repo map builder** gives PRD generation and the vision chat real codebase context, so System Architecture sections name actual files and respect existing conventions. **Ship to GitHub** upgrades from issue-only to opening a PR that adds the PRD as `docs/specs/<slug>.md` (plus the linked issue). **Webhooks** close the loop without tokens: PR referencing a spec merges → spec flips to Built with the PR URL.

## System Architecture

- **Connection** (`github_sync.py`, new): v1 uses a fine-grained PAT stored encrypted per tenant (`github_connections` table: `id, tenant_id, repo_full_name, token_encrypted, default_branch, created_at`); GitHub App upgrade is v2. Settings → Integrations: paste PAT, pick repo, shown with connection health.
- **Repo map builder**: `GET /repos/{repo}/git/trees?recursive=1` + README + manifest via the REST API (no clone). Hub files ranked by import frequency from a single tree pass. Output stored `repo_maps` (Redis, key `repomap:{tenant}:{repo}`, TTL 24h, force-refresh action). Budget enforced by truncation at 4K tokens.
- **Generation hooks**: `auto_prd._gather_context` and the Shape-the-vision prefill append the repo map under a `REPOSITORY CONTEXT` header; Template v2 rubric then requires real paths (see `prd-generator-v2.md`).
- **Ship to GitHub v2** (`POST /api/v1/specs/{id}/ship`): creates branch `spec/<slug>`, commits the PRD markdown (with diagram link), opens a PR labeled `greenplot-spec`, opens the implementation issue referencing it, stores both URLs in seed metadata, sets `build_status='ready'`.
- **Webhook receiver** (`POST /api/v1/github/webhook`, HMAC-verified): on `pull_request.closed` with `merged=true`, match branch/body against stored spec PRs → `build_status='shipped'` + PR URL; on `issues.closed` → `building→shipped` fallback. Zero LLM calls.
- **MCP**: `get_spec` includes the repo map header so coding agents start oriented; new `get_repo_map` tool for explicit pulls.

## Data Model

`github_connections` (Postgres, above) · `repo_maps` (Redis only) · seed metadata gains `ship_pr_url`, `ship_issue_url`, `repo_full_name`.

## Acceptance Evals

1. Connect a repo → generate a PRD from a paper → System Architecture references ≥3 real paths from the repo.
2. Ship to GitHub → PR exists containing `docs/specs/<slug>.md`; issue links the PR; board shows Ready.
3. Merge the PR → within 1 min the board card is Built with the PR link, no agent call involved.
4. Repo map for the Seedify repo itself is ≤4K tokens (unit test with recorded tree).

## Delivery Risks & Open Questions

- PAT scope creep: fine-grained PAT limited to one repo, contents+issues+PRs RW; document rotation. App migration planned for multi-user.
- Webhook reachability through the Cloudflare tunnel: same path as the API — verify with GitHub's ping delivery first.
- Monorepos blow the map budget: v1 supports a configurable subpath filter.

## Milestones

1. Connection + repo map builder + Settings UI (3 days — eval 4)
2. Generation/vision/MCP grounding hooks (2 days — eval 1)
3. Ship-as-PR + webhook receiver (3 days — evals 2–3)
