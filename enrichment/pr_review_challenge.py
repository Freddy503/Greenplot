#!/usr/bin/env python3
"""
pr_review_challenge.py — Generate daily PR review challenges for Freddy.

Creates a GitHub PR with AI-generated code containing intentional issues.
Freddy reviews the PR and I evaluate his review.

Difficulty levels: easy → medium → hard (progressive over weeks)
Categories: API design, data processing, security, performance, DevOps
"""

import json
import os
import sys
import subprocess
import datetime
import random
import tempfile

WORKSPACE = "/root/.openclaw/workspace"
REPO_URL = "https://<GITHUB_TOKEN>@github.com/Freddy503/Seedify.git"

DIFFICULTY_TRACKER = os.path.join(WORKSPACE, "enrichment", "pr_difficulty.json")

# ── Challenge Templates ─────────────────────────────────────────────────────

CHALLENGES = {
    "easy": [
        {
            "title": "fix: CSV parser drops last row on empty files",
            "description": """## 🔍 PR Review Challenge — Easy

**Category:** Data Processing
**Time to review:** ~10 minutes

### What this PR does
Fixes a bug where the CSV parser silently drops the last row when processing files that end with a newline.

### Your task
Review this code for:
1. Correctness — does the fix actually work?
2. Edge cases — what's still broken?
3. Code quality — would you approve this?

### Hints
- Look at how the parser handles trailing newlines
- Check the test cases — are they sufficient?
- Is the error handling appropriate?

**Reply with your review:** What would you approve, what would you request changes on, and why?""",
            "files": {
                "challenges/csv_parser.py": '''"""
CSV Parser — handles streaming CSV data.
Previously dropped the last row on files ending with \\n.
"""

def parse_csv_line(line: str) -> list[str]:
    """Parse a single CSV line into fields."""
    fields = []
    current = ""
    in_quotes = False
    
    for char in line:
        if char == '"':
            in_quotes = not in_quotes
        elif char == ',' and not in_quotes:
            fields.append(current.strip())
            current = ""
        else:
            current += char
    
    fields.append(current.strip())  # FIX: was missing before
    return fields


def parse_csv_file(filepath: str) -> list[list[str]]:
    """Parse entire CSV file, return list of rows."""
    rows = []
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if line:  # FIX: skip empty lines
                rows.append(parse_csv_line(line))
    return rows


def parse_csv_content(content: str) -> list[list[str]]:
    """Parse CSV from a string."""
    rows = []
    for line in content.split("\\n"):
        line = line.strip()
        if line == "":
            continue
        rows.append(parse_csv_line(line))
    return rows


# Test cases
if __name__ == "__main__":
    # Normal case
    assert parse_csv_line("a,b,c") == ["a", "b", "c"]
    
    # Quoted fields
    assert parse_csv_line('"hello, world",b,c') == ["hello, world", "b", "c"]
    
    # Empty fields
    assert parse_csv_line("a,,c") == ["a", "", "c"]
    
    # File ending with newline
    content = "a,b\\nc,d\\n"
    result = parse_csv_content(content)
    assert len(result) == 2, f"Expected 2 rows, got {len(result)}"
    
    # Empty file
    assert parse_csv_content("") == []
    
    print("All tests passed!")
''',
                "challenges/test_csv_parser.py": '''"""Tests for CSV parser fix."""

import sys
sys.path.insert(0, ".")
from csv_parser import parse_csv_line, parse_csv_content


def test_normal_line():
    assert parse_csv_line("a,b,c") == ["a", "b", "c"]


def test_quoted_commas():
    assert parse_csv_line('"hello, world",b') == ["hello, world", "b"]


def test_trailing_newline():
    content = "a,b\\nc,d\\ne,f\\n"
    result = parse_csv_content(content)
    assert len(result) == 3


def test_empty_file():
    assert parse_csv_content("") == []


def test_single_row_no_newline():
    content = "x,y,z"
    result = parse_csv_content(content)
    assert len(result) == 1


def test_multiple_trailing_newlines():
    content = "a,b\\nc,d\\n\\n\\n"
    result = parse_csv_content(content)
    assert len(result) == 2
'''
            },
            "rubric": [
                "Notices that parse_csv_content still doesn't handle \\n\\n correctly (multiple blank lines at end)",
                "Catches that there's no handling for Windows line endings (\\r\\n)",
                "Questions why parse_csv_file and parse_csv_content are separate functions (DRY violation)",
                "Notes missing type hints on return values in some places",
                "Observes that the quoted field test doesn't cover escaped quotes (\"\")",
                "Asks about encoding handling (what about UTF-8 BOM?)"
            ]
        },
        {
            "title": "feat: add health check endpoint",
            "description": """## 🔍 PR Review Challenge — Easy

**Category:** API Design
**Time to review:** ~10 minutes

### What this PR does
Adds a `/health` endpoint that checks database and cache connectivity.

### Your task
Review for:
1. Is the health check actually useful in production?
2. Security concerns
3. Missing checks

### Hint
Think about what happens when this endpoint is hit 1000 times per second by a monitoring tool.""",
            "files": {
                "challenges/health_endpoint.py": '''"""
Health check endpoint for monitoring.
Returns 200 if all dependencies are reachable.
"""

from fastapi import FastAPI
import psycopg2
import redis
import time

app = FastAPI()

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "myapp",
    "user": "admin",
    "password": "super_secret_password_123",  # TODO: move to env var
}

REDIS_CONFIG = {
    "host": "localhost",
    "port": 6379,
}


@app.get("/health")
def health_check():
    """Check all dependencies."""
    results = {}
    
    # Check database
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()
        results["database"] = "ok"
    except Exception as e:
        results["database"] = f"error: {str(e)}"
    
    # Check Redis
    try:
        r = redis.Redis(**REDIS_CONFIG)
        r.ping()
        results["cache"] = "ok"
    except Exception as e:
        results["cache"] = f"error: {str(e)}"
    
    # Check disk space
    import shutil
    total, used, free = shutil.disk_usage("/")
    results["disk"] = {
        "total_gb": round(total / (1024**3), 2),
        "free_gb": round(free / (1024**3), 2),
    }
    
    results["timestamp"] = time.time()
    results["version"] = "1.2.3"
    
    return results


@app.get("/health/ready")
def readiness_check():
    """Kubernetes readiness probe."""
    return health_check()
'''
            },
            "rubric": [
                "Catches hardcoded password in DB_CONFIG — security issue",
                "Notes that /health exposes internal error messages (info leak)",
                "Points out no caching of health results (DB connection every request)",
                "Asks about timeout handling — what if DB is slow?",
                "Questions why /health and /health/ready do the same thing",
                "Suggests separating liveness vs readiness probes",
                "Notes disk check adds latency for no good reason on every health check"
            ]
        },
    ],
    "medium": [
        {
            "title": "feat: batch import users from CSV",
            "description": """## 🔍 PR Review Challenge — Medium

**Category:** Data Processing + Performance
**Time to review:** ~20 minutes

### What this PR does
Bulk imports users from a CSV file into the database. Handles 10K-100K rows.

### Your task
Find the performance issues, data integrity problems, and missing error handling.

### Hint
Imagine importing 500K rows. What breaks first?""",
            "files": {
                "challenges/batch_import.py": '''"""
Batch user import from CSV.
Handles large files (10K-100K rows).
"""

import csv
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import User, UserImport


def import_users_from_csv(db: Session, filepath: str, imported_by: str) -> dict:
    """Import users from CSV file. Returns summary."""
    
    results = {
        "total": 0,
        "success": 0,
        "failed": 0,
        "errors": [],
    }
    
    with open(filepath, "r") as f:
        reader = csv.DictReader(f)
        
        for row_num, row in enumerate(reader, start=2):
            results["total"] += 1
            
            try:
                # Validate required fields
                if not row.get("email"):
                    raise ValueError("Email is required")
                if not row.get("name"):
                    raise ValueError("Name is required")
                
                # Check for duplicate email
                existing = db.query(User).filter(
                    User.email == row["email"]
                ).first()
                
                if existing:
                    results["errors"].append(f"Row {row_num}: email already exists")
                    results["failed"] += 1
                    continue
                
                # Create user
                user = User(
                    id=uuid.uuid4(),
                    email=row["email"],
                    name=row["name"],
                    department=row.get("department", ""),
                    role=row.get("role", "user"),
                    created_at=datetime.utcnow(),
                )
                db.add(user)
                db.commit()
                
                # Log the import
                import_log = UserImport(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    imported_by=imported_by,
                    imported_at=datetime.utcnow(),
                    source_file=filepath,
                )
                db.add(import_log)
                db.commit()
                
                results["success"] += 1
                
            except Exception as e:
                db.rollback()
                results["errors"].append(f"Row {row_num}: {str(e)}")
                results["failed"] += 1
    
    return results
'''
            },
            "rubric": [
                "Commits after EVERY row — should batch commits (performance killer)",
                "No transaction boundary — partial imports leave inconsistent state",
                "Duplicate check is N+1 queries — should batch check or use INSERT ON CONFLICT",
                "No email format validation",
                "Import log should be in the same transaction as user creation",
                "No progress reporting for long imports",
                "CSV file not validated for expected columns before starting",
                "Memory issue: what if the file is 2GB? Should stream, not load all",
                "No rate limiting or locking — two concurrent imports could create duplicates"
            ]
        },
    ],
    "hard": [
        {
            "title": "feat: multi-tenant event stream with exactly-once delivery",
            "description": """## 🔍 PR Review Challenge — Hard

**Category:** System Design + Concurrency
**Time to review:** ~30 minutes

### What this PR does
Implements a tenant-isolated event stream with Redis Streams. Claims exactly-once delivery.

### Your task
Does it actually deliver exactly-once? Find the concurrency bugs and design flaws.

### Hint
"Exactly-once" is almost always a lie. Find where.""",
            "files": {
                "challenges/event_stream.py": '''"""
Multi-tenant event stream with exactly-once delivery guarantee.
Uses Redis Streams for persistence and consumer groups for distribution.
"""

import json
import uuid
import redis
from datetime import datetime
from typing import Optional


class TenantEventStream:
    """Tenant-isolated event stream with exactly-once delivery."""
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url)
        self.CONSUMER_GROUP = "processors"
    
    def _stream_key(self, tenant_id: str) -> str:
        return f"events:{tenant_id}"
    
    def publish(self, tenant_id: str, event_type: str, data: dict) -> str:
        """Publish an event to tenant's stream."""
        event = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "type": event_type,
            "data": json.dumps(data),
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        stream_key = self._stream_key(tenant_id)
        
        # Idempotency: check if event already exists
        existing = self.redis.get(f"idempotent:{event['id']}")
        if existing:
            return existing.decode()
        
        # Publish to stream
        msg_id = self.redis.xadd(stream_key, event)
        
        # Store idempotency key (expires in 24h)
        self.redis.setex(f"idempotent:{event['id']}", 86400, msg_id)
        
        return msg_id
    
    def consume(
        self,
        tenant_id: str,
        consumer_name: str,
        count: int = 10,
        block_ms: int = 5000,
    ) -> list[dict]:
        """Consume events from tenant's stream."""
        stream_key = self._stream_key(tenant_id)
        
        # Ensure consumer group exists
        try:
            self.redis.xgroup_create(
                stream_key, self.CONSUMER_GROUP, id="0", mkstream=True
            )
        except redis.ResponseError:
            pass  # Group already exists
        
        # Read new messages
        messages = self.redis.xreadgroup(
            groupname=self.CONSUMER_GROUP,
            consumername=consumer_name,
            streams={stream_key: ">"},
            count=count,
            block=block_ms,
        )
        
        events = []
        for stream, msgs in messages:
            for msg_id, data in msgs:
                events.append({
                    "msg_id": msg_id,
                    "id": data[b"id"].decode(),
                    "tenant_id": data[b"tenant_id"].decode(),
                    "type": data[b"type"].decode(),
                    "data": json.loads(data[b"data"]),
                    "timestamp": data[b"timestamp"].decode(),
                })
        
        return events
    
    def ack(self, tenant_id: str, msg_id: str):
        """Acknowledge event processing."""
        stream_key = self._stream_key(tenant_id)
        self.redis.xack(stream_key, self.CONSUMER_GROUP, msg_id)
    
    def process_with_ack(
        self,
        tenant_id: str,
        consumer_name: str,
        handler: callable,
    ):
        """Consume and auto-ack on success."""
        events = self.consume(tenant_id, consumer_name)
        
        for event in events:
            try:
                handler(event)
                self.ack(tenant_id, event["msg_id"])
            except Exception as e:
                # Don't ack — will be redelivered
                print(f"Handler failed: {e}")
                raise
    
    def get_pending(self, tenant_id: str, count: int = 100) -> list[dict]:
        """Get pending (unacked) events for retry."""
        stream_key = self._stream_key(tenant_id)
        
        pending = self.redis.xpending_range(
            stream_key,
            self.CONSUMER_GROUP,
            min="-",
            max="+",
            count=count,
        )
        
        return [
            {
                "msg_id": p["message_id"],
                "consumer": p["consumer"],
                "time_since_delivery": p["time_since_delivery"],
            }
            for p in pending
        ]
    
    def retry_stale(self, tenant_id: str, min_age_ms: int = 30000):
        """Retry events that have been pending too long."""
        pending = self.get_pending(tenant_id)
        
        for p in pending:
            if p["time_since_delivery"] > min_age_ms:
                # Claim the message and redeliver
                stream_key = self._stream_key(tenant_id)
                claimed = self.redis.xclaim(
                    stream_key,
                    self.CONSUMER_GROUP,
                    "retry-consumer",
                    min_idle_time=min_age_ms,
                    message_ids=[p["msg_id"]],
                )
                return claimed
'''
            },
            "rubric": [
                "Idempotency check uses GET + SET (race condition) — should use SET NX",
                "Exactly-once claim is false: ack can fail after handler succeeds (at-least-once)",
                "No tenant isolation in consume — any consumer can read any tenant",
                "retry_stale only returns first claimed message (return inside for loop)",
                "No dead letter queue for permanently failed events",
                "xpending_range API usage might be wrong for redis-py version",
                "No metrics/observability — how do you know delivery is working?",
                "Consumer group creation is racy under concurrent startup",
                "No backpressure — what if handler is slow and events pile up?",
                "process_with_ack raises on failure but doesn't log which event failed"
            ]
        },
    ],
}


def get_difficulty():
    """Get current difficulty level."""
    if os.path.exists(DIFFICULTY_TRACKER):
        with open(DIFFICULTY_TRACKER) as f:
            data = json.load(f)
            return data.get("level", "easy"), data.get("challenges_completed", 0)
    return "easy", 0


def advance_difficulty():
    """Advance difficulty after enough completions."""
    level, completed = get_difficulty()
    completed += 1
    
    if level == "easy" and completed >= 4:
        level = "medium"
        completed = 0
    elif level == "medium" and completed >= 4:
        level = "hard"
        completed = 0
    
    with open(DIFFICULTY_TRACKER, "w") as f:
        json.dump({"level": level, "challenges_completed": completed}, f)
    
    return level


def pick_challenge():
    """Pick a challenge based on current difficulty."""
    level, _ = get_difficulty()
    challenges = CHALLENGES.get(level, CHALLENGES["easy"])
    return level, random.choice(challenges)


def create_pr():
    """Create a PR with the challenge code."""
    level, challenge = pick_challenge()
    today = datetime.date.today().isoformat()
    branch_name = f"review-challenge/{today}-{level}"
    
    # Create branch
    subprocess.run(["git", "checkout", "-b", branch_name], cwd=WORKSPACE, capture_output=True)
    
    # Write challenge files
    for filepath, content in challenge["files"].items():
        full_path = os.path.join(WORKSPACE, filepath)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w") as f:
            f.write(content)
    
    # Commit and push
    for filepath in challenge["files"]:
        subprocess.run(["git", "add", filepath], cwd=WORKSPACE, capture_output=True)
    
    commit_msg = f"{challenge['title']} [review-challenge:{level}]"
    subprocess.run(
        ["git", "-c", "user.name=Freddy503", "-c", "user.email=Freddy503@users.noreply.github.com",
         "commit", "-m", commit_msg],
        cwd=WORKSPACE, capture_output=True
    )
    
    # Push branch
    result = subprocess.run(
        ["git", "push", "origin", branch_name],
        cwd=WORKSPACE, capture_output=True, text=True
    )
    
    if result.returncode != 0:
        print(f"Push failed: {result.stderr}")
        # Try force push or recreate
        subprocess.run(["git", "push", "-f", "origin", branch_name], cwd=WORKSPACE, capture_output=True)
    
    # Create PR via GitHub API
    pr_body = challenge["description"]
    pr_body += f"\n\n**Difficulty:** {level.upper()}"
    pr_body += f"\n**Challenge #:** {_ + 1 if (_ := get_difficulty()[1]) else 1}"
    pr_body += f"\n\n---\n*Rubric (hidden from Freddy):*\n" + "\n".join(f"- {r}" for r in challenge["rubric"])
    
    # Use gh CLI if available, otherwise curl
    gh_result = subprocess.run(
        ["gh", "pr", "create",
         "--repo", "Freddy503/Seedify",
         "--title", challenge["title"],
         "--body", pr_body,
         "--head", branch_name,
         "--base", "main"],
        cwd=WORKSPACE, capture_output=True, text=True
    )
    
    if gh_result.returncode == 0:
        pr_url = gh_result.stdout.strip()
        advance_difficulty()
        return {"status": "ok", "pr_url": pr_url, "level": level, "title": challenge["title"]}
    else:
        return {"status": "error", "error": gh_result.stderr}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--create", action="store_true", help="Create a new PR challenge")
    parser.add_argument("--difficulty", action="store_true", help="Show current difficulty")
    args = parser.parse_args()
    
    if args.create:
        result = create_pr()
        print(json.dumps(result, indent=2))
    elif args.difficulty:
        level, completed = get_difficulty()
        print(f"Level: {level}, Completed: {completed}")
    else:
        level, challenge = pick_challenge()
        print(f"Current difficulty: {level}")
        print(f"Challenge: {challenge['title']}")
