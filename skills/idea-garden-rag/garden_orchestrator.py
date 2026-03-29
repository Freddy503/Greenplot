#!/usr/bin/env python3
"""
garden_orchestrator.py
Main entry point — run directly by cron (no LLM needed).
1. Detects new Raw entries in Seeds DB
2. For each: enrich + plant via enrich_and_plant.py
3. Sends result directly to Freddy via OpenClaw CLI

Usage:
  python3 garden_orchestrator.py
"""

import os, sys, json, subprocess

SKILL_DIR = os.path.dirname(__file__)
TELEGRAM_TARGET = '78402550'


def run_script(script, args=None):
    cmd = [sys.executable, os.path.join(SKILL_DIR, script)] + (args or [])
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise RuntimeError(f'{script} failed: {result.stderr[-500:]}')
    return result.stdout.strip()


def send_telegram(text):
    """Send message directly via OpenClaw CLI — no LLM needed."""
    subprocess.run(
        ['openclaw', 'message', 'send',
         '--channel', 'telegram',
         '--target', TELEGRAM_TARGET,
         '--message', text],
        capture_output=True, timeout=30
    )


def main():
    # 1. Detect new Raw entries in Seeds DB
    raw = run_script('detect_new_entries.py')
    data = json.loads(raw)
    entries = data.get('entries', [])

    if not entries:
        sys.exit(0)  # nothing to do

    for entry in entries:
        try:
            result_json = run_script('enrich_and_plant.py', ['--entry-json', json.dumps(entry)])
            result = json.loads(result_json)

            image_line = f"\n🖼️ [Concept map →]({result['image_url']})" if result.get('image_url') else ''
            msg = (
                f"🌱 *New seed planted in your Idea Garden*\n\n"
                f"*{result['seed_title']}*\n\n"
                f"{result['summary']}\n\n"
                f"🎯 *Why it matters for you:*\n{result['why_it_matters']}\n\n"
                f"🚀 *Next action this week:*\n{result['next_action']}\n\n"
                f"📊 Enriched with {result['web_sources']} web sources "
                f"+ {result['garden_connections']} garden connections"
                f"{image_line}\n\n"
                f"[Open seed →]({result['seed_url']})\n"
                f"[Seeds entry →]({result.get('seeds_entry_url', result.get('parking_lot_url', ''))})"
            )
            send_telegram(msg)

        except Exception as e:
            send_telegram(f"⚠️ Garden pipeline error on *{entry['title']}*: {str(e)[:300]}")


if __name__ == '__main__':
    main()
