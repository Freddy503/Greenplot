"""Add seed_type column to seeds table.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "seeds",
        sa.Column("seed_type", sa.String(32), nullable=True, server_default="idea"),
    )
    op.create_index("idx_seed_type", "seeds", ["tenant_id", "seed_type"])


def downgrade() -> None:
    op.drop_index("idx_seed_type", table_name="seeds")
    op.drop_column("seeds", "seed_type")
