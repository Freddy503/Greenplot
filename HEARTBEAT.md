# HEARTBEAT.md

## Garden Pipeline Check
Check if any new entries have entered the Seed (Parking Lot):
```python
import sys, json, subprocess
# Check for new entries
res = subprocess.run([sys.executable, '/root/.openclaw/workspace/skills/idea-garden-rag/detect_new_entries.py'], capture_output=True, text=True)
data = json.loads(res.stdout)
entries = data.get('entries', [])

if entries:
    print(f"Found {len(entries)} new Seed(s). Running Flow Seed -> Enrich -> Plant...")
    subprocess.run([sys.executable, '/root/.openclaw/workspace/skills/idea-garden-rag/garden_orchestrator.py'])
    print("Pipeline finished.")
else:
    pass # No new seeds, do nothing.
```
If there were new seeds, report what happened.
Otherwise, HEARTBEAT_OK.
