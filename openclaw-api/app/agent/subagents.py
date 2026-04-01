"""
Sub-Agent System

Directly inspired by claw-code's Agent tool + SubagentToolExecutor pattern:

Architecture:
    Parent Agent calls spawn_subagent()
        → Creates isolated session + restricted tool set
        → Runs in background (asyncio task)
        → Returns manifest immediately
        → Results persisted to storage

Typed Sub-Agents for Seedify:
    Explore:    Read-only deep-dive into knowledge clusters
    Synthesis:  Combine multiple ideas into new seeds
    Research:   Web research + ingestion into the garden
    Connection: Find cross-domain relationships between ideas

Key differences from claw-code:
    - asyncio tasks instead of OS threads (non-blocking I/O)
    - DB persistence instead of filesystem
    - Tenant isolation for multi-tenant SaaS
    - SSE event integration for real-time updates
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, AsyncGenerator, Optional, Callable, Awaitable

from app.agent.registry import ToolRegistry, ToolSpec
from app.agent.session import Session, Message
from app.agent.stream import AgentEvent, AgentEventType
from app.agent.permissions import PermissionLevel
from app.agent.agent import SeedifyAgent


# ── Sub-Agent Types ──────────────────────────────────────────────────────────


class SubagentType(str, Enum):
    """
    Typed sub-agents with per-type tool restrictions.

    Mirrors claw-code's subagent_type enum:
    - Explore: Read-only exploration (like claw-code's "Explore")
    - Synthesis: Combine ideas into new ones (Seedify-specific)
    - Research: Web research + ingestion (Seedify-specific)
    - Connection: Find relationships (Seedify-specific)
    """
    EXPLORE = "Explore"
    SYNTHESIS = "Synthesis"
    RESEARCH = "Research"
    CONNECTION = "Connection"


# Tools allowed for each sub-agent type
SUBAGENT_TOOL_WHITELIST: dict[SubagentType, set[str]] = {
    SubagentType.EXPLORE: {
        "search_seeds",
        "list_recent_seeds",
        "get_seed_detail",
        "search_seeds_filtered",
    },
    SubagentType.SYNTHESIS: {
        "search_seeds",
        "get_seed_detail",
        "create_seed",
        "search_seeds_filtered",
    },
    SubagentType.RESEARCH: {
        "search_seeds",
        "web_search",
        "create_seed",
        "search_seeds_filtered",
    },
    SubagentType.CONNECTION: {
        "search_seeds",
        "get_seed_detail",
        "search_seeds_filtered",
        "list_recent_seeds",
    },
}

# System prompt additions for each type
SUBAGENT_SYSTEM_PROMPTS: dict[SubagentType, str] = {
    SubagentType.EXPLORE: (
        "You are a background exploration agent. Your job is to deeply analyze "
        "and understand ideas in the user's Second Brain. Search broadly, read "
        "details carefully, and provide a thorough analysis. Be concise in your "
        "final response."
    ),
    SubagentType.SYNTHESIS: (
        "You are a background synthesis agent. Your job is to find related ideas "
        "and combine them into something new. Search for seeds that connect, then "
        "create a new seed that captures the synthesized insight. Focus on novel "
        "connections and emergent patterns."
    ),
    SubagentType.RESEARCH: (
        "You are a background research agent. Your job is to search the web for "
        "relevant information and create seeds from what you find. Be thorough "
        "but focused — quality over quantity. Cite your sources."
    ),
    SubagentType.CONNECTION: (
        "You are a background connection agent. Your job is to find unexpected "
        "relationships between ideas in the user's Second Brain. Search across "
        "domains and energy levels. Report the connections you find with "
        "confidence scores and supporting evidence."
    ),
}


# ── Sub-Agent Manifest ───────────────────────────────────────────────────────


@dataclass
class SubagentManifest:
    """
    Persistent record of a sub-agent's lifecycle.

    Mirrors claw-code's AgentOutput:
    - Tracks status from "running" to "completed" or "failed"
    - Contains result text and error messages
    - Serializable to JSON for storage
    """
    agent_id: str
    name: str
    description: str
    subagent_type: str
    model: Optional[str] = None
    status: str = "running"  # running | completed | failed
    result: Optional[str] = None
    error: Optional[str] = None
    created_at: str = field(default_factory=lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    tenant_id: str = ""
    user_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> SubagentManifest:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# ── Sub-Agent Executor ───────────────────────────────────────────────────────


class SubagentToolExecutor:
    """
    Restricted tool executor for sub-agents.

    Directly mirrors claw-code's SubagentToolExecutor:
    - Wraps a ToolRegistry
    - Checks allowed_tools set before dispatch
    - Returns error for disallowed tools
    """

    def __init__(self, registry: ToolRegistry, allowed_tools: set[str]) -> None:
        self._registry = registry
        self._allowed_tools = allowed_tools

    async def execute(
        self,
        name: str,
        args: dict[str, Any],
        user: Any,
        db: Any,
    ) -> str:
        """Execute a tool if it's in the allowed set."""
        if name not in self._allowed_tools:
            return json.dumps({
                "status": "error",
                "message": f"Tool '{name}' is not enabled for this sub-agent",
            })
        return await self._registry.execute(
            name, args, user, db,
            permission=PermissionLevel.WRITE,
        )


# ── Sub-Agent Runner ─────────────────────────────────────────────────────────


class SubagentRunner:
    """
    Spawns and manages sub-agent tasks.

    Inspired by claw-code's spawn_agent_job + run_agent_job pattern:
    - Creates isolated session
    - Runs agent loop with restricted tools
    - Persists results
    - Updates manifest status

    Usage:
        runner = SubagentRunner(registry)
        manifest = await runner.spawn(
            description="Find all AI-related ideas",
            prompt="Search seeds for AI, ML, and deep learning...",
            subagent_type=SubagentType.EXPLORE,
            user=current_user,
            db=db,
        )
        # → Returns immediately with status="running"
        # → Runs in background
    """

    def __init__(
        self,
        registry: ToolRegistry,
        *,
        api_key: str = "",
        model: str = "",
        base_url: str = "https://openrouter.ai/api/v1/chat/completions",
        system_prompt: str = "",
        max_iterations: int = 8,
    ) -> None:
        self.registry = registry
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.system_prompt = system_prompt
        self.max_iterations = max_iterations

        # In-memory manifest store (replace with DB in production)
        self._manifests: dict[str, SubagentManifest] = {}

    async def spawn(
        self,
        *,
        description: str,
        prompt: str,
        subagent_type: SubagentType = SubagentType.EXPLORE,
        name: str = "",
        model: Optional[str] = None,
        user: Any = None,
        db: Any = None,
    ) -> SubagentManifest:
        """
        Spawn a sub-agent. Returns immediately with manifest.

        The sub-agent runs in the background as an asyncio task.
        """
        import asyncio

        # Validate
        if not description.strip():
            raise ValueError("description must not be empty")
        if not prompt.strip():
            raise ValueError("prompt must not be empty")

        # Generate manifest
        agent_id = uuid.uuid4().hex[:12]
        agent_name = name or description[:50].replace(" ", "-").lower()

        manifest = SubagentManifest(
            agent_id=agent_id,
            name=agent_name,
            description=description,
            subagent_type=subagent_type.value,
            model=model,
            tenant_id=str(getattr(user, "tenant_id", "")) if user else "",
            user_id=str(getattr(user, "id", "")) if user else "",
        )

        self._manifests[agent_id] = manifest

        # Spawn background task
        asyncio.create_task(self._run_agent(
            manifest=manifest,
            prompt=prompt,
            subagent_type=subagent_type,
            user=user,
            db=db,
        ))

        return manifest

    async def get_manifest(self, agent_id: str) -> Optional[SubagentManifest]:
        """Get the current manifest for an agent."""
        return self._manifests.get(agent_id)

    async def run_interactive(
        self,
        *,
        description: str,
        prompt: str,
        subagent_type: SubagentType = SubagentType.EXPLORE,
        model: Optional[str] = None,
        user: Any = None,
        db: Any = None,
    ) -> AsyncGenerator[AgentEvent, None]:
        """
        Run a sub-agent interactively, yielding events.

        Unlike spawn(), this blocks until completion and streams events.
        Useful for synchronous sub-agent calls from the main agent loop.
        """
        if not description.strip():
            raise ValueError("description must not be empty")
        if not prompt.strip():
            raise ValueError("prompt must not be empty")

        # Build restricted registry
        allowed = SUBAGENT_TOOL_WHITELIST.get(subagent_type, set())
        restricted = self._build_restricted_registry(allowed)

        # Build type-specific system prompt
        type_prompt = SUBAGENT_SYSTEM_PROMPTS.get(subagent_type, "")
        full_system = f"{self.system_prompt}\n\n{type_prompt}" if type_prompt else self.system_prompt

        # Create isolated agent
        agent = SeedifyAgent(
            registry=restricted,
            api_key=self.api_key,
            model=model or self.model,
            api_base=self.base_url,
            max_rounds=self.max_iterations,
            system_prompt=full_system,
        )

        yield AgentEvent.status(f"Starting {subagent_type.value} agent: {description}")

        # Run with the prompt as a single user message
        messages = [{"role": "user", "content": prompt}]
        async for event in agent.run(messages, user, db):
            yield event

    # ── Internals ─────────────────────────────────────────────────

    async def _run_agent(
        self,
        *,
        manifest: SubagentManifest,
        prompt: str,
        subagent_type: SubagentType,
        user: Any,
        db: Any,
    ) -> None:
        """
        Background task: run the sub-agent to completion.

        Mirrors claw-code's run_agent_job:
        - Builds isolated runtime
        - Runs turn loop
        - Persists result
        - Updates manifest
        """
        manifest.started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        try:
            # Collect all events
            result_text = ""
            async for event in self.run_interactive(
                description=manifest.description,
                prompt=prompt,
                subagent_type=subagent_type,
                model=manifest.model,
                user=user,
                db=db,
            ):
                if event.type == AgentEventType.CONTENT:
                    result_text += event.data.get("text", "")

            manifest.result = result_text
            manifest.status = "completed"

        except Exception as e:
            manifest.error = str(e)
            manifest.status = "failed"

        manifest.completed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    def _build_restricted_registry(self, allowed_tools: set[str]) -> ToolRegistry:
        """Build a ToolRegistry with only the allowed tools."""
        restricted = ToolRegistry()
        for name in allowed_tools:
            spec = self.registry.get(name)
            if spec:
                restricted.replace(spec)
        return restricted


# ── Factory ───────────────────────────────────────────────────────────────────


def create_subagent_tool_spec(runner: SubagentRunner) -> ToolSpec:
    """
    Create a ToolSpec for the Agent tool.

    This registers the sub-agent spawner as a tool the main agent can use.
    """
    async def agent_handler(args: dict[str, Any], user: Any, db: Any) -> str:
        description = args.get("description", "")
        prompt = args.get("prompt", "")
        type_str = args.get("subagent_type", "Explore")
        name = args.get("name", "")
        model = args.get("model")

        try:
            subagent_type = SubagentType(type_str)
        except ValueError:
            subagent_type = SubagentType.EXPLORE

        manifest = await runner.spawn(
            description=description,
            prompt=prompt,
            subagent_type=subagent_type,
            name=name,
            model=model,
            user=user,
            db=db,
        )

        return json.dumps({
            "status": "ok",
            "agent_id": manifest.agent_id,
            "name": manifest.name,
            "subagent_type": manifest.subagent_type,
            "status": manifest.status,
            "message": f"Sub-agent '{manifest.name}' spawned (type: {manifest.subagent_type})",
        })

    return ToolSpec(
        name="spawn_subagent",
        description=(
            "Launch a specialized sub-agent to work on a task in the background. "
            "Types: Explore (read-only analysis), Synthesis (combine ideas), "
            "Research (web research), Connection (find relationships)."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "High-level description of the task.",
                },
                "prompt": {
                    "type": "string",
                    "description": "Detailed prompt for the sub-agent.",
                },
                "subagent_type": {
                    "type": "string",
                    "description": "Type of sub-agent.",
                    "enum": [t.value for t in SubagentType],
                    "default": "Explore",
                },
                "name": {
                    "type": "string",
                    "description": "Optional name for the agent.",
                },
                "model": {
                    "type": "string",
                    "description": "Optional model override.",
                },
            },
            "required": ["description", "prompt"],
        },
        permission=PermissionLevel.WRITE,
        handler=agent_handler,
    )
