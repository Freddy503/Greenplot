"""Canvas sharing access control.

The SINGLE gate for cross-tenant access to a shared canvas (a product seed plus
the PRD seeds attached to it). Every shared-resource endpoint must resolve
access here. Nothing else in the app may bypass per-tenant isolation — this
module is the one sanctioned, audited exception. Keep it small and tested.
"""
import uuid
from typing import Optional, List

from sqlalchemy.orm import Session

from app.models import Seed, CanvasShare, User


def _as_uuid(value) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError):
        return None


def resolve_canvas_access(db: Session, user: User, product_id) -> Optional[str]:
    """Return the caller's role on a canvas, or None if they have no access.

    - 'owner'   — the product belongs to the caller's tenant.
    - 'editor' / 'viewer' — from an ACTIVE CanvasShare addressed to this user.
    - None      — no access (caller should get 403).
    """
    pid = _as_uuid(product_id)
    if pid is None:
        return None
    product = db.query(Seed).filter(Seed.id == pid, Seed.seed_type == "product").first()
    if not product:
        return None
    if product.tenant_id == user.tenant_id:
        return "owner"
    share = (
        db.query(CanvasShare)
        .filter(
            CanvasShare.product_id == pid,
            CanvasShare.collaborator_user_id == user.id,
            CanvasShare.status == "active",
        )
        .first()
    )
    return share.role if share else None


def canvas_prd_ids(db: Session, product_id) -> List[str]:
    """The allowlist: seed ids attached to a canvas (PRDs whose
    seed_metadata.product_id == this product). Collaborator reads must be scoped
    to this set by id — NEVER widened to the owner's whole tenant."""
    pid = _as_uuid(product_id)
    if pid is None:
        return []
    product = db.query(Seed).filter(Seed.id == pid, Seed.seed_type == "product").first()
    if not product:
        return []
    pid_str = str(pid)
    rows = db.query(Seed).filter(Seed.tenant_id == product.tenant_id).all()
    return [str(s.id) for s in rows if (s.seed_metadata or {}).get("product_id") == pid_str]


def can_read_seed_for_canvas(db: Session, user: User, seed: Seed, product_id) -> bool:
    """True if `user` may read `seed` as part of the shared canvas `product_id`:
    the seed must be the canvas product itself or one of its attached PRDs, and
    the user must hold any active role on that canvas."""
    if resolve_canvas_access(db, user, product_id) is None:
        return False
    if str(seed.id) == str(product_id):
        return True
    return str(seed.id) in canvas_prd_ids(db, product_id)
