"""Add link_cache table as Postgres shadow store for Weaviate Links.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-05
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "link_cache",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("weaviate_id", sa.String(), nullable=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("summary", sa.String(), nullable=True),
        sa.Column("domain", sa.String(200), nullable=True),
        sa.Column("tags", sa.String(), nullable=True),
        sa.Column("favicon", sa.String(500), nullable=True),
        sa.Column("og_image", sa.String(500), nullable=True),
        sa.Column("starred", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_link_cache_tenant", "link_cache", ["tenant_id"])
    op.create_index("idx_link_cache_weaviate_id", "link_cache", ["weaviate_id"])
    op.create_index("idx_link_cache_url", "link_cache", ["tenant_id", "url"])


def downgrade() -> None:
    op.drop_table("link_cache")
