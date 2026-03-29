#!/usr/bin/env python3
"""
weaviate_watchdog.py
Check Weaviate health and alert if degraded.
Add to cron: */5 * * * * /usr/bin/python3 /root/.openclaw/workspace/weaviate_watchdog.py >> /var/log/weaviate_watchdog.log 2>&1
"""

import os, sys, json, urllib.request, urllib.error, subprocess
from datetime import datetime

WEAVIATE_URL = os.getenv("WEAVIATE_URL", "http://localhost:8080")
ALERT_CMD = "/root/.openclaw/workspace/send_alert.py"  # you create this if needed

def log(msg):
    print(f"[{datetime.now().isoformat()}] {msg}")

def check_weaviate():
    try:
        # 1. Meta endpoint
        req = urllib.request.Request(f"{WEAVIATE_URL}/v1/meta")
        with urllib.request.urlopen(req, timeout=5) as r:
            meta = json.loads(r.read())
        version = meta.get("version", "unknown")
        
        # 2. Schema check
        req = urllib.request.Request(f"{WEAVIATE_URL}/v1/schema")
        with urllib.request.urlopen(req, timeout=5) as r:
            schema = json.loads(r.read())
        classes = [c["class"] for c in schema.get("classes", [])]
        if "IdeaSeed" not in classes:
            return False
        
        # 3. Quick count
        gql = {"query": "{ Get { IdeaSeed { meta { id } } } }"}
        req = urllib.request.Request(
            f"{WEAVIATE_URL}/v1/graphql",
            data=json.dumps(gql).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            res = json.loads(r.read())
        count = len(res.get("data", {}).get("Get", {}).get("IdeaSeed", []))
        return True
    except Exception as e:
        return False

def check_neo4j_if_running():
    try:
        req = urllib.request.Request("http://localhost:7474")
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status == 200
    except:
        return False  # Not critical yet

def main():
    ok = check_weaviate()
    check_neo4j_if_running()
    
    if not ok:
        print("Weaviate health check failed: service unhealthy", file=sys.stderr)
        sys.exit(1)
    
    # Silent on success - no output
    sys.exit(0)

if __name__ == "__main__":
    main()
