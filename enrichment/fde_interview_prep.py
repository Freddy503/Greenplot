#!/usr/bin/env python3
"""
fde_interview_prep.py — Generate FDE interview questions for Freddy.

Categories based on real Palantir/SAP FDE interview reports:
1. Decomposition — system design, problem breakdown
2. Coding — algorithms, clean code, edge cases
3. Debugging — trace and fix broken systems
4. SQL/Data — queries, pipelines, transformations
5. Learning — explain a concept, apply it immediately
6. Behavioral — STAR format stories

Each run picks 2 questions from different categories.
"""

import json
import os
import sys
import random
import datetime

QUESTIONS_FILE = os.path.join(os.path.dirname(__file__), "fde_questions.json")
HISTORY_FILE = os.path.join(os.path.dirname(__file__), "fde_history.json")


# ── Question Bank ────────────────────────────────────────────────────────────
QUESTION_BANK = {
    "decomposition": [
        {
            "q": "A retail company has 500 stores, each generating daily sales CSVs. They need a dashboard showing real-time inventory across all stores. Design the system — what components would you build, what data flows between them, and where are the failure points?",
            "rubric": ["Data ingestion layer (batch vs streaming)", "Storage (what DB, why)", "API layer", "Dashboard/frontend", "Failure modes (late data, schema drift, network)", "Monitoring/alerts"],
            "difficulty": "medium"
        },
        {
            "q": "A hospital wants to predict patient readmission within 30 days. They have EHR data, billing codes, and discharge notes. Walk through how you'd decompose this from problem statement to deployed model. What data do you need? What's the MVP?",
            "rubric": ["Problem framing (classification? what label?)", "Data sources and access", "Feature engineering approach", "MVP scope vs full solution", "Evaluation metrics", "Deployment considerations (regulatory, latency)"],
            "difficulty": "medium"
        },
        {
            "q": "Your client's supply chain system crashes every Monday morning. 200 users hit it simultaneously after the weekend. How do you diagnose and fix this? Break it down.",
            "rubric": ["Observability first (logs, metrics, traces)", "Identify bottleneck (DB? API? queue?)", "Scaling strategies (caching, load balancing, queue)", "Short-term mitigation vs long-term fix", "Communication with stakeholders"],
            "difficulty": "easy"
        },
        {
            "q": "A government agency needs to share sensitive data across 3 departments while maintaining access controls. Each department uses a different database. Design the integration.",
            "rubric": ["Data classification (what's sensitive)", "Access control model (RBAC, ABAC)", "Integration pattern (API gateway, event bus, ETL)", "Audit logging", "Schema mapping strategy", "Incremental sync vs full"],
            "difficulty": "hard"
        },
        {
            "q": "Design a notification system for a project management tool. Users should get alerts for: task assignments, due dates, comments, and status changes. 10K users, 500K events/day.",
            "rubric": ["Event source identification", "Notification preferences (channels, frequency)", "Queue/message bus design", "Deduplication and batching", "Delivery guarantees", "Rate limiting to prevent spam"],
            "difficulty": "medium"
        },
    ],
    "coding": [
        {
            "q": "Write a function `merge_intervals(intervals: list[tuple[int,int]]) -> list[tuple[int,int]]` that merges overlapping time intervals. Example: [(1,3),(2,6),(8,10)] → [(1,6),(8,10)]. Handle edge cases.",
            "rubric": ["Sorting first", "Correct merge logic", "Edge cases: empty, single, fully overlapping", "Time complexity O(n log n)", "Clean interface and naming"],
            "difficulty": "easy",
            "language": "python"
        },
        {
            "q": "Implement a rate limiter class: `RateLimiter(max_requests: int, window_seconds: int)`. It should have a method `allow_request(user_id: str) -> bool`. Thread-safe.",
            "rubric": ["Sliding window vs fixed window", "Data structure choice (dict + deque?)", "Thread safety (lock or atomic ops)", "Cleanup of old entries", "Time complexity per call"],
            "difficulty": "medium",
            "language": "python"
        },
        {
            "q": "Given a list of log entries `[{timestamp, level, message}]`, write a function that finds the longest streak of consecutive ERROR-level logs where each is within 5 minutes of the previous. Return the start timestamp and streak length.",
            "rubric": ["Sorting by timestamp", "Sliding window or iteration", "Correct time comparison", "Edge cases: no errors, all errors", "Clean return value"],
            "difficulty": "medium",
            "language": "python"
        },
        {
            "q": "Write a function `flatten(nested: dict) -> dict` that flattens a nested dictionary with dot-separated keys. Example: {'a': {'b': 1}} → {'a.b': 1}. Handle lists too: {'a': [1, 2]} → {'a.0': 1, 'a.1': 2}.",
            "rubric": ["Recursive approach", "Handles dicts, lists, and primitives", "Correct key concatenation", "No mutation of input", "Type hints"],
            "difficulty": "easy",
            "language": "python"
        },
        {
            "q": "Implement a simple LRU cache with get(key) and put(key, value) operations, both O(1). Max size is passed to constructor.",
            "rubric": ["Doubly linked list + hashmap", "Correct eviction on full capacity", "O(1) for both operations", "Handle get on missing key", "Clean class structure"],
            "difficulty": "medium",
            "language": "python"
        },
    ],
    "debugging": [
        {
            "q": "A Python API endpoint that processes CSV uploads is returning 500 errors intermittently. The logs show: `MemoryError` in `csv.reader()` and sometimes `UnicodeDecodeError`. The files are 50-200MB. What's wrong and how do you fix it?",
            "rubric": ["Loading entire file into memory (use streaming/chunks)", "Binary mode vs text mode for CSV", "Encoding detection/chardet", "File size validation", "Progressive processing"],
            "difficulty": "easy"
        },
        {
            "q": "Your Weaviate instance is returning stale results after updates. New objects appear in `/v1/objects` but don't show up in GraphQL queries for 30+ seconds. What's happening?",
            "rubric": ["Async indexing in Weaviate", "Index refresh interval", "Force refresh option", "Read-your-own-writes pattern", "Accept eventual consistency or force sync"],
            "difficulty": "medium"
        },
        {
            "q": "A Docker container running your FastAPI app keeps getting OOM-killed. It uses ~200MB normally but spikes to 2GB during certain requests. How do you diagnose and fix?",
            "rubric": ["Check memory limits (docker stats, --memory)", "Identify the leaking operation (large query? file upload?)", "Memory profiling (tracemalloc, memory_profiler)", "Streaming responses vs loading all into memory", "Set appropriate limits + health checks"],
            "difficulty": "medium"
        },
    ],
    "sql_data": [
        {
            "q": "Given tables `orders(id, customer_id, amount, created_at)` and `customers(id, name, region)`, write a query that returns the top 3 customers by total spend per region, including ties.",
            "rubric": ["Window function (ROW_NUMBER or DENSE_RANK)", "Correct partitioning by region", "Handling ties (DENSE_RANK vs ROW_NUMBER)", "JOIN correctly", "GROUP BY before window"],
            "difficulty": "medium"
        },
        {
            "q": "You have a table `events(user_id, event_type, timestamp)`. Write a query to find users who had a 'signup' event followed by a 'purchase' event within 7 days. Return user_id and the gap in days.",
            "rubric": ["Self-join or window function (LAG/LEAD)", "Date arithmetic", "Correct filtering (signup before purchase, within 7 days)", "Deduplication if multiple events"],
            "difficulty": "medium"
        },
        {
            "q": "Design a database schema for a multi-tenant SaaS that tracks API usage per tenant. Requirements: tenants have multiple users, each API call is logged with endpoint/model/tokens/cost, need monthly rollups for billing.",
            "rubric": ["Tenant table with isolation strategy", "API calls table with proper indexes", "Rollup/materialized view for billing", "Partitioning strategy for scale", "Foreign keys and constraints"],
            "difficulty": "medium"
        },
    ],
    "learning": [
        {
            "q": "I'm going to teach you a concept: 'Circuit Breaker Pattern' — when a downstream service fails repeatedly, you stop calling it temporarily to prevent cascading failures. After 5 failures, open the circuit for 30 seconds, then try one request to test.\n\nNow: Implement a simple CircuitBreaker class with `call(func)` that wraps any function. States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing).",
            "rubric": ["Correct state transitions", "Failure counting", "Timeout mechanism", "HALF_OPEN allows one call", "Clean interface"],
            "difficulty": "medium",
            "language": "python"
        },
        {
            "q": "I'm going to teach you: 'Exponential Backoff with Jitter' — when retrying failed requests, double the wait time each attempt, but add random jitter to prevent thundering herd.\n\nNow: Write a `retry_with_backoff(func, max_retries=5)` decorator that implements this.",
            "rubric": ["Exponential delay calculation", "Jitter (random component)", "Max retries limit", "Decorator pattern correctly applied", "Logging of retries"],
            "difficulty": "medium",
            "language": "python"
        },
    ],
    "behavioral": [
        {
            "q": "Tell me about a time you had to learn a new technology quickly to solve a real problem. What was the situation, what did you learn, and what was the outcome? (STAR format)",
            "rubric": ["Clear situation setup", "Specific task/challenge", "Concrete actions taken", "Measurable result", "Shows learning agility"],
            "difficulty": "easy"
        },
        {
            "q": "Describe a project where the requirements changed halfway through. How did you adapt? What would you do differently?",
            "rubric": ["Shows adaptability", "Communication with stakeholders", "Technical pivoting", "Lessons learned", "Professional maturity"],
            "difficulty": "easy"
        },
    ]
}


def load_history():
    """Load previously asked questions."""
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE) as f:
            return json.load(f)
    return {"asked": [], "scores": []}


def save_history(history):
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def pick_questions(count=2):
    """Pick questions from different categories, avoiding repeats."""
    history = load_history()
    asked_keys = history.get("asked", [])

    available = []
    for category, questions in QUESTION_BANK.items():
        for i, q in enumerate(questions):
            key = f"{category}:{i}"
            if key not in asked_keys:
                available.append((category, key, q))

    if len(available) < count:
        # Reset if all questions asked
        history["asked"] = []
        save_history(history)
        available = []
        for category, questions in QUESTION_BANK.items():
            for i, q in enumerate(questions):
                key = f"{category}:{i}"
                available.append((category, key, q))

    # Pick from different categories if possible
    selected = []
    categories_used = set()
    random.shuffle(available)

    for cat, key, q in available:
        if cat not in categories_used:
            selected.append((cat, key, q))
            categories_used.add(cat)
        if len(selected) >= count:
            break

    # Fill remaining from any category
    if len(selected) < count:
        for cat, key, q in available:
            if key not in [k for _, k, _ in selected]:
                selected.append((cat, key, q))
            if len(selected) >= count:
                break

    # Mark as asked
    for _, key, _ in selected:
        history["asked"].append(key)
    save_history(history)

    return selected


def format_challenge(questions):
    """Format questions as a friendly challenge message."""
    today = datetime.date.today().isoformat()
    msg = f"🧠 **FDE Interview Prep** — {today}\n\n"

    category_emoji = {
        "decomposition": "🧩",
        "coding": "💻",
        "debugging": "🐛",
        "sql_data": "📊",
        "learning": "📖",
        "behavioral": "🗣️"
    }

    category_name = {
        "decomposition": "Decomposition",
        "coding": "Coding",
        "debugging": "Debugging",
        "sql_data": "SQL/Data",
        "learning": "Learning Challenge",
        "behavioral": "Behavioral"
    }

    for i, (cat, key, q) in enumerate(questions, 1):
        emoji = category_emoji.get(cat, "❓")
        name = category_name.get(cat, cat)
        diff = q.get("difficulty", "medium").upper()
        lang = f" ({q['language']})" if q.get("language") else ""

        msg += f"**{i}. {emoji} {name}{lang}** [{diff}]\n"
        msg += f"{q['q']}\n\n"

    msg += "Reply with your answers (number them 1, 2). I'll evaluate and give feedback on each. 🎯"
    return msg


def evaluate_answer(category, question, answer):
    """Evaluate a user's answer against the rubric."""
    rubric = question.get("rubric", [])
    # Simple keyword matching — in production, use LLM
    answer_lower = answer.lower()
    hits = sum(1 for item in rubric if any(word in answer_lower for word in item.lower().split()[:3]))
    score = min(5, max(1, round(hits / len(rubric) * 5))) if rubric else 3

    return {
        "score": score,
        "rubric_coverage": f"{hits}/{len(rubric)}",
        "feedback": f"Score: {score}/5"
    }


if __name__ == "__main__":
    questions = pick_questions(2)
    print(format_challenge(questions))
