#!/usr/bin/env python3
"""
End-to-end API test for Greenplot / Seedify backend.

Usage:
    python tests/e2e_test.py --url https://api.greenplot.ink \
                              --email you@example.com \
                              --password yourpassword

All tests print PASS / FAIL with a short description.
Exit code 0 = all tests passed, 1 = one or more failed.
"""

import argparse
import json
import sys
import time
from typing import Optional
import httpx

# ── ANSI colours ──────────────────────────────────────────────────────────────
GREEN = "\033[92m"
RED   = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD  = "\033[1m"


class TestRunner:
    def __init__(self, base_url: str, email: str, password: str):
        self.base = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.token: Optional[str] = None
        self.passed = 0
        self.failed = 0
        self.client = httpx.Client(timeout=30)

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def ok(self, name: str, detail: str = ""):
        self.passed += 1
        suffix = f"  {detail}" if detail else ""
        print(f"  {GREEN}✓ PASS{RESET}  {name}{suffix}")

    def fail(self, name: str, reason: str):
        self.failed += 1
        print(f"  {RED}✗ FAIL{RESET}  {name}")
        print(f"         {YELLOW}{reason}{RESET}")

    def section(self, title: str):
        print(f"\n{BOLD}{title}{RESET}")

    # ── Auth ──────────────────────────────────────────────────────────────────

    def test_login(self) -> bool:
        self.section("1. Authentication")
        try:
            r = self.client.post(
                f"{self.base}/api/v1/login",
                json={"email": self.email, "password": self.password},
            )
            if r.status_code != 200:
                self.fail("Login", f"HTTP {r.status_code}: {r.text[:200]}")
                return False
            data = r.json()
            self.token = data.get("access_token")
            if not self.token:
                self.fail("Login", f"No access_token in response: {data}")
                return False
            self.ok("Login", f"token …{self.token[-12:]}")
            return True
        except Exception as e:
            self.fail("Login", str(e))
            return False

    def test_me(self):
        try:
            r = self.client.get(f"{self.base}/api/v1/account", headers=self._headers())
            if r.status_code == 200:
                u = r.json()
                self.ok("GET /auth/me", f"user_id={u.get('id','?')[:8]}…  email={u.get('email','?')}")
            else:
                self.fail("GET /auth/me", f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            self.fail("GET /auth/me", str(e))

    # ── Seeds ─────────────────────────────────────────────────────────────────

    def test_create_seed(self) -> Optional[str]:
        self.section("2. Seeds")
        payload = {
            "content": "E2E test seed: Testing Greenplot end-to-end pipeline at " + time.strftime("%Y-%m-%d %H:%M:%S"),
            "title": "E2E Test Seed",
        }
        try:
            r = self.client.post(
                f"{self.base}/api/v1/seeds",
                headers=self._headers(),
                json=payload,
            )
            if r.status_code in (200, 201):
                seed = r.json()
                seed_id = seed.get("id")
                self.ok("Create seed", f"id={str(seed_id)[:8]}…")
                return seed_id
            else:
                self.fail("Create seed", f"HTTP {r.status_code}: {r.text[:200]}")
                return None
        except Exception as e:
            self.fail("Create seed", str(e))
            return None

    def test_list_seeds(self):
        try:
            r = self.client.get(f"{self.base}/api/v1/seeds", headers=self._headers())
            if r.status_code == 200:
                seeds = r.json()
                count = len(seeds) if isinstance(seeds, list) else seeds.get("total", "?")
                self.ok("List seeds", f"{count} seeds returned")
            else:
                self.fail("List seeds", f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            self.fail("List seeds", str(e))

    def test_search_seeds(self):
        try:
            r = self.client.get(
                f"{self.base}/api/v1/seeds/search",
                headers=self._headers(),
                params={"q": "test", "limit": 3},
            )
            if r.status_code == 200:
                results = r.json()
                count = len(results) if isinstance(results, list) else "?"
                self.ok("Search seeds", f"{count} results for 'test'")
            else:
                self.fail("Search seeds", f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            self.fail("Search seeds", str(e))

    def test_delete_seed(self, seed_id: str):
        try:
            r = self.client.delete(
                f"{self.base}/api/v1/seeds/{seed_id}",
                headers=self._headers(),
            )
            if r.status_code in (200, 204):
                self.ok("Delete seed", f"id={str(seed_id)[:8]}… removed")
            else:
                self.fail("Delete seed", f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            self.fail("Delete seed", str(e))

    def test_fix_titles(self):
        try:
            r = self.client.post(
                f"{self.base}/api/v1/seeds/fix-titles",
                headers=self._headers(),
            )
            if r.status_code == 200:
                data = r.json()
                fixed = data.get("fixed", 0)
                remaining = data.get("remaining", 0)
                errors = data.get("errors", [])
                if errors:
                    self.fail("Fix seed titles", f"errors: {errors}")
                else:
                    self.ok("Fix seed titles", f"fixed={fixed}  remaining={remaining}")
            else:
                self.fail("Fix seed titles", f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            self.fail("Fix seed titles", str(e))

    # ── Wiki ──────────────────────────────────────────────────────────────────

    def test_search_wiki(self):
        self.section("3. Wiki")
        try:
            r = self.client.get(
                f"{self.base}/api/v1/wiki/search",
                headers=self._headers(),
                params={"q": "AI", "limit": 3},
            )
            if r.status_code == 200:
                data = r.json()
                count = len(data) if isinstance(data, list) else data.get("total", "?")
                self.ok("Search wiki", f"{count} articles for 'AI'")
            else:
                self.fail("Search wiki", f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            self.fail("Search wiki", str(e))

    # ── Chat (non-streaming sanity check) ────────────────────────────────────

    def test_chat_v1(self):
        self.section("4. Chat")
        payload = {
            "messages": [{"role": "user", "content": "Say only the word PONG and nothing else."}],
            "_auth_token": self.token,
        }
        try:
            with self.client.stream(
                "POST",
                f"{self.base}/api/v1/chat",
                headers=self._headers(),
                json=payload,
                timeout=60,
            ) as resp:
                if resp.status_code != 200:
                    self.fail("Chat v1 (stream)", f"HTTP {resp.status_code}")
                    return
                chunks = []
                for line in resp.iter_lines():
                    if line:
                        try:
                            obj = json.loads(line)
                            if obj.get("type") == "text":
                                chunks.append(obj.get("text", ""))
                        except Exception:
                            pass
                reply = "".join(chunks).strip()
                if reply:
                    self.ok("Chat v1 (stream)", f"response: '{reply[:60]}'")
                else:
                    self.fail("Chat v1 (stream)", "empty response")
        except Exception as e:
            self.fail("Chat v1 (stream)", str(e))

    def test_chat_with_tool_use(self):
        """Ask a question that should trigger search_seeds tool call."""
        payload = {
            "messages": [{"role": "user", "content": "What ideas do I have about AI or machine learning? Search my garden."}],
            "_auth_token": self.token,
        }
        try:
            with self.client.stream(
                "POST",
                f"{self.base}/api/v1/chat",
                headers=self._headers(),
                json=payload,
                timeout=90,
            ) as resp:
                if resp.status_code != 200:
                    self.fail("Chat with tool use", f"HTTP {resp.status_code}")
                    return
                tool_calls_seen = []
                text_chunks = []
                for line in resp.iter_lines():
                    if line:
                        try:
                            obj = json.loads(line)
                            t = obj.get("type", "")
                            if t == "tool_call":
                                tool_calls_seen.append(obj.get("name", "unknown"))
                            elif t == "text":
                                text_chunks.append(obj.get("text", ""))
                        except Exception:
                            pass
                reply = "".join(text_chunks).strip()
                if tool_calls_seen:
                    self.ok("Chat tool use", f"tools called: {tool_calls_seen}  reply: {reply[:60]}…")
                elif reply:
                    self.fail("Chat tool use", f"No tool calls seen. reply: '{reply[:100]}'")
                else:
                    self.fail("Chat tool use", "No tool calls and no reply")
        except Exception as e:
            self.fail("Chat tool use", str(e))

    def test_chat_web_search(self):
        """Ask about current events — should trigger web_search."""
        payload = {
            "messages": [{"role": "user", "content": "Search the web for the latest news about large language models released this week."}],
            "_auth_token": self.token,
        }
        try:
            with self.client.stream(
                "POST",
                f"{self.base}/api/v1/chat",
                headers=self._headers(),
                json=payload,
                timeout=90,
            ) as resp:
                if resp.status_code != 200:
                    self.fail("Chat web search", f"HTTP {resp.status_code}")
                    return
                tool_calls_seen = []
                text_chunks = []
                for line in resp.iter_lines():
                    if line:
                        try:
                            obj = json.loads(line)
                            t = obj.get("type", "")
                            if t == "tool_call":
                                tool_calls_seen.append(obj.get("name", "unknown"))
                            elif t == "text":
                                text_chunks.append(obj.get("text", ""))
                        except Exception:
                            pass
                reply = "".join(text_chunks).strip()
                if "web_search" in tool_calls_seen:
                    self.ok("Chat web search", f"web_search called ✓  reply: {reply[:60]}…")
                elif tool_calls_seen:
                    self.fail("Chat web search", f"web_search NOT called (called: {tool_calls_seen}). reply: {reply[:80]}")
                else:
                    self.fail("Chat web search", f"No tools called at all. reply: '{reply[:80]}'")
        except Exception as e:
            self.fail("Chat web search", str(e))

    # ── Email ─────────────────────────────────────────────────────────────────

    def test_send_test_email(self):
        self.section("5. Email")
        try:
            r = self.client.post(
                f"{self.base}/api/v1/email/test",
                headers=self._headers(),
            )
            if r.status_code == 200:
                self.ok("Send test email", r.json().get("message", "sent"))
            elif r.status_code == 503:
                self.fail("Send test email", "503 — RESEND_API_KEY not set on server")
            else:
                self.fail("Send test email", f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            self.fail("Send test email", str(e))

    # ── Briefings / Scheduler ─────────────────────────────────────────────────

    def test_scheduler_morning_spark(self):
        self.section("6. Scheduler / Briefings")
        try:
            r = self.client.post(
                f"{self.base}/api/v1/scheduler/trigger/morning_spark",
                headers=self._headers(),
            )
            if r.status_code == 200:
                self.ok("Trigger morning_spark", r.json().get("status", "ok"))
            else:
                self.fail("Trigger morning_spark", f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            self.fail("Trigger morning_spark", str(e))

    # ── Health ────────────────────────────────────────────────────────────────

    def test_health(self):
        self.section("0. Health")
        try:
            r = self.client.get(f"{self.base}/api/v1/admin/health")
            if r.status_code == 200:
                data = r.json()
                checks = data.get("checks", {})
                summary = "  ".join(f"{k}={v}" for k, v in checks.items())
                self.ok("Health check", summary)
            else:
                self.fail("Health check", f"HTTP {r.status_code}: {r.text[:200]}")
        except Exception as e:
            self.fail("Health check", str(e))

    # ── Runner ────────────────────────────────────────────────────────────────

    def run_all(self):
        print(f"\n{BOLD}Greenplot E2E Test{RESET}  →  {self.base}")
        print("─" * 60)

        self.test_health()

        if not self.test_login():
            print(f"\n{RED}Login failed — cannot continue{RESET}")
            return

        self.test_me()

        # Seeds
        seed_id = self.test_create_seed()
        self.test_list_seeds()
        self.test_search_seeds()
        self.test_fix_titles()
        if seed_id:
            self.test_delete_seed(seed_id)

        # Wiki
        self.test_search_wiki()

        # Chat
        self.test_chat_v1()
        self.test_chat_with_tool_use()
        self.test_chat_web_search()

        # Email
        self.test_send_test_email()

        # Briefings
        self.test_scheduler_morning_spark()

        # Summary
        total = self.passed + self.failed
        print("\n" + "─" * 60)
        color = GREEN if self.failed == 0 else RED
        print(f"{BOLD}Results: {color}{self.passed}/{total} passed{RESET}")
        if self.failed:
            print(f"         {RED}{self.failed} failed{RESET}")
        print()


def main():
    parser = argparse.ArgumentParser(description="Greenplot end-to-end API test")
    parser.add_argument("--url",      default="https://api.greenplot.ink", help="Base API URL")
    parser.add_argument("--email",    required=True, help="Login email")
    parser.add_argument("--password", required=True, help="Login password")
    args = parser.parse_args()

    runner = TestRunner(args.url, args.email, args.password)
    runner.run_all()
    sys.exit(0 if runner.failed == 0 else 1)


if __name__ == "__main__":
    main()
