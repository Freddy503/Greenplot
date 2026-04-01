"""
Simplified Permission Model

Inspired by claw-code's 5-tier permission system, adapted for Seedify's
multi-tenant SaaS model. Three tiers instead of five:

    READ < WRITE < ADMIN

- READ:   Search, browse, view seeds (default for anonymous)
- WRITE:  Create, modify, rate seeds (requires login)
- ADMIN:  Manage collections, delete, system config (requires admin flag)

Design decisions:
- Integer-based levels for easy comparison (<, >, >=)
- Per-tenant isolation is handled at the data layer, not here
- No "Prompt" tier — Seedify is a server, not a CLI
- Permission check is a pure function, no side effects
"""
from __future__ import annotations

from enum import IntEnum
from typing import Any


class PermissionLevel(IntEnum):
    """
    Permission tiers, ordered by privilege.

    IntEnum enables direct comparison: PermissionLevel.READ < PermissionLevel.WRITE
    """
    READ = 0      # Browse, search, view
    WRITE = 1     # Create, modify, rate
    ADMIN = 2     # Delete, manage, system config


def check_permission(
    *,
    user_level: PermissionLevel,
    required_level: PermissionLevel,
    tool_name: str = "",
) -> tuple[bool, str]:
    """
    Check if a user has sufficient permission.

    Returns:
        (allowed: bool, reason: str)
        reason is empty string if allowed, otherwise a human-readable denial.

    Usage:
        allowed, reason = check_permission(
            user_level=PermissionLevel.READ,
            required_level=PermissionLevel.WRITE,
            tool_name="create_seed",
        )
        # → (False, "Permission denied: 'create_seed' requires WRITE, have READ")
    """
    if user_level >= required_level:
        return True, ""

    tool_part = f"'{tool_name}' " if tool_name else ""
    return False, (
        f"Permission denied: {tool_part}requires {required_level.name}, "
        f"have {user_level.name}"
    )


def get_user_permission(user: Any) -> PermissionLevel:
    """
    Determine a user's permission level from a User model.

    Falls back to READ for anonymous/None users.
    """
    if user is None:
        return PermissionLevel.READ

    if getattr(user, "is_admin", False):
        return PermissionLevel.ADMIN

    if getattr(user, "id", None) is not None:
        return PermissionLevel.WRITE

    return PermissionLevel.READ
