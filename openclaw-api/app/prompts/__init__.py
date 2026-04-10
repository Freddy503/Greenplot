"""
Prompt loader — reads prompt markdown files at runtime.
Prompts live in openclaw-api/app/prompts/*.md and are loaded once on first use.
Editing a .md file takes effect on container restart (no redeploy needed).
"""
import os
from functools import lru_cache

_PROMPTS_DIR = os.path.dirname(__file__)


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    """
    Load a prompt by filename stem (without .md extension).
    Falls back to empty string if the file doesn't exist.

    Examples:
        load_prompt("wiki_synthesis")
        load_prompt("seed_enrichment")
        load_prompt("academic_digest")
    """
    path = os.path.join(_PROMPTS_DIR, f"{name}.md")
    if not os.path.isfile(path):
        import logging
        logging.getLogger(__name__).warning(f"Prompt file not found: {path}")
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()
