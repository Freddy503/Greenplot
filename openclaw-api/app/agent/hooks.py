"""
Hook Pipeline

Inspired by claw-code's hooks.rs — shell-based hooks with exit-code semantics.

Claw-code Design:
    - HookEvent: PreToolUse, PostToolUse
    - Shell commands receive JSON on stdin, return exit codes:
        0 = Allow (stdout = optional message)
        2 = Deny (stdout = reason, blocks tool execution)
        other = Warn (stdout = message, allows execution)
    - Environment variables: HOOK_EVENT, HOOK_TOOL_NAME, HOOK_TOOL_INPUT, etc.

Seedify Adaptation:
    - Same event model (PreToolUse, PostToolUse)
    - Python callables instead of shell commands (more natural for FastAPI)
    - HTTP POST callbacks for external integrations
    - Shell command support retained for backward compatibility
    - Same exit-code semantics for shell hooks

Usage:
    runner = HookRunner()

    # Register a Python hook
    async def validate_input(args, tool_name):
        if "password" in str(args).lower():
            return HookOutcome.deny("Refusing to handle passwords")
        return HookOutcome.allow()

    runner.register_pre(validate_input)

    # Run hooks
    result = runner.run_pre_tool_use("search_seeds", {"query": "AI"})
    if result.denied:
        return {"error": result.messages[0]}
"""
from __future__ import annotations

import asyncio
import json
import subprocess
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable, Optional, Union


# ── Events ───────────────────────────────────────────────────────────────────


class HookEvent(str, Enum):
    """Hook trigger points in the agent loop."""
    PRE_TOOL_USE = "PreToolUse"
    POST_TOOL_USE = "PostToolUse"


# ── Outcomes ─────────────────────────────────────────────────────────────────


class HookOutcomeKind(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    WARN = "warn"


@dataclass(frozen=True)
class HookOutcome:
    """
    Result of a single hook execution.

    Mirrors claw-code's exit-code semantics:
    - Allow: hook is happy, proceed
    - Deny: hook blocks execution (exit code 2)
    - Warn: hook has concerns but allows execution (other exit codes)
    """
    kind: HookOutcomeKind
    message: Optional[str] = None

    @classmethod
    def allow(cls, message: Optional[str] = None) -> HookOutcome:
        return cls(kind=HookOutcomeKind.ALLOW, message=message)

    @classmethod
    def deny(cls, message: Optional[str] = None) -> HookOutcome:
        return cls(kind=HookOutcomeKind.DENY, message=message)

    @classmethod
    def warn(cls, message: str) -> HookOutcome:
        return cls(kind=HookOutcomeKind.WARN, message=message)

    @property
    def is_allowed(self) -> bool:
        return self.kind != HookOutcomeKind.DENY

    @property
    def is_denied(self) -> bool:
        return self.kind == HookOutcomeKind.DENY


# ── Hook Result ──────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class HookRunResult:
    """
    Aggregated result of running all hooks for an event.

    Mirrors claw-code's HookRunResult:
    - denied: True if any hook denied
    - messages: All collected messages (warnings + deny reasons)
    """
    denied: bool
    messages: list[str] = field(default_factory=list)

    @classmethod
    def allow(cls, messages: Optional[list[str]] = None) -> HookRunResult:
        return cls(denied=False, messages=messages or [])

    @classmethod
    def deny(cls, messages: list[str]) -> HookRunResult:
        return cls(denied=True, messages=messages)


# ── Hook Types ───────────────────────────────────────────────────────────────

# Python callable hook: async function receiving (tool_name, args, output?, is_error?)
# Returns HookOutcome
PythonHook = Callable[..., Awaitable[HookOutcome]]

# Shell command hook: string command, receives JSON on stdin
ShellHook = str

# HTTP callback hook: URL to POST JSON payload to
HttpHook = str

Hook = Union[PythonHook, ShellHook, HttpHook]


# ── Hook Runner ──────────────────────────────────────────────────────────────


class HookRunner:
    """
    Runs hooks at tool execution boundaries.

    Inspired by claw-code's HookRunner:
    - PreToolUse: runs before tool execution, can deny
    - PostToolUse: runs after tool execution, can mark errors
    - Multiple hooks per event (run in order, first deny wins)

    Supports three hook types:
    - Python callables (async functions)
    - Shell commands (exit-code semantics)
    - HTTP POST callbacks

    Usage:
        runner = HookRunner()

        # Python hook
        async def check_input(tool_name, args, **kw):
            if tool_name == "bash" and "rm -rf" in args.get("command", ""):
                return HookOutcome.deny("Destructive command blocked")
            return HookOutcome.allow()
        runner.register_pre(check_input)

        # Shell hook
        runner.register_pre("./hooks/validate.sh")

        # HTTP hook
        runner.register_post("https://hooks.example.com/tool-used")

        # Run
        result = runner.run_pre_tool_use("bash", {"command": "ls"})
    """

    def __init__(self) -> None:
        self._pre_hooks: list[Hook] = []
        self._post_hooks: list[Hook] = []

    # ── Registration ──────────────────────────────────────────────

    def register_pre(self, hook: Hook) -> None:
        """Register a PreToolUse hook."""
        self._pre_hooks.append(hook)

    def register_post(self, hook: Hook) -> None:
        """Register a PostToolUse hook."""
        self._post_hooks.append(hook)

    def register(self, event: HookEvent, hook: Hook) -> None:
        """Register a hook for a specific event."""
        if event == HookEvent.PRE_TOOL_USE:
            self._pre_hooks.append(hook)
        else:
            self._post_hooks.append(hook)

    @property
    def has_pre_hooks(self) -> bool:
        return len(self._pre_hooks) > 0

    @property
    def has_post_hooks(self) -> bool:
        return len(self._post_hooks) > 0

    # ── Execution ─────────────────────────────────────────────────

    async def run_pre_tool_use(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
    ) -> HookRunResult:
        """Run all PreToolUse hooks. First deny stops the chain."""
        return await self._run_hooks(
            event=HookEvent.PRE_TOOL_USE,
            hooks=self._pre_hooks,
            tool_name=tool_name,
            tool_input=json.dumps(tool_input),
            tool_output=None,
            is_error=False,
        )

    async def run_post_tool_use(
        self,
        tool_name: str,
        tool_input: dict[str, Any],
        tool_output: str,
        is_error: bool = False,
    ) -> HookRunResult:
        """Run all PostToolUse hooks."""
        return await self._run_hooks(
            event=HookEvent.POST_TOOL_USE,
            hooks=self._post_hooks,
            tool_name=tool_name,
            tool_input=json.dumps(tool_input),
            tool_output=tool_output,
            is_error=is_error,
        )

    # ── Internals ─────────────────────────────────────────────────

    async def _run_hooks(
        self,
        event: HookEvent,
        hooks: list[Hook],
        tool_name: str,
        tool_input: str,
        tool_output: Optional[str],
        is_error: bool,
    ) -> HookRunResult:
        """Execute hooks in order. First deny breaks the chain."""
        if not hooks:
            return HookRunResult.allow()

        messages: list[str] = []
        payload = json.dumps({
            "hook_event_name": event.value,
            "tool_name": tool_name,
            "tool_input": _parse_tool_input(tool_input),
            "tool_input_json": tool_input,
            "tool_output": tool_output,
            "tool_result_is_error": is_error,
        })

        for hook in hooks:
            outcome = await self._run_one_hook(
                hook=hook,
                event=event,
                tool_name=tool_name,
                tool_input=tool_input,
                tool_output=tool_output,
                is_error=is_error,
                payload=payload,
            )

            if outcome.kind == HookOutcomeKind.WARN:
                if outcome.message:
                    messages.append(outcome.message)
            elif outcome.message:
                messages.append(outcome.message)

            if outcome.is_denied:
                return HookRunResult.deny(messages)

        return HookRunResult.allow(messages)

    async def _run_one_hook(
        self,
        hook: Hook,
        event: HookEvent,
        tool_name: str,
        tool_input: str,
        tool_output: Optional[str],
        is_error: bool,
        payload: str,
    ) -> HookOutcome:
        """Execute a single hook."""
        if callable(hook):
            return await self._run_python_hook(
                hook, tool_name, tool_input, tool_output, is_error
            )
        elif isinstance(hook, str) and hook.startswith(("http://", "https://")):
            return await self._run_http_hook(hook, payload)
        elif isinstance(hook, str):
            return await self._run_shell_hook(
                hook, event, tool_name, tool_input, tool_output, is_error, payload
            )
        else:
            return HookOutcome.warn(f"Unknown hook type: {type(hook)}")

    @staticmethod
    async def _run_python_hook(
        hook: PythonHook,
        tool_name: str,
        tool_input: str,
        tool_output: Optional[str],
        is_error: bool,
    ) -> HookOutcome:
        """Run a Python callable hook."""
        try:
            args = json.loads(tool_input) if tool_input else {}
            return await hook(
                tool_name=tool_name,
                args=args,
                tool_output=tool_output,
                is_error=is_error,
            )
        except Exception as e:
            return HookOutcome.warn(f"Python hook error: {e}")

    @staticmethod
    async def _run_shell_hook(
        command: str,
        event: HookEvent,
        tool_name: str,
        tool_input: str,
        tool_output: Optional[str],
        is_error: bool,
        payload: str,
    ) -> HookOutcome:
        """
        Run a shell command hook with exit-code semantics.

        Exit codes (matches claw-code):
        - 0 = Allow
        - 2 = Deny
        - other = Warn
        """
        import os

        env = {
            **os.environ,
            "HOOK_EVENT": event.value,
            "HOOK_TOOL_NAME": tool_name,
            "HOOK_TOOL_INPUT": tool_input,
            "HOOK_TOOL_IS_ERROR": "1" if is_error else "0",
        }
        if tool_output is not None:
            env["HOOK_TOOL_OUTPUT"] = tool_output

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            stdout_bytes, stderr_bytes = await proc.communicate(
                input=payload.encode()
            )
            stdout = stdout_bytes.decode().strip()
            stderr = stderr_bytes.decode().strip()
            code = proc.returncode

            if code == 0:
                return HookOutcome.allow(stdout if stdout else None)
            elif code == 2:
                return HookOutcome.deny(
                    stdout if stdout else f"{event.value} hook denied tool `{tool_name}`"
                )
            else:
                msg = f"Hook `{command}` exited with status {code}; allowing execution to continue"
                if stdout:
                    msg += f": {stdout}"
                elif stderr:
                    msg += f": {stderr}"
                return HookOutcome.warn(msg)

        except Exception as e:
            return HookOutcome.warn(
                f"{event.value} hook `{command}` failed to start for `{tool_name}`: {e}"
            )

    @staticmethod
    async def _run_http_hook(url: str, payload: str) -> HookOutcome:
        """Run an HTTP POST callback hook."""
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    url,
                    content=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("deny"):
                        return HookOutcome.deny(data.get("message", "Hook denied"))
                    return HookOutcome.allow(data.get("message"))
                elif resp.status_code == 403:
                    return HookOutcome.deny(resp.text or "Hook denied")
                else:
                    return HookOutcome.warn(f"Hook HTTP {resp.status_code}: {resp.text[:100]}")
        except Exception as e:
            return HookOutcome.warn(f"HTTP hook error: {e}")


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse_tool_input(tool_input: str) -> dict[str, Any]:
    """Parse tool input JSON, falling back to raw string."""
    try:
        return json.loads(tool_input)
    except (json.JSONDecodeError, TypeError):
        return {"raw": str(tool_input)}
