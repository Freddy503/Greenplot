from pathlib import Path


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

    assert 'os.environ.get("HARVEST_API_KEY", "<HARVEST_API_KEY>")' not in wiki
    assert "harvest_key = settings.HARVEST_API_KEY" in wiki
    assert "if harvest_key and x_api_key == harvest_key:" in wiki


def test_waitlist_export_fails_closed_without_secret():
    route = read("src/app/api/waitlist/export/route.ts")

    assert "if (!secret)" in route
    assert "Waitlist export is not configured" in route
    assert "provided !== secret" in route


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
