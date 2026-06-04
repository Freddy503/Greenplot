"""Initial schema — full table set as of June 2026.

On an existing database: run `alembic stamp head` (tables already exist).
On a fresh database: run `alembic upgrade head` (creates everything).

Revision ID: 0001
Revises:
Create Date: 2026-06-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("city", sa.String(), nullable=True),
        sa.Column("nickname", sa.String(100), nullable=True),
        sa.Column("interests", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("digest_frequency", sa.String(), nullable=True, server_default="once-daily"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("stripe_customer_id", sa.String(), nullable=True),
        sa.Column("subscription_status", sa.String(), nullable=True, server_default="inactive"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "thoughts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_thoughts_tenant_id", "thoughts", ["tenant_id"])

    op.create_table(
        "seeds",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("thought_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("thoughts.id"), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("embedding_ref", sa.String(), nullable=True),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("seed_metadata", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("last_visited", sa.DateTime(), nullable=True),
        sa.Column("visit_count", sa.Integer(), server_default="0"),
        sa.Column("created_by", sa.String(50), nullable=True, server_default="human"),
        sa.Column("created_via", sa.String(100), nullable=True),
        sa.Column("provenance_log", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("last_interacted_at", sa.DateTime(), nullable=True),
        sa.Column("interaction_count", sa.Integer(), server_default="0"),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("archived", sa.Boolean(), server_default="false"),
    )
    op.create_index("ix_seeds_tenant_id", "seeds", ["tenant_id"])
    op.create_index("idx_seed_tenant_created", "seeds", ["tenant_id", "created_at"])

    op.create_table(
        "seed_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("source_seed_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("seeds.id"), nullable=False),
        sa.Column("target_seed_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("seeds.id"), nullable=False),
        sa.Column("link_type", sa.String(32), nullable=False, server_default="similar"),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("source_seed_id", "target_seed_id", "link_type", name="uq_link_source_target_type"),
    )
    op.create_index("idx_link_source", "seed_links", ["source_seed_id"])
    op.create_index("idx_link_target", "seed_links", ["target_seed_id"])

    op.create_table(
        "entities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("mention_count", sa.Integer(), server_default="1"),
        sa.Column("first_seen", sa.DateTime(), nullable=True),
        sa.Column("last_seen", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("tenant_id", "name", "entity_type", name="uq_entity_tenant_name_type"),
    )
    op.create_index("ix_entities_tenant_id", "entities", ["tenant_id"])
    op.create_index("idx_entity_tenant_type", "entities", ["tenant_id", "entity_type"])

    op.create_table(
        "seed_entities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("seed_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("seeds.id"), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.UniqueConstraint("seed_id", "entity_id", name="uq_seed_entity"),
    )

    op.create_table(
        "sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("url", sa.String(500), nullable=True),
        sa.Column("content", sa.String(), nullable=True),
        sa.Column("domain", sa.String(100), nullable=True),
        sa.Column("author", sa.String(200), nullable=True),
        sa.Column("published_date", sa.DateTime(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(), nullable=True),
        sa.Column("credibility_score", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(50), nullable=True, server_default="human"),
        sa.Column("created_via", sa.String(100), nullable=True),
        sa.Column("provenance_log", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("last_interacted_at", sa.DateTime(), nullable=True),
        sa.Column("interaction_count", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("tenant_id", "name", "source_type", name="uq_source_tenant_name_type"),
    )
    op.create_index("ix_sources_tenant_id", "sources", ["tenant_id"])
    op.create_index("idx_source_tenant_type", "sources", ["tenant_id", "source_type"])

    op.create_table(
        "ratings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("message_id", sa.String(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("consent", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("tenant_id", "message_id", name="uq_rating_tenant_message"),
    )
    op.create_index("ix_ratings_tenant_id", "ratings", ["tenant_id"])
    op.create_index("ix_ratings_message_id", "ratings", ["message_id"])
    op.create_index("idx_rating_tenant_created", "ratings", ["tenant_id", "created_at"])

    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("messages", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("compaction_summary", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_chat_session_tenant_user", "chat_sessions", ["tenant_id", "user_id"])
    op.create_index("idx_chat_session_updated", "chat_sessions", ["tenant_id", "updated_at"])

    op.create_table(
        "usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("llm_tokens", sa.Integer(), server_default="0"),
        sa.Column("embedding_tokens", sa.Integer(), server_default="0"),
        sa.Column("images_generated", sa.Integer(), server_default="0"),
        sa.Column("vector_operations", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("tenant_id", "date", name="uq_tenant_date"),
    )
    op.create_index("ix_usage_tenant_id", "usage", ["tenant_id"])
    op.create_index("idx_usage_tenant_date", "usage", ["tenant_id", "date"])

    op.create_table(
        "wiki_articles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("summary", sa.String(), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("author", sa.String(200), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("created_by", sa.String(50), nullable=True, server_default="human"),
        sa.Column("created_via", sa.String(100), nullable=True),
        sa.Column("provenance_log", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("last_interacted_at", sa.DateTime(), nullable=True),
        sa.Column("interaction_count", sa.Integer(), server_default="0"),
        sa.UniqueConstraint("tenant_id", "title", name="uq_wiki_tenant_title"),
    )
    op.create_index("ix_wiki_articles_tenant_id", "wiki_articles", ["tenant_id"])
    op.create_index("idx_wiki_tenant_category", "wiki_articles", ["tenant_id", "category"])

    op.create_table(
        "calendar_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(32), server_default="google"),
        sa.Column("access_token", sa.String(), nullable=True),
        sa.Column("refresh_token", sa.String(), nullable=True),
        sa.Column("token_expiry", sa.DateTime(), nullable=True),
        sa.Column("calendar_timezone", sa.String(64), nullable=True),
        sa.Column("enabled", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_calendar_tenant", "calendar_connections", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("calendar_connections")
    op.drop_table("wiki_articles")
    op.drop_table("usage")
    op.drop_table("chat_sessions")
    op.drop_table("ratings")
    op.drop_table("sources")
    op.drop_table("seed_entities")
    op.drop_table("entities")
    op.drop_table("seed_links")
    op.drop_table("seeds")
    op.drop_table("thoughts")
    op.drop_table("users")
