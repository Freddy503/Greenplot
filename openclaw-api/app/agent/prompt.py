"""
System Prompt Builder — Composable system prompt construction.

Uses a builder pattern to assemble system prompts from ordered sections.
Each section is clearly labeled with markdown headers for the LLM.

Usage:
    builder = SystemPromptBuilder()
    builder.with_user_profile(name="Freddy", timezone="UTC", preferences={})
    builder.with_garden_stats(seed_count=42, recent_seeds=["AI idea"], domains=["tech"])
    builder.with_instruction_file("/path/to/SEEDIFY.md")
    prompt = builder.render()
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Section:
    """A named section in the system prompt."""
    title: str
    content: str
    order: int = 0


# Default identity section for Seedify
_IDENTITY_CONTENT = (
    "You are Greenplot, an AI-powered Idea Garden assistant. "
    "You help users capture, organize, and grow their ideas — "
    "turning fleeting thoughts into structured knowledge. "
    "You can search seeds, create new ones, find connections, "
    "search the web for current information, and help users think through complex problems.\n\n"
    "Be concise, thoughtful, and proactive. Suggest connections "
    "when relevant. Treat every idea as a seed with potential to grow."
)

# Tool selection rules
_TOOL_SELECTION_CONTENT = (
    "## Tool Selection Rules (STRICT — Brain-First)\n\n"

    "BRAIN-FIRST PRINCIPLE: The user's Second Brain (seeds + wiki) is always consulted before "
    "the open web. Their accumulated knowledge is more relevant than generic search results. "
    "Never go external without first going internal.\n\n"

    "MANDATORY EXECUTION ORDER for any topical question:\n"
    "  1. **search_seeds** — the user's Garden: personal notes, captured ideas, raw thinking\n"
    "  2. **search_wiki** — synthesized wiki articles (highest-quality, encyclopedic context)\n"
    "  3. **web_search** — use when: (a) internal results are fewer than 2 strong hits, "
    "(b) the question involves current events, recent news, live data, or recent research, "
    "or (c) the user explicitly asks for web/news/current information\n"
    "  4. Synthesize ALL results into one coherent answer — cite internal sources first\n\n"

    "DECISION RULE: After steps 1+2, if you have 2+ strong internal results AND the topic "
    "is not time-sensitive → answer without web. Otherwise proceed to web_search. "
    "Err on the side of calling web_search — fresh information improves answers.\n\n"

    "EXPLICIT USER COMMANDS:\n"
    "  • 'search my garden' / 'search seeds' → call search_seeds only\n"
    "  • 'search the web' / 'web search' / 'latest news' → call web_search (may skip internal first)\n"
    "  • 'what do I know about X' → internal only (search_seeds + search_wiki)\n"
    "  • 'combine' / 'find everything' → all three tools\n\n"

    "NEVER answer a topical question without first calling search_seeds and search_wiki. "
    "Skipping internal search means the user gets answers that ignore their own accumulated knowledge.\n\n"

    "EXCEPTIONS (no tools required): greetings, casual chat, meta-questions about the system.\n\n"

    "AFTER ANSWERING: if the user expressed a new idea or insight, call **create_seed** to capture it."
)

# Capabilities section describing available tools
_CAPABILITIES_CONTENT = (
    "You have access to the following capabilities:\n\n"
    "- **search_seeds**: Search the user's Idea Garden by natural language query\n"
    "- **web_search**: Search the web for current, real-time information\n"
    "- **create_seed**: Plant a new idea from user thoughts\n"
    "- **list_seeds**: Browse recent or categorized ideas\n"
    "- **rate_seed**: Score seeds for relevance and quality\n"
    "- **find_connections**: Discover related seeds and concepts\n"
    "- **enrich_seed**: Expand a seed with web research and synthesis"
)


class SystemPromptBuilder:
    """
    Composable system prompt builder with ordered sections.

    Inspired by claw-code's SystemPromptBuilder pattern:
    - Builder pattern for fluent API
    - Sections rendered in a fixed order (Identity → Profile → Stats → Capabilities → Instructions → Custom)
    - Each section has a markdown header

    Usage:
        builder = SystemPromptBuilder()
        builder.with_user_profile("Freddy", "UTC", {"theme": "dark"})
        builder.with_garden_stats(42, ["AI idea"], ["tech", "science"])
        prompt = builder.render()  # → full system prompt string
    """

    def __init__(self) -> None:
        self._sections: list[Section] = []
        self._custom_order: int = 100  # Custom sections start after built-in ones

    # ── Builder Methods ───────────────────────────────────────────

    def with_user_profile(
        self,
        name: Optional[str] = None,
        timezone: Optional[str] = None,
        preferences: Optional[dict[str, Any]] = None,
    ) -> SystemPromptBuilder:
        """
        Add a User Profile section.

        Args:
            name: User's display name.
            timezone: User's timezone (e.g., "America/New_York").
            preferences: Dict of user preferences.

        Returns:
            self for chaining.
        """
        parts = []
        if name:
            parts.append(f"- **Name**: {name}")
        if timezone:
            parts.append(f"- **Timezone**: {timezone}")
        if preferences:
            for key, value in preferences.items():
                parts.append(f"- **{key}**: {value}")

        if parts:
            content = "\n".join(parts)
        else:
            content = "- No profile configured"

        self._sections.append(Section(
            title="User Profile",
            content=content,
            order=2,
        ))
        return self

    def with_garden_stats(
        self,
        seed_count: int = 0,
        recent_seeds: Optional[list[str]] = None,
        domains: Optional[list[str]] = None,
    ) -> SystemPromptBuilder:
        """
        Add a Garden Stats section with current statistics.

        Args:
            seed_count: Total number of seeds in the garden.
            recent_seeds: List of recent seed titles.
            domains: List of top domain names.

        Returns:
            self for chaining.
        """
        parts = [f"- **Total Seeds**: {seed_count}"]

        if recent_seeds:
            recent_str = ", ".join(f'"{s}"' for s in recent_seeds[:5])
            parts.append(f"- **Recent Seeds**: {recent_str}")

        if domains:
            domains_str = ", ".join(domains[:10])
            parts.append(f"- **Top Domains**: {domains_str}")

        self._sections.append(Section(
            title="Garden Stats",
            content="\n".join(parts),
            order=3,
        ))
        return self

    def with_context(self, context_text: str) -> SystemPromptBuilder:
        """
        Inject arbitrary context into the prompt.

        Args:
            context_text: Free-form context string.

        Returns:
            self for chaining.
        """
        self._sections.append(Section(
            title="Context",
            content=context_text,
            order=4,
        ))
        return self

    def with_instruction_file(self, path: str) -> SystemPromptBuilder:
        """
        Load instructions from a SEEDIFY.md-style file.

        Args:
            path: Path to the instruction file.

        Returns:
            self for chaining.
        """
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            self._sections.append(Section(
                title="Instructions",
                content=content,
                order=5,
            ))
        return self

    def append_section(self, title: str, content: str) -> SystemPromptBuilder:
        """
        Append a custom section (rendered after built-in sections).

        Args:
            title: Section title (rendered as markdown header).
            content: Section content.

        Returns:
            self for chaining.
        """
        self._sections.append(Section(
            title=title,
            content=content,
            order=self._custom_order,
        ))
        self._custom_order += 1
        return self

    # ── Output ────────────────────────────────────────────────────

    def build(self) -> list[Section]:
        """
        Build and return the ordered list of sections.

        Built-in sections are always included in a fixed order:
        1. Identity (always first)
        2. User Profile
        3. Garden Stats
        4. Capabilities (always present)
        5. Instructions
        6. Custom sections

        Returns:
            List of Section objects in render order.
        """
        # Identity is always first
        all_sections = [Section(title="Identity", content=_IDENTITY_CONTENT, order=1)]

        # Add user sections (sorted by order, then by insertion)
        all_sections.extend(sorted(self._sections, key=lambda s: s.order))

        # Capabilities always after profile/stats but before instructions
        cap_section = Section(title="Capabilities", content=_CAPABILITIES_CONTENT, order=4)
        tool_section = Section(title="Tool Selection", content=_TOOL_SELECTION_CONTENT, order=4)
        # Insert capabilities after profile/stats sections (order 2-3), before instructions (order 5)
        inserted = False
        for i, sec in enumerate(all_sections):
            if sec.order > 4 and not inserted:
                all_sections.insert(i, tool_section)
                all_sections.insert(i, cap_section)
                inserted = True
                break
        if not inserted:
            all_sections.append(cap_section)
            all_sections.append(tool_section)

        return all_sections

    def render(self) -> str:
        """
        Render all sections into a single system prompt string.

        Each section is labeled with a markdown ## header.
        Sections are joined by double newlines.

        Returns:
            Complete system prompt string.
        """
        sections = self.build()
        parts = []
        for section in sections:
            parts.append(f"## {section.title}\n\n{section.content}")
        return "\n\n".join(parts)
