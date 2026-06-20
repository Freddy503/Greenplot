"""
GitHub Repo Sync — PRDs grounded in the codebase.

Spec: docs/specs/github-repo-sync.md

One repo per tenant (fine-grained PAT, v1). A cached repo map (≤4K tokens)
grounds PRD/vision generation; Ship-to-GitHub opens a PR adding the spec under
docs/specs/ plus an implementation issue; a webhook flips the board to Built
on merge with zero LLM calls.
"""

import base64
import hashlib
import hmac
import json
import logging
import re
import uuid as _uuid
from datetime import datetime

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger(__name__)

GH_API = "https://api.github.com"
MAP_CHAR_BUDGET = 16_000  # ≈4K tokens
EXCLUDE_DIRS = ("node_modules/", ".git/", "dist/", "build/", ".next/", "venv/",
                "__pycache__/", ".venv/", "coverage/", "vendor/", "out/")
EXCLUDE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2",
               ".lock", ".map", ".min.js", ".pdf", ".mp4", ".webp")
HUB_PATTERN = re.compile(r"(^|/)(main|index|app|server|routes?|models|api|setup|config)\.(py|ts|tsx|js|go|rs)$")


# ── Token encryption (Fernet keyed off SECRET_KEY; plaintext fallback) ────────

def _fernet():
    try:
        from cryptography.fernet import Fernet
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
        return Fernet(key)
    except Exception:
        return None


def _enc(token: str) -> str:
    f = _fernet()
    return f.encrypt(token.encode()).decode() if f else token


def _dec(token_enc: str) -> str:
    f = _fernet()
    if not f:
        return token_enc
    try:
        return f.decrypt(token_enc.encode()).decode()
    except Exception:
        return token_enc  # row predates encryption


def _gh_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"}


# ── Connection CRUD ───────────────────────────────────────────────────────────

def get_connection(tenant_id: str, db: Session) -> dict | None:
    row = db.execute(text(
        "SELECT id, repo_full_name, token_enc, default_branch, webhook_secret "
        "FROM github_connections WHERE tenant_id = :t"
    ), {"t": tenant_id}).fetchone()
    if not row:
        return None
    return {"id": str(row[0]), "repo_full_name": row[1], "token": _dec(row[2]),
            "default_branch": row[3], "webhook_secret": row[4]}


WEBHOOK_URL = "https://api.greenplot.ink/api/v1/github/webhook"


def ensure_webhook(repo_full_name: str, token: str, secret: str) -> bool:
    """Create the merge→Built webhook on the repo (idempotent). Returns True
    when the hook exists or was created; False when the token can't manage
    hooks (fine-grained PAT without Webhooks permission) — the UI then shows
    the manual instructions."""
    try:
        resp = httpx.get(f"{GH_API}/repos/{repo_full_name}/hooks",
                         headers=_gh_headers(token), timeout=15)
        if resp.status_code == 200:
            for hook in resp.json():
                if (hook.get("config") or {}).get("url") == WEBHOOK_URL:
                    return True
        elif resp.status_code in (403, 404):
            return False
        resp = httpx.post(
            f"{GH_API}/repos/{repo_full_name}/hooks",
            headers=_gh_headers(token), timeout=15,
            json={"name": "web", "active": True, "events": ["pull_request"],
                  "config": {"url": WEBHOOK_URL, "content_type": "json", "secret": secret}},
        )
        return resp.status_code in (200, 201)
    except Exception as e:
        logger.warning(f"[github] webhook auto-create failed for {repo_full_name}: {e}")
        return False


def connect_repo(tenant_id: str, repo_full_name: str, token: str, db: Session) -> dict:
    """Validate the token against the repo, upsert the connection, and try to
    install the merge→Built webhook automatically."""
    resp = httpx.get(f"{GH_API}/repos/{repo_full_name}", headers=_gh_headers(token), timeout=15)
    if resp.status_code == 404:
        raise ValueError("Repo not found — check the name and that the token can access it")
    if resp.status_code == 401:
        raise ValueError("Token rejected by GitHub")
    resp.raise_for_status()
    default_branch = resp.json().get("default_branch", "main")
    webhook_secret = hashlib.sha256(f"{settings.SECRET_KEY}:{repo_full_name}".encode()).hexdigest()[:32]

    db.execute(text("DELETE FROM github_connections WHERE tenant_id = :t"), {"t": tenant_id})
    db.execute(text(
        "INSERT INTO github_connections (id, tenant_id, repo_full_name, token_enc, default_branch, webhook_secret, created_at) "
        "VALUES (:id, :t, :r, :tok, :b, :w, NOW())"
    ), {"id": str(_uuid.uuid4()), "t": tenant_id, "r": repo_full_name,
        "tok": _enc(token), "b": default_branch, "w": webhook_secret})
    db.commit()
    # Invalidate any stale map
    try:
        from app.cache import get_redis
        get_redis().delete(f"repomap:{tenant_id}")
    except Exception:
        pass

    webhook_auto = ensure_webhook(repo_full_name, token, webhook_secret)
    return {"repo_full_name": repo_full_name, "default_branch": default_branch,
            "webhook_secret": webhook_secret, "webhook_auto": webhook_auto}


def store_pending_oauth_token(tenant_id: str, token: str, db: Session):
    """OAuth callback landed but no repo picked yet — park the token in a
    connection row with an empty repo name."""
    db.execute(text("DELETE FROM github_connections WHERE tenant_id = :t"), {"t": tenant_id})
    db.execute(text(
        "INSERT INTO github_connections (id, tenant_id, repo_full_name, token_enc, default_branch, webhook_secret, created_at) "
        "VALUES (:id, :t, '', :tok, 'main', '', NOW())"
    ), {"id": str(_uuid.uuid4()), "t": tenant_id, "tok": _enc(token)})
    db.commit()


def get_stored_token(tenant_id: str, db: Session) -> str | None:
    """Decrypted token from the tenant's connection row (pending or active)."""
    conn = get_connection(tenant_id, db)
    return _dec(conn["token_enc"]) if conn else None


def list_user_repos(token: str, limit: int = 100) -> list[dict]:
    """Repos the OAuth user can push to, most recently pushed first."""
    resp = httpx.get(f"{GH_API}/user/repos",
                     params={"per_page": min(limit, 100), "sort": "pushed", "affiliation": "owner,collaborator"},
                     headers=_gh_headers(token), timeout=20)
    resp.raise_for_status()
    return [{"full_name": r["full_name"], "private": r.get("private", False),
             "pushed_at": r.get("pushed_at", "")} for r in resp.json()
            if r.get("permissions", {}).get("push", False)]


def disconnect_repo(tenant_id: str, db: Session):
    db.execute(text("DELETE FROM github_connections WHERE tenant_id = :t"), {"t": tenant_id})
    db.commit()


# ── Repo map (≤4K tokens, cached 24h) ────────────────────────────────────────

def build_repo_map(conn: dict) -> str:
    repo, token, branch = conn["repo_full_name"], conn["token"], conn["default_branch"]
    h = _gh_headers(token)
    parts = [f"Repository: {repo} (branch: {branch})"]

    with httpx.Client(timeout=20) as client:
        tree_resp = client.get(f"{GH_API}/repos/{repo}/git/trees/{branch}?recursive=1", headers=h)
        tree = tree_resp.json().get("tree", []) if tree_resp.is_success else []
        paths = []
        for item in tree:
            p = item.get("path", "")
            if item.get("type") != "blob" or p.count("/") > 2:
                continue
            if any(p.startswith(d) or f"/{d}" in p for d in EXCLUDE_DIRS):
                continue
            if p.endswith(EXCLUDE_EXT):
                continue
            paths.append(p)
        parts.append("FILE TREE (depth<=3):\n" + "\n".join(paths[:350]))

        def fetch_file(path: str, max_chars: int) -> str:
            r = client.get(f"{GH_API}/repos/{repo}/contents/{path}?ref={branch}", headers=h)
            if not r.is_success:
                return ""
            data = r.json()
            try:
                return base64.b64decode(data.get("content", "")).decode("utf-8", errors="replace")[:max_chars]
            except Exception:
                return ""

        readme = fetch_file("README.md", 2200)
        if readme:
            parts.append(f"README:\n{readme}")
        for manifest in ("package.json", "requirements.txt", "pyproject.toml"):
            if manifest in paths:
                content = fetch_file(manifest, 1400)
                if content:
                    parts.append(f"{manifest}:\n{content}")
                break

        hubs = [p for p in paths if HUB_PATTERN.search(p)][:8]
        for hp in hubs:
            content = fetch_file(hp, 1200)
            if content:
                head = "\n".join(content.split("\n")[:40])
                parts.append(f"--- {hp} (head) ---\n{head}")

    return "\n\n".join(parts)[:MAP_CHAR_BUDGET]


def get_repo_map_for_tenant(tenant_id: str, db: Session) -> str:
    """Cached repo map for generation grounding. Empty string when no repo."""
    conn = get_connection(tenant_id, db)
    if not conn:
        return ""
    try:
        from app.cache import get_cached, set_cached
        cached = get_cached(f"repomap:{tenant_id}")
        if cached:
            return cached
    except Exception:
        get_cached = set_cached = None
    try:
        repo_map = build_repo_map(conn)
    except Exception as e:
        logger.warning(f"[github_sync] repo map build failed for {conn['repo_full_name']}: {e}")
        return ""
    try:
        if set_cached:
            set_cached(f"repomap:{tenant_id}", repo_map, ttl=86_400)
    except Exception:
        pass
    return repo_map


# ── Ship to GitHub: PR + issue ────────────────────────────────────────────────

def ship_spec(conn: dict, title: str, content: str, seed_id: str) -> dict:
    repo, token, base = conn["repo_full_name"], conn["token"], conn["default_branch"]
    h = _gh_headers(token)
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60] or seed_id[:8]
    branch = f"spec/{slug}"

    with httpx.Client(timeout=25) as client:
        ref = client.get(f"{GH_API}/repos/{repo}/git/ref/heads/{base}", headers=h)
        ref.raise_for_status()
        base_sha = ref.json()["object"]["sha"]

        cr = client.post(f"{GH_API}/repos/{repo}/git/refs", headers=h,
                         json={"ref": f"refs/heads/{branch}", "sha": base_sha})
        if cr.status_code not in (201, 422):  # 422: branch exists — reuse it
            cr.raise_for_status()

        path = f"docs/specs/{slug}.md"
        existing = client.get(f"{GH_API}/repos/{repo}/contents/{path}?ref={branch}", headers=h)
        put_body = {
            "message": f"spec: {title} (via Greenplot)",
            "content": base64.b64encode(f"# {title}\n\n{content}\n".encode()).decode(),
            "branch": branch,
        }
        if existing.is_success:
            put_body["sha"] = existing.json().get("sha")
        pr_file = client.put(f"{GH_API}/repos/{repo}/contents/{path}", headers=h, json=put_body)
        pr_file.raise_for_status()

        pr = client.post(f"{GH_API}/repos/{repo}/pulls", headers=h, json={
            "title": f"Spec: {title}",
            "head": branch, "base": base,
            "body": f"PRD from Greenplot Studio (seed `{seed_id}`).\n\nMerging this PR marks the spec **Built** on the board automatically.",
        })
        if pr.status_code == 422:  # PR already open for this branch — find it
            existing_prs = client.get(f"{GH_API}/repos/{repo}/pulls?head={repo.split('/')[0]}:{branch}", headers=h).json()
            pr_url = existing_prs[0]["html_url"] if existing_prs else ""
            pr_number = existing_prs[0]["number"] if existing_prs else None
        else:
            pr.raise_for_status()
            pr_url = pr.json()["html_url"]
            pr_number = pr.json()["number"]

        issue = client.post(f"{GH_API}/repos/{repo}/issues", headers=h, json={
            "title": f"Implement: {title}",
            "body": f"Spec: {pr_url}\n\nPull the full PRD over MCP with `get_spec(\"{seed_id}\")` — it includes the architecture and design tokens.",
            "labels": ["greenplot-spec"],
        })
        issue_url = issue.json().get("html_url", "") if issue.is_success else ""

    return {"pr_url": pr_url, "pr_number": pr_number, "issue_url": issue_url, "branch": branch, "path": path}


# ── Webhook: PR merged → Built ───────────────────────────────────────────────

def verify_webhook(secret: str, payload: bytes, signature: str) -> bool:
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.removeprefix("sha256="), expected)


def handle_merged_pr(repo_full_name: str, pr_url: str, db: Session) -> str | None:
    """Find the spec seed shipped as this PR and mark it Built. Returns seed id."""
    from app.models import Seed
    row = db.execute(text(
        "SELECT tenant_id FROM github_connections WHERE repo_full_name = :r"), {"r": repo_full_name}
    ).fetchone()
    if not row:
        return None
    seeds = db.query(Seed).filter(Seed.tenant_id == row[0]).order_by(Seed.created_at.desc()).limit(500).all()
    for s in seeds:
        m = s.seed_metadata or {}
        if isinstance(m, dict) and m.get("ship_pr_url") == pr_url:
            mm = dict(m)
            mm["build_status"] = "shipped"
            mm["build_pr_url"] = pr_url
            mm["build_updated_at"] = datetime.utcnow().isoformat()
            s.seed_metadata = mm
            db.commit()
            logger.info(f"[github_sync] PR merged → '{s.title}' marked Built")
            return str(s.id)
    return None
