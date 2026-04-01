#!/usr/bin/env python3
"""
Daily Seed Extraction — pulls insights from memory files + seeds-today.jsonl,
deduplicates against Weaviate, and creates new seeds via the API.

Run via cron once daily. Falls back to local staging if backend is unreachable.
"""

import json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone

WORKSPACE = os.path.expanduser("~/.openclaw/workspace")
MEMORY_DIR = os.path.join(WORKSPACE, "memory")
SEEDS_TODAY = os.path.join(MEMORY_DIR, "seeds-today.jsonl")
STAGING_FILE = os.path.join(MEMORY_DIR, "seeds-pending.jsonl")
BACKEND = os.environ.get("BACKEND_URL", "https://api.greenplot.ink")

# ── Helpers ────────────────────────────────────────────

def load_jsonl(path: str) -> list[dict]:
    """Load a JSONL file, skip empty lines."""
    if not os.path.exists(path):
        return []
    entries = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return entries


def save_jsonl(path: str, entries: list[dict]):
    """Write entries to JSONL."""
    with open(path, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def append_jsonl(path: str, entry: dict):
    """Append a single entry to JSONL."""
    with open(path, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def get_today_file() -> str:
    """Get path to today's memory file."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return os.path.join(MEMORY_DIR, f"{today}.md")


def extract_seeds_from_memory(filepath: str) -> list[dict]:
    """Extract seed-worthy insights from a daily memory markdown file.

    Looks for:
    - Lines starting with 🌱 Seed:
    - Sections marked as insights, reflections, lessons
    - Key decisions or strategic observations
    """
    if not os.path.exists(filepath):
        return []

    with open(filepath) as f:
        content = f.read()

    seeds = []

    # 1. Explicit seeds (🌱 Seed: lines)
    for match in re.finditer(r"🌱\s*Seed:\s*(.+?)(?:\n|$)", content):
        title_line = match.group(1).strip()
        seeds.append({
            "title": title_line[:80],
            "text": title_line,
            "source": "auto_extract",
            "created": datetime.now(timezone.utc).isoformat(),
        })

    # 2. Key insights from voice memos / reflections
    insight_patterns = [
        r"(?:insight|observation|realized|important|key takeaway)[:\s]+(.+?)(?:\n|$)",
        r"(?:the real|the actual|what matters|the point)[:\s]+(.+?)(?:\n|$)",
    ]
    for pattern in insight_patterns:
        for match in re.finditer(pattern, content, re.IGNORECASE):
            text = match.group(1).strip()
            if len(text) > 30:  # Skip trivial matches
                seeds.append({
                    "title": text[:80],
                    "text": text,
                    "source": "auto_extract",
                    "created": datetime.now(timezone.utc).isoformat(),
                })

    return seeds


def is_duplicate(title: str, existing_titles: set[str]) -> bool:
    """Check if a title is too similar to an existing seed."""
    title_lower = title.lower().strip()
    for existing in existing_titles:
        if title_lower == existing.lower().strip():
            return True
        # Simple word overlap check (>70% shared words = duplicate)
        words_new = set(title_lower.split())
        words_existing = set(existing.lower().strip().split())
        if words_new and words_existing:
            overlap = len(words_new & words_existing) / max(len(words_new), len(words_existing))
            if overlap > 0.7:
                return True
    return False


def get_existing_titles_from_weaviate() -> set[str]:
    """Fetch existing seed titles from Weaviate for dedup."""
    try:
        query = {
            "query": "{ Get { IdeaSeed(limit:200) { title } } }"
        }
        req = urllib.request.Request(
            "http://localhost:8080/v1/graphql",
            data=json.dumps(query).encode(),
            headers={"Content-Type": "application/json"},
        )
        resp = urllib.request.urlopen(req, timeout=5)
        data = json.loads(resp.read())
        seeds = data.get("data", {}).get("Get", {}).get("IdeaSeed", [])
        return {s["title"] for s in seeds if s.get("title")}
    except Exception:
        return set()


def create_seed_via_api(seed: dict, token: str = "") -> bool:
    """Create a seed via the backend API."""
    try:
        req = urllib.request.Request(
            f"{BACKEND}/api/v1/seeds",
            data=json.dumps(seed).encode(),
            headers={
                "Content-Type": "application/json",
                **({"Authorization": f"Bearer {token}"} if token else {}),
            },
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=8)
        return resp.status == 200
    except Exception:
        return False


# ── Main ───────────────────────────────────────────────

def main():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Daily seed extraction starting...")

    # 1. Load real-time captures
    realtime_seeds = load_jsonl(SEEDS_TODAY)
    print(f"  Real-time seeds staged: {len(realtime_seeds)}")

    # 2. Extract from today's memory file
    today_file = get_today_file()
    memory_seeds = extract_seeds_from_memory(today_file)
    print(f"  Seeds from memory file: {len(memory_seeds)}")

    # 3. Combine and dedup against each other
    all_seeds = realtime_seeds + memory_seeds
    seen_titles: set[str] = set()
    unique_seeds = []
    for seed in all_seeds:
        title = seed.get("title", "")
        if title and not is_duplicate(title, seen_titles):
            seen_titles.add(title)
            unique_seeds.append(seed)
    print(f"  After local dedup: {len(unique_seeds)}")

    if not unique_seeds:
        print("  Nothing to process.")
        # Clear the realtime staging file for tomorrow
        save_jsonl(SEEDS_TODAY, [])
        return

    # 4. Check Weaviate for existing seeds
    existing_titles = get_existing_titles_from_weaviate()
    print(f"  Existing seeds in Weaviate: {len(existing_titles)}")

    new_seeds = [s for s in unique_seeds if not is_duplicate(s.get("title", ""), existing_titles)]
    print(f"  New seeds after Weaviate dedup: {len(new_seeds)}")

    if not new_seeds:
        print("  All seeds already exist.")
        save_jsonl(SEEDS_TODAY, [])
        return

    # 5. Try to create via API, fall back to staging
    token = os.environ.get("SEEDIFY_TOKEN", "")
    created = 0
    failed = []

    for seed in new_seeds:
        if create_seed_via_api(seed, token):
            created += 1
        else:
            failed.append(seed)

    print(f"  Created via API: {created}")

    # 6. Stage failures for later (when tunnel is back)
    if failed:
        # Load existing staging, append, save
        existing_staging = load_jsonl(STAGING_FILE)
        # Dedup against existing staging
        staging_titles = {s.get("title", "") for s in existing_staging}
        for seed in failed:
            if seed.get("title", "") not in staging_titles:
                existing_staging.append(seed)
                staging_titles.add(seed.get("title", ""))
        save_jsonl(STAGING_FILE, existing_staging)
        print(f"  Staged for later: {len(failed)} (saved to seeds-pending.jsonl)")

    # 7. Clear the realtime staging file
    save_jsonl(SEEDS_TODAY, [])

    print(f"  Done. {created} seeds created, {len(failed)} pending.")


if __name__ == "__main__":
    main()
