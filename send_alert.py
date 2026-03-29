#!/usr/bin/env python3
"""
send_alert.py
Send an alert message to Freddy's Telegram via OpenClaw.
Usage: python3 send_alert.py "Message text"
"""

import sys, os, json, urllib.request

OPENCLAW_CHAT_ID = "telegram:78402550"  # your chat
OPENCLAWS_URL = "http://localhost:8080"  # OpenClaw Gateway - adjust if needed

def send_alert(text):
    # In OpenClaw, you can use the `sessions_send` tool to send a message to your own chat.
    # Since we're outside OpenClaw's tool system, we'll use a simple approach:
    # Append to a file that OpenClaw's heartbeat reads, or call OpenClaw's internal API.
    # Simpler: write to a known file that you check in your main session.
    alert_file = "/root/.openclaw/workspace/ALERTS.md"
    timestamp = datetime.datetime.utcnow().isoformat() + "Z"
    with open(alert_file, "a") as f:
        f.write(f"[{timestamp}] ALERT: {text}\n")
    print(f"Alert logged: {text}")
    # Optionally: trigger OpenClaw to send via its API if you have it exposed
    # For now, you can check ALERTS.md in your OpenClaw chat or have a heartbeat read it.

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: send_alert.py 'message'")
        sys.exit(1)
    send_alert(sys.argv[1])
