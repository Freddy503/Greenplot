#!/usr/bin/env python3
"""
fde_daily_insight.py — Bite-sized FDE knowledge course for Freddy.

One concept per day, building progressively. Like a course but 5-minute reads.

Modules (ordered):
1. Git & Version Control (week 1)
2. Docker & Containerization (week 2)
3. SQL & Databases (week 3)
4. APIs & HTTP (week 4)
5. CI/CD Pipelines (week 5)
6. Deployment Patterns (week 6)
7. PR Review Process (ongoing alongside)

Each module has 5-7 daily lessons.
"""

import json
import os
import datetime

PROGRESS_FILE = os.path.join(os.path.dirname(__file__), "fde_course_progress.json")

COURSE = {
    "git": {
        "title": "🔧 Git & Version Control",
        "lessons": [
            {
                "day": 1,
                "title": "What Git actually tracks",
                "content": """**Concept:** Git doesn't track files. It tracks *snapshots*.

Every commit is a complete snapshot of your entire project at that moment. Git stores the full file, but uses compression so unchanged files are just references to the previous snapshot.

**Why this matters:** When you run `git diff`, Git isn't comparing files on disk — it's comparing two complete snapshots and computing the difference on the fly.

**Key mental model:** Think of Git like a series of photographs of your project, not like a log of changes.

**Try this:** Run `git log --oneline` in any project. Each line is a snapshot. Run `git show <hash>` to see what one snapshot contained.""",
                "quiz": "What does Git actually store when you commit — changes, diffs, or snapshots?"
            },
            {
                "day": 2,
                "title": "The three areas: working directory, staging, repository",
                "content": """**Concept:** Your code exists in THREE places at once:

1. **Working directory** — the actual files on your disk (what you edit)
2. **Staging area (index)** — what you've marked to be included in the next commit
3. **Repository** — committed snapshots (permanent history)

**The flow:** Edit → `git add` (working → staging) → `git commit` (staging → repository)

**Why staging exists:** So you can craft *meaningful* commits. You might change 10 files but only want to commit 3 related ones. Staging lets you pick.

**Common mistake:** `git add .` adds EVERYTHING. Better: `git add file1.py file2.py` to be intentional.

**Try this:** Make a change, run `git status`. See "Changes not staged"? That's the gap between working directory and staging.""",
                "quiz": "If you edit a file but don't `git add` it, which area is it in?"
            },
            {
                "day": 3,
                "title": "Branches are just pointers",
                "content": """**Concept:** A branch in Git is literally just a 40-character pointer to a commit. That's it. 41 bytes.

`main` is a file containing a commit hash. `feature/xyz` is another file containing a (different) commit hash.

When you commit on a branch, the pointer moves forward. When you create a branch, you're just creating a new pointer.

**Why this matters:** Branches are cheap. Create them freely. Delete them after merging. A branch that lives for months is a liability.

**Best practice:** Branch names should be short-lived. `feat/add-login`, `fix/csv-parser`, `chore/update-deps`. Merge and delete.

**Try this:** `git log --oneline --graph --all` — see the branch pointers in action.""",
                "quiz": "What IS a branch in Git? A folder? A copy of your code? Or something else?"
            },
            {
                "day": 4,
                "title": "Merge vs Rebase — and when to use each",
                "content": """**Concept:** Two ways to combine branches:

**Merge:** Creates a new "merge commit" that has TWO parents. Preserves the exact history of both branches. History looks like a graph with forks.

**Rebase:** Takes your branch's commits and replays them ON TOP of the target branch. History becomes linear — looks like you worked in sequence.

**Rule of thumb:**
- `git merge` for shared branches (main, develop) — preserves context
- `git rebase` for your personal feature branch — cleans up history before merging

**The golden rule:** NEVER rebase a branch that other people are working on. Rebase rewrites history. If someone else has that history, everything breaks.

**Try this:** On a feature branch, run `git rebase main`. Then check `git log --oneline`. See how your commits are now on top of main's latest?""",
                "quiz": "When should you NEVER use rebase?"
            },
            {
                "day": 5,
                "title": "Resolving merge conflicts",
                "content": """**Concept:** A merge conflict happens when Git can't automatically combine two changes to the same part of a file.

The file will contain:
```
<<<<<<< HEAD (your changes)
your version of this section
=======
their version of this section
>>>>>>> branch-name (their changes)
```

**How to resolve:**
1. Open the file
2. Decide which version to keep (or combine them)
3. Delete the `<<<<<<<`, `=======`, `>>>>>>>` markers
4. `git add <file>` and `git commit`

**Pro tip:** Conflicts are NORMAL. They mean two people touched the same code. The fear of conflicts is why junior devs avoid branching — don't be that person. Branch freely, resolve conflicts when merging.

**Try this:** Create a conflict on purpose. Edit line 5 of a file on two branches, merge them. Resolve it.""",
                "quiz": "What do the `<<<<<<<`, `=======`, `>>>>>>>` markers mean in a file?"
            },
        ]
    },
    "docker": {
        "title": "🐳 Docker & Containerization",
        "lessons": [
            {
                "day": 1,
                "title": "What a container actually is",
                "content": """**Concept:** A container is NOT a virtual machine. It's a process running on the host OS with isolated:
- File system (its own view of `/`, `/usr`, etc.)
- Network (its own IP, ports)
- Process tree (can't see host processes)
- Users (its own root user)

**The key insight:** Containers share the host's kernel. They're just processes with namespace isolation and cgroup resource limits. This is why they start in milliseconds — no OS boot.

**Docker vs VM:**
- VM: full OS, gigabytes, minutes to start
- Container: shares kernel, megabytes, milliseconds to start

**Why FDEs care:** You need to deploy the same code to dev, staging, and production. Containers guarantee identical environments. "Works on my machine" becomes "works in the container."

**Try this:** `docker run hello-world` — see how fast it starts? That's because there's no OS boot.""",
                "quiz": "Do containers share the host's kernel or have their own?"
            },
            {
                "day": 2,
                "title": "Dockerfile — your container recipe",
                "content": """**Concept:** A Dockerfile is a set of instructions to build a container image. Each line creates a layer.

```dockerfile
FROM python:3.12-slim    # Start from a base image
WORKDIR /app             # Set working directory
COPY requirements.txt .  # Copy dependency list FIRST (caching!)
RUN pip install -r requirements.txt  # Install deps
COPY . .                 # Copy your code
CMD ["python", "main.py"]  # What to run when container starts
```

**Key insight:** Docker caches layers. If requirements.txt hasn't changed, it reuses the cached `pip install` layer. That's why you COPY dependency files BEFORE your code.

**Order matters:** Put things that change least (base image, deps) at the top. Things that change most (your code) at the bottom.

**Try this:** Look at any Dockerfile in your projects. Can you identify which layers change often vs rarely?""",
                "quiz": "Why should you COPY requirements.txt before COPY . . in a Dockerfile?"
            },
            {
                "day": 3,
                "title": "docker-compose — orchestrating multiple containers",
                "content": """**Concept:** Real apps aren't one container. They're multiple: your app + database + cache + queue. Docker Compose defines them all in one file.

```yaml
services:
  api:
    build: .
    ports: ["8000:8000"]
    depends_on: [db, redis]
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/myapp
  
  db:
    image: postgres:15
    volumes: [pgdata:/var/lib/postgresql/data]
  
  redis:
    image: redis:7

volumes:
  pgdata:  # Persists data across container restarts
```

**Key concepts:**
- `depends_on` — starts db before api (but doesn't wait for "ready")
- `volumes` — persistent storage (data survives container restarts)
- Service names as hostnames — api connects to `db:5432` (not `localhost`)

**Try this:** Look at your `openclaw-api/docker-compose.yml`. Identify: what services exist? What volumes? What depends on what?""",
                "quiz": "In docker-compose, how does the api container reach the database? What hostname does it use?"
            },
            {
                "day": 4,
                "title": "Volumes, bind mounts, and ephemeral containers",
                "content": """**Concept:** Containers are ephemeral — when they die, their filesystem is gone. Three ways to persist data:

1. **Named volumes** (`volumes: pgdata:/data`) — managed by Docker, best for databases
2. **Bind mounts** (`-v /host/path:/container/path`) — maps host folder into container, good for development
3. **No persistence** — everything in the container layer, lost on restart

**Rule:** Databases ALWAYS use named volumes. Development uses bind mounts (for live-reload). Production app code should be baked into the image (COPY in Dockerfile).

**Why this matters:** If your Postgres container has no volume, restarting it = all data gone. I've seen people lose production data this way.

**Try this:** `docker volume ls` — see what volumes exist. `docker volume inspect <name>` — see where the data actually lives on disk.""",
                "quiz": "Your Postgres container restarts and all data is gone. What's the most likely cause?"
            },
            {
                "day": 5,
                "title": "Debugging containers: exec, logs, and health checks",
                "content": """**Concept:** Three essential debugging tools:

**1. Logs:** `docker logs <container> -f` — stream what the process prints
**2. Exec:** `docker exec -it <container> bash` — get a shell INSIDE the container
**3. Health checks:** Define in Dockerfile or compose:
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s \\
  CMD curl -f http://localhost:8000/health || exit 1
```

**Common issues:**
- "Connection refused" → service isn't running or port isn't exposed
- "Can't connect to db" → container networking issue, check service name
- OOM killed → container hit memory limit, check `docker stats`

**Try this:** `docker exec -it <container> env` — see environment variables. `docker stats` — see live resource usage.""",
                "quiz": "How do you get a shell inside a running container?"
            },
        ]
    },
    "sql": {
        "title": "📊 SQL & Databases",
        "lessons": [
            {
                "day": 1,
                "title": "SELECT, WHERE, and filtering basics",
                "content": """**Concept:** SQL is how you talk to relational databases. The core operation: SELECT.

```sql
-- Get all users
SELECT * FROM users;

-- Get specific columns
SELECT name, email FROM users;

-- Filter with WHERE
SELECT * FROM users WHERE age > 25;
SELECT * FROM users WHERE name = 'Freddy' AND active = true;
SELECT * FROM users WHERE email LIKE '%@sap.com';
```

**Key operators:**
- `=`, `!=`, `<`, `>` — comparison
- `AND`, `OR`, `NOT` — logic
- `LIKE '%pattern%'` — pattern matching
- `IN ('a', 'b')` — list membership
- `IS NULL`, `IS NOT NULL` — null checks

**Common mistake:** `WHERE name = NULL` doesn't work. Use `IS NULL`.

**Try this:** Think of your Idea Garden. What SQL query would get all seeds tagged "FDE" created this month?""",
                "quiz": "Write a SQL query: get all users whose email ends with '@sap.com' and are active."
            },
            {
                "day": 2,
                "title": "JOINs — combining tables",
                "content": """**Concept:** Real data lives in multiple tables. JOINs combine them.

```sql
-- Users and their orders
SELECT users.name, orders.total
FROM users
JOIN orders ON users.id = orders.user_id;

-- LEFT JOIN: include users even if they have no orders
SELECT users.name, orders.total
FROM users
LEFT JOIN orders ON users.id = orders.user_id;
```

**JOIN types:**
- `INNER JOIN` (or just `JOIN`) — only matching rows from both tables
- `LEFT JOIN` — all rows from left table, NULLs if no match on right
- `RIGHT JOIN` — opposite of LEFT
- `FULL JOIN` — everything from both sides

**Why LEFT JOIN matters:** "Show me all users and their order count" — if you use INNER JOIN, users with 0 orders disappear. LEFT JOIN keeps them.

**Try this:** If you have `seeds(id, title)` and `ratings(seed_id, score)`, write a query that shows all seeds with their average rating, including seeds with no ratings.""",
                "quiz": "What's the difference between JOIN and LEFT JOIN?"
            },
            {
                "day": 3,
                "title": "GROUP BY and aggregations",
                "content": """**Concept:** GROUP BY collapses multiple rows into summary rows.

```sql
-- Count users per department
SELECT department, COUNT(*) as user_count
FROM users
GROUP BY department;

-- Average order value per user
SELECT user_id, AVG(total) as avg_order, SUM(total) as total_spent
FROM orders
GROUP BY user_id;

-- HAVING filters AFTER grouping (WHERE filters BEFORE)
SELECT department, COUNT(*) as count
FROM users
GROUP BY department
HAVING COUNT(*) > 5;
```

**Aggregate functions:**
- `COUNT(*)` — number of rows
- `SUM(column)` — total
- `AVG(column)` — average
- `MIN(column)`, `MAX(column)` — extremes

**Key difference:** `WHERE` filters individual rows BEFORE grouping. `HAVING` filters groups AFTER grouping.

**Try this:** Write a query: for each seed domain, count how many enriched seeds exist, but only show domains with more than 3 seeds.""",
                "quiz": "What's the difference between WHERE and HAVING?"
            },
            {
                "day": 4,
                "title": "Window functions — the power tool",
                "content": """**Concept:** Window functions do calculations across related rows WITHOUT collapsing them (unlike GROUP BY).

```sql
-- Rank users by spend within their department
SELECT name, department, spend,
  RANK() OVER (PARTITION BY department ORDER BY spend DESC) as dept_rank
FROM users;

-- Running total of orders
SELECT date, amount,
  SUM(amount) OVER (ORDER BY date) as running_total
FROM orders;

-- Previous row comparison
SELECT date, amount,
  LAG(amount) OVER (ORDER BY date) as prev_amount,
  amount - LAG(amount) OVER (ORDER BY date) as change
FROM orders;
```

**Why FDEs need this:** Window functions are the answer to 80% of "how do I compute X relative to other rows" questions. Interviewers LOVE them.

**Key functions:** `ROW_NUMBER()`, `RANK()`, `DENSE_RANK()`, `LAG()`, `LEAD()`, `SUM() OVER()`

**Try this:** Write a query: for each region, find the top 3 customers by total spend.""",
                "quiz": "What's the difference between RANK() and ROW_NUMBER()?"
            },
        ]
    },
    "apis": {
        "title": "🌐 APIs & HTTP",
        "lessons": [
            {
                "day": 1,
                "title": "HTTP methods and what they mean",
                "content": """**Concept:** HTTP methods are verbs — they tell the server what you want to do.

- **GET** — read data (no body, safe to repeat)
- **POST** — create something (has a body)
- **PUT** — replace something entirely
- **PATCH** — update part of something
- **DELETE** — remove something

**Key properties:**
- GET is **idempotent** — calling it 10 times = same result
- POST is NOT idempotent — calling it 10 times = 10 new things
- GET is **safe** — doesn't change server state

**Status codes matter:**
- `200` OK
- `201` Created
- `400` Bad request (your fault)
- `401` Unauthorized (who are you?)
- `403` Forbidden (I know who you are, but no)
- `404` Not found
- `500` Server error (our fault)

**Try this:** `curl -v https://httpbin.org/get` — see the full HTTP request and response.""",
                "quiz": "Is GET or POST idempotent? What does idempotent mean?"
            },
            {
                "day": 2,
                "title": "REST API design — resources and endpoints",
                "content": """**Concept:** REST APIs organize around RESOURCES (nouns), not actions (verbs).

```
GET    /api/v1/seeds          → list all seeds
POST   /api/v1/seeds          → create a seed
GET    /api/v1/seeds/abc-123  → get one seed
PATCH  /api/v1/seeds/abc-123  → update a seed
DELETE /api/v1/seeds/abc-123  → delete a seed
```

**Rules:**
- URLs are nouns (`/seeds`), not verbs (`/getSeeds`)
- HTTP method is the verb (GET, POST, etc.)
- IDs in the URL, not query params (`/seeds/123`, not `/seeds?id=123`)
- Nested resources: `/seeds/123/ratings` — ratings belonging to seed 123

**Versioning:** `/v1/seeds` — so you can change the API without breaking clients.

**Try this:** Look at your Seedify API. List all endpoints. Are they RESTful? Any verb-based URLs?""",
                "quiz": "Should a URL contain a verb like /getUsers or a noun like /users?"
            },
            {
                "day": 3,
                "title": "Authentication: API keys, JWTs, and OAuth",
                "content": """**Concept:** Three common auth patterns:

**1. API Key:** Simple string in header. `X-API-Key: abc123`
- Easy to implement, easy to revoke
- No user context (just "is this key valid?")

**2. JWT (JSON Web Token):** Encoded JSON with user info + signature.
- Contains: user_id, tenant_id, expiration
- Stateless — server doesn't store sessions
- Your Seedify API uses this: `Authorization: Bearer <jwt>`

**3. OAuth:** Delegation protocol. "Login with Google" flow.
- User authorizes your app on provider's site
- Provider gives you a token
- Complex but lets users avoid new passwords

**JWT structure:** `header.payload.signature`
- Header: algorithm used
- Payload: user data + expiration
- Signature: proves it wasn't tampered with

**Try this:** Decode a JWT at jwt.io. Take a token from your API and paste it in.""",
                "quiz": "Why are JWTs 'stateless'? What does the server NOT need to store?"
            },
        ]
    },
    "cicd": {
        "title": "⚙️ CI/CD Pipelines",
        "lessons": [
            {
                "day": 1,
                "title": "CI vs CD — what they actually mean",
                "content": """**Concept:** Two separate things:

**CI (Continuous Integration):**
- Every code push triggers automated checks
- Run tests, lint code, build the project
- Goal: catch bugs BEFORE they reach main
- Tools: GitHub Actions, GitLab CI, Jenkins

**CD (Continuous Delivery/Deployment):**
- **Delivery:** Automatically prepare releases (build artifacts, staging deploys). Human clicks "deploy."
- **Deployment:** Automatically deploy to production on every merge to main. No human.

**Your Seedify setup is CI only right now:**
- Push to GitHub → Vercel auto-builds → but deployment is manual (tunnel issues)

**The progression:** CI → Continuous Delivery → Continuous Deployment. Most companies are at "Delivery." Very few do full "Deployment" safely.

**Try this:** Look at `.github/workflows/` in any repo. What does the CI pipeline do?""",
                "quiz": "What's the difference between Continuous Delivery and Continuous Deployment?"
            },
            {
                "day": 2,
                "title": "GitHub Actions — how they work",
                "content": """**Concept:** GitHub Actions = CI/CD built into GitHub.

```yaml
name: CI
on: [push, pull_request]  # Triggers

jobs:
  test:
    runs-on: ubuntu-latest  # The machine
    steps:
      - uses: actions/checkout@v4  # Get the code
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: python -m pytest
```

**Key concepts:**
- **Workflow** = a YAML file in `.github/workflows/`
- **Trigger** = when it runs (push, PR, schedule, manual)
- **Job** = a sequence of steps on one machine
- **Step** = a single command or reusable action
- **Action** = pre-built step (checkout, setup-python, etc.)

**Secrets:** Store API keys as GitHub Secrets, reference as `${{ secrets.OPENAI_API_KEY }}`

**Try this:** Create a simple `.github/workflows/hello.yml` that runs `echo "Hello CI"` on every push.""",
                "quiz": "Where do GitHub Actions workflow files live in a repository?"
            },
        ]
    },
}


def get_progress():
    """Get current course progress."""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"module": "git", "day": 0, "completed": []}


def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def get_today_lesson():
    """Get today's lesson based on progress."""
    progress = get_progress()
    module_key = progress["module"]
    day = progress["day"]

    if module_key not in COURSE:
        module_key = list(COURSE.keys())[0]

    module = COURSE[module_key]
    lessons = module["lessons"]

    if day >= len(lessons):
        # Move to next module
        keys = list(COURSE.keys())
        current_idx = keys.index(module_key)
        if current_idx + 1 < len(keys):
            module_key = keys[current_idx + 1]
            day = 0
            progress["module"] = module_key
            progress["day"] = 0
            save_progress(progress)
            module = COURSE[module_key]
            lessons = module["lessons"]
        else:
            # Course complete, loop back
            progress["module"] = keys[0]
            progress["day"] = 0
            save_progress(progress)
            return get_today_lesson()

    lesson = lessons[day]
    return module, lesson, progress


def format_lesson(module, lesson, progress):
    """Format today's lesson as a message."""
    msg = f"📚 **FDE Course — Day {lesson['day']}**\n"
    msg += f"*{module['title']}*\n\n"
    msg += f"### {lesson['title']}\n\n"
    msg += lesson['content']
    msg += f"\n\n---\n**🤔 Quiz:** {lesson['quiz']}"
    msg += f"\n\nReply with your answer. I'll confirm or correct."
    msg += f"\n\n*Progress: {progress['module']} day {progress['day'] + 1}/{len(COURSE[progress['module']]['lessons'])}*"
    return msg


def advance():
    """Advance to next day."""
    progress = get_progress()
    progress["day"] += 1
    progress["completed"].append(f"{progress['module']}:{progress['day'] - 1}")
    save_progress(progress)
    return progress


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--today", action="store_true", help="Show today's lesson")
    parser.add_argument("--advance", action="store_true", help="Mark today complete, advance")
    parser.add_argument("--progress", action="store_true", help="Show progress")
    args = parser.parse_args()

    if args.today:
        module, lesson, progress = get_today_lesson()
        print(format_lesson(module, lesson, progress))
    elif args.advance:
        progress = advance()
        print(f"Advanced to {progress['module']} day {progress['day']}")
    elif args.progress:
        progress = get_progress()
        print(json.dumps(progress, indent=2))
    else:
        parser.print_help()
