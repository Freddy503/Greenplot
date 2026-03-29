#!/usr/bin/env python3
"""
parking_lot_trigger.py
Polls the Notion Parking Lot DB for new entries.
When a new entry is found, runs the Weaviate query + Nemotron synthesis
and returns the result as a structured JSON payload for OpenClaw to deliver.

Usage (called by cron/heartbeat):
  python3 parking_lot_trigger.py

Outputs JSON to stdout. OpenClaw reads it and sends to Telegram.
State file: ~/.openclaw/workspace/skills/idea-garden-rag/state.json
"""

import os, sys, json, urllib.request, urllib.error, datetime, subprocess

NOTION_API_KEY  = open(os.path.expanduser("~/.config/notion/api_key")).read().strip()
NOTION_VERSION  = "2022-06-28"
NVIDIA_API_KEY  = os.environ.get("NVIDIA_API_KEY", "")
PARKING_LOT_DB  = "331fbc8d-40a5-8119-bff8-fa81e339ed97"
STATE_FILE      = os.path.join(os.path.dirname(__file__), "state.json")
SYNC_SCRIPT     = os.path.join(os.path.dirname(__file__), "sync_and_fetch_weaviate.py")
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NEMOTRON_MODEL  = "nvidia/llama-3.1-nemotron-ultra-253b-v1"


def load_state():
    if os.path.exists(STATE_FILE):
        return json.load(open(STATE_FILE))
    return {"last_seen_id": None, "last_seen_time": None}


def save_state(state):
    json.dump(state, open(STATE_FILE, "w"), indent=2)


def notion_post(path, data):
    req = urllib.request.Request(
        f"https://api.notion.com/v1{path}",
        data=json.dumps(data).encode(),
        headers={"Authorization": f"Bearer {NOTION_API_KEY}",
                 "Notion-Version": NOTION_VERSION,
                 "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def notion_get(path):
    req = urllib.request.Request(
        f"https://api.notion.com/v1{path}",
        headers={"Authorization": f"Bearer {NOTION_API_KEY}",
                 "Notion-Version": NOTION_VERSION}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def get_latest_parking_lot_entry():
    res = notion_post(f"/databases/{PARKING_LOT_DB}/query", {
        "sorts": [{"timestamp": "created_time", "direction": "descending"}],
        "page_size": 1
    })
    pages = res.get("results", [])
    if not pages:
        return None
    return pages[0]


def extract_page_text(page_id):
    """Extract all text from a Notion page's blocks."""
    res = notion_get(f"/blocks/{page_id}/children?page_size=100")
    lines = []
    for block in res.get("results", []):
        btype = block["type"]
        content = block.get(btype, {})
        rt = content.get("rich_text", [])
        text = "".join(x.get("plain_text", "") for x in rt)
        if text.strip():
            lines.append(text.strip())
        if block.get("has_children"):
            sub = notion_get(f"/blocks/{block['id']}/children?page_size=50")
            for sb in sub.get("results", []):
                stype = sb["type"]
                srt = sb.get(stype, {}).get("rich_text", [])
                stext = "".join(x.get("plain_text", "") for x in srt)
                if stext.strip():
                    lines.append(stext.strip())
    return "\n".join(lines)


def run_weaviate_query(query_text):
    """Run the sync script in query mode, parse JSON output."""
    result = subprocess.run(
        [sys.executable, SYNC_SCRIPT, "--query", query_text, "--top-k", "5"],
        capture_output=True, text=True, timeout=60
    )
    output = result.stdout
    # Extract JSON block
    if "=== JSON OUTPUT ===" in output:
        json_part = output.split("=== JSON OUTPUT ===")[1].strip()
        return json.loads(json_part)
    return {"results": []}


def nemotron_synthesize(entry_text, related_results):
    """Call Nemotron to synthesize connections."""
    if not NVIDIA_API_KEY:
        return "Error: NVIDIA_API_KEY not set"

    # Build related seeds text
    seeds_text = ""
    for r in related_results[:3]:
        seeds_text += (
            f"\n- Title: {r['title']}\n"
            f"  Source: {r['source']} | Created: {r.get('created','?')} | Score: {r['score']}\n"
            f"  Excerpt: {r['excerpt'][:250]}\n"
            f"  URL: {r['url']}\n"
        )

    system_prompt = (
        "You are Woody, Freddy's personal AI assistant. You help him connect ideas across time.\n"
        "Your job: given a new Parking Lot entry and a set of related Idea Garden seeds, "
        "write a SHORT synthesis (max 5 bullet points) that surfaces genuine connections.\n\n"
        "Rules:\n"
        "- Be specific. Quote or paraphrase the actual seed content.\n"
        "- Use the phrase \"This echoes...\" or \"This connects to...\" to link ideas.\n"
        "- End with ONE concrete next action Freddy could take.\n"
        "- Output clean Markdown only. No XML tags. No headers. Just bullets + one action line.\n"
        "- Max 250 words total."
    )

    user_msg = (
        f"New Parking Lot entry:\n---\n{entry_text[:1500]}\n---\n\n"
        f"Related seeds found in the Idea Garden (ranked by relevance):\n{seeds_text}\n\n"
        "Write the synthesis."
    )

    payload = {
        "model": NEMOTRON_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_msg}
        ],
        "temperature": 0.4,
        "max_tokens": 400
    }
    req = urllib.request.Request(
        f"{NVIDIA_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {NVIDIA_API_KEY}",
                 "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read())
    msg = res["choices"][0]["message"]
    return (msg.get("content") or msg.get("reasoning_content") or "").strip()


def format_telegram_message(synthesis, results):
    sources = ""
    for r in results[:3]:
        sources += f"\n- [{r['title']}]({r['url']}) — score: {r['score']}"
    return (
        f"🌱 *Idea Garden — New Connections Found*\n\n"
        f"{synthesis}\n\n"
        f"---\n*Sources:*{sources}"
    )


def main():
    state = load_state()
    entry = get_latest_parking_lot_entry()

    if not entry:
        print(json.dumps({"action": "none", "reason": "No entries in Parking Lot"}))
        return

    entry_id = entry["id"]
    entry_created = entry.get("created_time", "")

    # Check if we've already processed this entry
    if state.get("last_seen_id") == entry_id:
        print(json.dumps({"action": "none", "reason": "No new entries since last check"}))
        return

    # New entry found — process it
    title_prop = entry["properties"].get("Name", {}).get("title", [])
    title = "".join(x["plain_text"] for x in title_prop) or "Untitled"
    entry_text = extract_page_text(entry_id)

    if not entry_text.strip():
        print(json.dumps({"action": "none", "reason": "Entry has no text yet"}))
        return

    # Query Weaviate
    query_data = run_weaviate_query(entry_text[:800])
    results = [r for r in query_data.get("results", []) if r.get("score", 0) >= 0.5]

    if not results:
        msg = (
            "🌱 *Idea Garden*\n\nNew Parking Lot entry captured: "
            f"*{title}*\n\nNo close connections found yet — the Garden is still growing. "
            "Keep adding seeds!"
        )
        save_state({"last_seen_id": entry_id, "last_seen_time": entry_created})
        print(json.dumps({"action": "send", "message": msg}))
        return

    # Synthesize with Nemotron
    synthesis = nemotron_synthesize(entry_text, results)
    message = format_telegram_message(synthesis, results)

    # Save state
    save_state({"last_seen_id": entry_id, "last_seen_time": entry_created})

    # Re-sync Weaviate in background
    subprocess.Popen([sys.executable, SYNC_SCRIPT, "--sync"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print(json.dumps({
        "action": "send",
        "message": message,
        "entry_title": title,
        "entry_id": entry_id,
        "connections_found": len(results)
    }))


if __name__ == "__main__":
    main()
