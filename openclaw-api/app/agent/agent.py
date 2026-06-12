"""
Seedify Agent Loop

The core engine. Inspired by claw-code's ConversationRuntime<C, T> pattern:

    fn run_turn(user_input):
        append user message to session
        loop (up to max_iterations):
            1. Build ApiRequest { system_prompt, messages }
            2. Call api_client.stream(request) → Vec<AssistantEvent>
            3. Build assistant message from events (TextDelta + ToolUse blocks)
            4. Track token usage
            5. Push assistant message to session
            6. If no ToolUse blocks → break (text-only response)
            7. For each ToolUse:
               a. Check permission_policy
               b. Execute tool via tool_executor
               c. Push ToolResult to session
        return TurnSummary

Key differences from the original main.py chat endpoint:
- Clean separation: agent loop is a class, not nested inside a route handler
- Typed events instead of scattered json.dumps yields
- Session with ContentBlocks instead of raw dicts
- Registry-based tool dispatch instead of flat function maps
- Permission checking before tool execution
- Compaction for long sessions

Usage:
    agent = SeedifyAgent(registry=registry, llm_client=client)
    async for event in agent.run(messages, user, db):
        print(event.to_ndjson())
"""
from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Optional

import httpx

from app.agent.registry import ToolRegistry
from app.agent.session import Session, Message, ContentBlock
from app.agent.stream import AgentEvent
from app.agent.permissions import PermissionLevel, check_permission, get_user_permission


class SeedifyAgent:
    """
    Agent loop with tool execution.

    Accepts LLM client and tool registry as dependencies (trait-based DI pattern).

    Usage:
        agent = SeedifyAgent(
            registry=my_registry,
            api_key="sk-...",
            model="anthropic/claude-sonnet-4",
        )
        async for event in agent.run(messages, user, db):
            # Stream events to frontend
            yield event.to_ndjson()
    """

    def __init__(
        self,
        *,
        registry: ToolRegistry,
        api_key: str,
        model: str = "anthropic/claude-sonnet-4",
        api_base: str = "https://openrouter.ai/api/v1/chat/completions",
        max_rounds: int = 3,
        system_prompt: str = "",
        hook_runner: Optional[Any] = None,
    ) -> None:
        self.registry = registry
        self.api_key = api_key
        self.model = model
        self.api_base = api_base
        self.max_rounds = max_rounds
        self.system_prompt = system_prompt
        self.hook_runner = hook_runner  # Optional HookRunner for pre/post tool hooks
        self._last_session: Optional[Session] = None  # Captured after run()

    @property
    def last_session(self) -> Optional[Session]:
        """The session from the most recent run(). Available after the generator completes."""
        return self._last_session

    async def run(
        self,
        messages: list[dict[str, Any]],
        user: Any = None,
        db: Any = None,
        *,
        attachments: Optional[list[dict]] = None,
    ) -> AsyncGenerator[AgentEvent, None]:
        """
        Run one agent turn. Yields typed AgentEvents.

        This is the main loop — inspired by claw-code's conversation.rs:

        1. Parse incoming messages into Session
        2. Loop up to max_rounds:
           a. Call LLM with messages + tool definitions
           b. Stream content and collect tool calls
           c. If tool calls present, execute and append results
           d. If no tool calls, we're done
        3. Yield done event

        Args:
            messages:   Chat history (OpenAI format)
            user:       Current user (for auth + permissions)
            db:         Database session
            attachments: Optional file attachments
        """
        import asyncio

        # Build session from input messages
        session = self._build_session(messages, attachments)

        # Determine user permission level
        user_permission = get_user_permission(user)
        tool_definitions = self.registry.to_openai(filter_permission=user_permission)

        yield AgentEvent.status("Thinking…")

        # Recovery state: when the model ends a round with neither text nor
        # tool calls (thinking models burning the budget on reasoning, or
        # providers reporting odd finish_reasons), we retry once without
        # tools and an explicit nudge instead of silently going mute.
        force_text = False
        nudged = False

        replied = False

        async with httpx.AsyncClient() as client:
            # +2: one slot for the forced-text final round, one for the
            # empty-reply recovery retry.
            for round_num in range(self.max_rounds + 2):
                is_final = round_num >= self.max_rounds or force_text
                yield AgentEvent.round(min(round_num, self.max_rounds), self.max_rounds)

                # Build API payload
                llm_messages = session.to_llm_messages()
                if self.system_prompt:
                    llm_messages.insert(0, {
                        "role": "system",
                        "content": self.system_prompt,
                    })
                if is_final:
                    # Ephemeral nudge — not persisted to the session
                    llm_messages.append({
                        "role": "user",
                        "content": "(Respond to me now in plain text — no more tool calls. "
                                   "Summarize what you found or did, and answer my last message directly.)",
                    })

                payload: dict[str, Any] = {
                    "model": self.model,
                    "messages": llm_messages,
                    "stream": True,
                }

                # Add tools (skip on final round to force text response)
                if not is_final and tool_definitions:
                    payload["tools"] = tool_definitions

                # ── Stream from LLM ───────────────────────────────
                content_buffer = ""
                tool_calls_acc: dict[int, dict] = {}
                finish_reason: Optional[str] = None
                has_content = False

                try:
                    async with client.stream(
                        "POST",
                        self.api_base,
                        headers=self._headers(),
                        json=payload,
                        timeout=120.0,
                    ) as resp:
                        if resp.status_code != 200:
                            error_text = await resp.aread()
                            yield AgentEvent.error(f"API error ({resp.status_code}): {error_text.decode()}")
                            return

                        async for line in resp.aiter_lines():
                            if not line.startswith("data: "):
                                continue

                            data = line[6:].strip()
                            if data == "[DONE]":
                                break

                            try:
                                chunk = json.loads(data)
                                choice = chunk["choices"][0]
                                delta = choice.get("delta", {})
                                finish_reason = choice.get("finish_reason") or finish_reason

                                # Text content
                                text = delta.get("content", "")
                                if text:
                                    if not has_content:
                                        yield AgentEvent.status("")
                                        has_content = True
                                    content_buffer += text
                                    yield AgentEvent.content(text)

                                # Tool call chunks (accumulate streamed fragments)
                                for tc in delta.get("tool_calls") or []:
                                    idx = tc["index"]
                                    if idx not in tool_calls_acc:
                                        tool_calls_acc[idx] = {"id": "", "name": "", "arguments": ""}
                                    if tc.get("id"):
                                        tool_calls_acc[idx]["id"] = tc["id"]
                                    fn = tc.get("function", {})
                                    if fn.get("name"):
                                        tool_calls_acc[idx]["name"] = fn["name"]
                                    if fn.get("arguments"):
                                        tool_calls_acc[idx]["arguments"] += fn["arguments"]

                            except (json.JSONDecodeError, KeyError, IndexError):
                                continue

                except httpx.HTTPError as e:
                    yield AgentEvent.error(f"Connection error: {e}")
                    return

                # ── Handle tool calls or finish ────────────────────
                # Some providers report finish_reason "stop" even when tool
                # calls were streamed — trust the accumulated calls, not the
                # flag (gating on finish_reason == "tool_calls" silently
                # dropped whole turns).
                if tool_calls_acc and not is_final:
                    # Build assistant message with tool calls
                    assistant_msg = Message.assistant_with_tools(
                        content_buffer,
                        [
                            {
                                "id": tc["id"],
                                "function": {
                                    "name": tc["name"],
                                    "arguments": tc["arguments"],
                                },
                            }
                            for tc in tool_calls_acc.values()
                        ],
                    )
                    session.add(assistant_msg)

                    # Execute each tool
                    for tc in tool_calls_acc.values():
                        tool_name = tc["name"]
                        tool_id = tc["id"]

                        try:
                            args = json.loads(tc["arguments"])
                        except json.JSONDecodeError:
                            args = {}

                        yield AgentEvent.tool_call(tool_id, tool_name, tc["arguments"])

                        # Pre-tool hook (can deny execution)
                        if self.hook_runner:
                            pre_result = await self.hook_runner.run_p<RESEND_API_KEY>(tool_name, args)
                            for msg in p<RESEND_API_KEY>:
                                yield AgentEvent.status(f"Hook: {msg}")
                            if p<RESEND_API_KEY>:
                                result = json.dumps({
                                    "status": "error",
                                    "message": p<RESEND_API_KEY>[0] if p<RESEND_API_KEY> else f"Tool '{tool_name}' denied by hook",
                                })
                                yield AgentEvent.tool_result(tool_id, result)
                                session.add(Message.tool_result(tool_id, tool_name, result, True))
                                continue

                        # Execute with permission check
                        result = await self.registry.execute(
                            tool_name,
                            args,
                            user,
                            db,
                            permission=user_permission,
                        )

                        # Post-tool hook (can mark errors)
                        if self.hook_runner:
                            is_error_for_hook = False
                            try:
                                is_error_for_hook = json.loads(result).get("status") == "error"
                            except (json.JSONDecodeError, TypeError):
                                pass
                            post_result = await self.hook_runner.run_post_tool_use(
                                tool_name, args, result, is_error_for_hook
                            )
                            for msg in post_result.messages:
                                yield AgentEvent.status(f"Hook: {msg}")
                            if post_result.denied:
                                is_error_for_hook = True

                        yield AgentEvent.tool_result(tool_id, result)

                        # Add tool result to session
                        is_error = False
                        try:
                            parsed = json.loads(result)
                            is_error = parsed.get("status") == "error"
                        except (json.JSONDecodeError, TypeError):
                            pass

                        session.add(Message.tool_result(tool_id, tool_name, result, is_error))

                    # Continue to next round
                    continue
                else:
                    # No tool calls — add final assistant message and finish
                    if content_buffer:
                        session.add(Message.assistant(content_buffer))
                        replied = True
                        break
                    # Empty reply (reasoning ate the output, or a bare stop):
                    # retry exactly once, tools off, with an explicit nudge.
                    if not nudged:
                        nudged = True
                        force_text = True
                        yield AgentEvent.status("Wrapping up…")
                        continue
                    break

        if not replied:
            fallback = ("I finished the work above but had trouble composing a reply — "
                        "ask me to summarize, or rephrase your message.")
            session.add(Message.assistant(fallback))
            yield AgentEvent.content(fallback)

        # Capture session for persistence
        self._last_session = session

        yield AgentEvent.done()

    # ── Helpers ───────────────────────────────────────────────────

    def _build_session(
        self,
        messages: list[dict[str, Any]],
        attachments: Optional[list[dict]] = None,
    ) -> Session:
        """Convert OpenAI-format messages to Session with ContentBlocks."""
        session = Session()

        for i, msg in enumerate(messages):
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "tool":
                # Tool result message
                tool_call_id = msg.get("tool_call_id", "")
                session.add(Message(
                    role="tool",
                    content=[ContentBlock.tool_result(
                        tool_id=tool_call_id,
                        name="",
                        output=str(content),
                    )],
                ))
            elif role == "assistant" and msg.get("tool_calls"):
                # Assistant message with tool calls
                session.add(Message.assistant_with_tools(
                    self._extract_text(content),
                    msg["tool_calls"],
                ))
            else:
                # Regular text message
                text = self._extract_text(content)
                if role == "user":
                    session.add(Message.user(text))
                elif role == "assistant":
                    session.add(Message.assistant(text))
                else:
                    session.add(Message(role, [ContentBlock.text(text)]))

        return session

    @staticmethod
    def _extract_text(content: Any) -> str:
        """Extract plain text from content (handles both string and list formats)."""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts.append(part.get("text", ""))
                elif isinstance(part, str):
                    parts.append(part)
            return " ".join(parts)
        return ""

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://seedify-six.vercel.app",
            "X-Title": "Seedify",
        }
