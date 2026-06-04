"""
ingest_log.py
Append-only chronological log of system events (ingests, searches, compiles, briefings).

Karpathy pattern: maintains a 'System Log' wiki article as a temporal database,
enabling queries like "what did I add last Tuesday?"
"""
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

_LOG_TITLE = "System Log"
_LOG_CATEGORY = "system"


def append_log_entry(tenant_id: str, action: str, source: str, summary: str, db=None) -> None:
    """
    Append a timestamped entry to the System Log wiki article.
    Creates the article on first call. Never raises — logging is non-critical.

    Args:
        tenant_id: user's tenant UUID string
        action: event type (e.g. "seed_ingested", "web_search", "wiki_compile", "briefing_sent")
        source: origin (e.g. URL, tool name, cron job id)
        summary: short human-readable description (≤200 chars)
    """
    try:
        from app.weaviate_client import weaviate_client

        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        new_line = f"- `{ts}` **{action}** | {source} | {summary[:200]}\n"

        # Load existing log article
        existing = weaviate_client.get_wiki_articles(tenant_id=tenant_id, limit=200)
        log_article = next((a for a in existing if a.get("title") == _LOG_TITLE), None)

        if log_article:
            current_content = log_article.get("content", "") or ""
            updated_content = current_content + new_line
            # Keep the log bounded at ~500 entries (≈ 50KB)
            lines = updated_content.splitlines(keepends=True)
            if len(lines) > 510:
                # Trim oldest entries, keep header and last 500
                header_end = next((i for i, l in enumerate(lines) if l.startswith("- `")), 0)
                lines = lines[:header_end] + lines[-500:]
                updated_content = "".join(lines)
            weaviate_client.update_wiki_article(
                article_id=log_article["id"],
                tenant_id=tenant_id,
                content=updated_content,
                summary=f"System log — last entry: {action}",
            )
        else:
            # Create the log article for the first time
            header = (
                f"# {_LOG_TITLE}\n\n"
                "Chronological record of all system events: seed ingests, web searches, "
                "wiki compiles, and briefings. Append-only — do not edit manually.\n\n"
            )
            weaviate_client.add_wiki_article(
                tenant_id=tenant_id,
                user_id="system",
                title=_LOG_TITLE,
                category=_LOG_CATEGORY,
                summary="System event log",
                content=header + new_line,
                source_seed_ids="",
                source_link_ids="",
                backlinks="",
                status="published",
            )
    except Exception as e:
        logger.debug(f"[ingest_log] Non-fatal log failure: {e}")
