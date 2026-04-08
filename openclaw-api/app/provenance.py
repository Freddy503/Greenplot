"""Provenance tracking helpers for Seed, Source, and WikiArticle models."""
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID


def _log_provenance(
    entity,
    actor: str,
    action: str,
    reason: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> None:
    """
    Append a provenance event to entity's provenance_log.
    
    Args:
        entity: Seed, Source, or WikiArticle model instance
        actor: Who performed the action (e.g., 'human', 'agent_research', 'cron_harvest')
        action: What was done (e.g., 'create', 'update', 'enrich', 'link')
        reason: Why it was done (e.g., 'legacy_import', 'web_search', 'user_input')
        metadata: Additional context about the action
    """
    if entity.provenance_log is None:
        entity.provenance_log = []
    
    event = {
        'ts': datetime.utcnow().isoformat(),
        'actor': actor,
        'action': action,
    }
    if reason:
        event['reason'] = reason
    if metadata:
        event['metadata'] = metadata
    
    entity.provenance_log.append(event)


def set_entity_provenance_on_create(
    entity,
    actor: str = 'human',
    via: Optional[str] = None
) -> None:
    """
    Set created_by and created_via when creating a new entity.
    Initializes provenance_log with the creation event.
    
    Args:
        entity: Seed, Source, or WikiArticle model instance
        actor: Who/what created the entity (default: 'human')
        via: How it was created (e.g., 'voice_to_seeds.py', 'web_search', 'mcp::cursor_agent')
    """
    entity.created_by = actor
    entity.created_via = via
    entity.provenance_log = [{
        'ts': datetime.utcnow().isoformat(),
        'actor': actor,
        'action': 'create',
        'reason': via or 'direct_creation'
    }]
    entity.interaction_count = 0
    entity.last_interacted_at = datetime.utcnow()


def update_entity_interaction(entity) -> None:
    """
    Update interaction tracking when an entity is accessed.
    Called when a user views or interacts with a seed, source, or wiki article.
    """
    entity.interaction_count = (entity.interaction_count or 0) + 1
    entity.last_interacted_at = datetime.utcnow()


def get_entity_provenance_summary(entity) -> Dict[str, Any]:
    """
    Get a summary of entity provenance for display purposes.
    
    Returns:
        Dict with created_by, created_via, last_interacted, interaction_count
    """
    return {
        'created_by': entity.created_by or 'unknown',
        'created_via': entity.created_via,
        'created_at': entity.created_at.isoformat() if entity.created_at else None,
        'last_interacted_at': entity.last_interacted_at.isoformat() if entity.last_interacted_at else None,
        'interaction_count': entity.interaction_count or 0,
        'provenance_events': len(entity.provenance_log) if entity.provenance_log else 0
    }


# Valid actor types for provenance tracking
VALID_ACTORS = [
    'human',           # Direct user input
    'agent_research',  # Research agent
    'agent_synthesis', # Synthesis agent  
    'cron_harvest',    # Scheduled harvesting job
    'voice_to_seed',   # Voice to seeds conversion
    'mcp_agent',       # MCP protocol agent
    'import',          # Data import
    'legacy',          # Legacy system data
]

# Valid creation_via examples
VALID_VIA_SOURCES = [
    'voice_to_seeds.py',
    'web_search',
    'mcp::cursor_agent',
    'mcp::claude_code',
    'api::direct',
    'import::csv',
    'import::json',
    'browser_extension',
    'quick_add',
    'email_processing',
]
