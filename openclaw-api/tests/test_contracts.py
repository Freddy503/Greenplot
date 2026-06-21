from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_seed_rating_proxy_targets_backend_ratings_endpoint():
    route = read("src/app/api/seeds/[id]/rate/route.ts")

    assert "/api/v1/ratings" in route
    assert "/api/v1/seeds/${id}/rate" not in route
    assert "message_id: id" in route


def test_wiki_auto_compile_has_no_hardcoded_harvest_key_fallback():
    wiki = read("openclaw-api/app/wiki.py")

    old_fallback = 'os.environ.get("HARVEST_API_KEY", "greenplot-' + 'harvest-2026")'
    assert old_fallback not in wiki
    assert "harvest_key = settings.HARVEST_API_KEY" in wiki
    assert "if harvest_key and x_api_key == harvest_key:" in wiki


def test_waitlist_export_fails_closed_without_secret():
    route = read("src/app/api/waitlist/export/route.ts")

    assert "if (!secret)" in route
    assert "Waitlist export is not configured" in route
    assert "provided !== secret" in route
    assert "/api/v1/admin/waitlist/export" in route
    assert "Authorization: authHeader" in route
    assert "fs.readFileSync" not in route


def test_universal_add_does_not_return_before_hooks():
    component = read("src/components/layout/universal-add.tsx")
    hooks = [
        "const [open, setOpen] = useState(false)",
        "const [text, setText] = useState('')",
        "const [adding, setAdding] = useState(false)",
        "const textareaRef = useRef<HTMLTextAreaElement>(null)",
    ]
    return_line = "if (pathname === '/') return null"

    return_index = component.index(return_line)
    for hook in hooks:
        assert component.index(hook) < return_index


def test_link_metadata_fetchers_validate_public_urls_and_redirects():
    backend = read("openclaw-api/app/links.py")
    frontend = read("src/app/api/links/fetch/route.ts")

    assert "def _assert_public_http_url" in backend
    assert "follow_redirects=False" in backend
    assert "urljoin(str(resp.url), location)" in backend
    assert "private or reserved network targets are not allowed" in backend

    assert "async function assertPublicHttpUrl" in frontend
    assert "redirect: 'manual'" in frontend
    assert "new URL(location, current)" in frontend
    assert "Private network URLs are not supported" in frontend


def test_admin_health_requires_admin_user():
    main = read("openclaw-api/app/main.py")

    marker = '@app.get("/api/v1/admin/health")'
    start = main.index(marker)
    end = main.index('@app.get("/api/v1/admin/tenants"', start)
    block = main[start:end]

    assert "current_user: User = Depends(get_current_user)" in block
    assert "settings.ADMIN_EMAILS" in block
    assert 'raise HTTPException(status_code=404, detail="Not found")' in block


def test_frontend_backend_proxy_paths_match_declared_backend_routes():
    backend_routes = _extract_backend_routes()
    frontend_paths = _extract_frontend_backend_paths()

    missing = []
    for source, frontend_path in frontend_paths:
        if not any(_route_matches(frontend_path, backend_path) for backend_path in backend_routes):
            missing.append(f"{source}: {frontend_path}")

    assert missing == []


def test_garden_review_exposes_core_operating_buckets():
    backend = read("openclaw-api/app/garden_health.py")
    frontend = read("src/app/garden/page.tsx")
    proxy = read("src/app/api/garden/review/route.ts")

    assert '@router.get("/review")' in backend
    for bucket in [
        "daily_tending",
        "inbox",
        "relationships",
        "pipeline",
        "wiki_candidates",
        "spaces",
        "timeline",
        "admin_nudges",
    ]:
        assert bucket in backend
        assert bucket in frontend

    assert "/api/v1/garden/review" in proxy


def test_workflows_expose_ordered_product_surfaces():
    backend = read("openclaw-api/app/workflows.py")
    frontend = read("src/app/workflows/page.tsx")

    for route in [
        '@router.get("/outcomes")',
        '@router.get("/relationships/suggestions")',
        '@router.get("/research/inbox")',
        '@router.post("/research/inbox/action")',
        '@router.get("/wiki/from-garden")',
        '@router.post("/wiki/from-garden/preview")',
        '@router.post("/wiki/from-garden/approve")',
        '@router.get("/spaces")',
        '@router.get("/insights/timeline")',
    ]:
        assert route in backend

    for label in [
        "Seed To Outcome Pipeline",
        "Relationship Suggestions",
        "Research Inbox",
        "Wiki From Garden",
        "Product/Project Spaces",
        "Insight Timeline",
    ]:
        assert label in frontend

    for proxy in [
        "src/app/api/outcomes/route.ts",
        "src/app/api/relationships/suggestions/route.ts",
        "src/app/api/research/inbox/route.ts",
        "src/app/api/wiki/from-garden/route.ts",
        "src/app/api/spaces/route.ts",
        "src/app/api/insights/timeline/route.ts",
    ]:
        assert "/api/v1/" in read(proxy)


def _extract_backend_routes() -> set[str]:
    routes = set()
    route_re = re.compile(
        r"@(?P<target>app|router)\.(?:get|post|put|patch|delete)\(\s*"
        r"['\"](?P<path>[^'\"]*)['\"]"
    )
    prefix_re = re.compile(
        r"APIRouter\([^)]*prefix\s*=\s*['\"](?P<prefix>[^'\"]*)['\"]",
        re.S,
    )

    for path in (ROOT / "openclaw-api/app").rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        prefix_match = prefix_re.search(source)
        router_prefix = prefix_match.group("prefix") if prefix_match else ""

        for route_match in route_re.finditer(source):
            route_path = route_match.group("path")
            if route_match.group("target") == "router":
                full_path = f"{router_prefix.rstrip('/')}/{route_path.lstrip('/')}"
            else:
                full_path = route_path

            normalized_path = _normalize_route_path(full_path)
            if normalized_path.startswith("/api/v1"):
                routes.add(normalized_path)

    return routes


def _extract_frontend_backend_paths() -> list[tuple[str, str]]:
    paths = []
    allowed_dynamic_proxies = {
        "src/app/api/canvas/[...path]/route.ts": "${BACKEND}/api/v1/canvas/${path.join('/')}${req.nextUrl.search}",
    }

    for path in (ROOT / "src/app/api").rglob("route.ts"):
        source = path.read_text(encoding="utf-8")
        if "fetch(" not in source:
            continue

        relative_path = path.relative_to(ROOT).as_posix()
        for template_match in re.finditer(r"`([^`]+)`", source):
            template = template_match.group(1)
            if "/api/v1/" not in template:
                continue
            if "${BACKEND}" not in template and "${API_URL}" not in template:
                continue
            if allowed_dynamic_proxies.get(relative_path) == template:
                continue

            api_path = template[template.index("/api/v1/") :]
            paths.append((relative_path, _normalize_route_path(api_path)))

    return paths


def _normalize_route_path(path: str) -> str:
    path = re.sub(r"\$\{encodeURIComponent\(([^)]+)\)\}", r"${\1}", path)
    path = path.split("?", 1)[0]

    for marker in (
        "${params",
        "${qs",
        "${req.nextUrl.search}",
        "${searchParams",
        "${url.search}",
    ):
        if marker in path:
            path = path.split(marker, 1)[0]

    path = (path.rstrip("/") or "/").strip()
    path = re.sub(r"\$\{[^}]+\}", "{}", path)
    path = re.sub(r"\{[^}]+\}", "{}", path)
    return path


def _route_matches(frontend_path: str, backend_path: str) -> bool:
    frontend_parts = _route_parts(frontend_path)
    backend_parts = _route_parts(backend_path)
    if len(frontend_parts) != len(backend_parts):
        return False

    return all(
        frontend_part == backend_part
        or frontend_part == "{}"
        or backend_part == "{}"
        for frontend_part, backend_part in zip(frontend_parts, backend_parts)
    )


def _route_parts(path: str) -> list[str]:
    return [part for part in path.strip("/").split("/") if part]
