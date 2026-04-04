import os
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, JSON, Boolean, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, declarative_base
import uuid

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    tenant_id = Column(UUID(as_uuid=True), unique=True, nullable=False, default=uuid.uuid4)
    city = Column(String, nullable=True)  # from onboarding — used for weather in daily briefing
    digest_frequency = Column(String, nullable=True, default='once-daily')  # twice-daily, once-daily, bi-weekly, weekly, calendar
    created_at = Column(DateTime, default=datetime.utcnow)
    stripe_customer_id = Column(String, nullable=True)
    subscription_status = Column(String, nullable=True, default='inactive')  # active, trialing, inactive

    thoughts = relationship("Thought", back_populates="user", cascade="all, delete-orphan")
    seeds = relationship("Seed", back_populates="user", cascade="all, delete-orphan")
    usage = relationship("Usage", back_populates="user", cascade="all, delete-orphan")

class Thought(Base):
    __tablename__ = 'thoughts'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    content = Column(String, nullable=False)
    source = Column(String, nullable=True)  # e.g., 'voice', 'manual'
    status = Column(String, nullable=False, default='pending')  # pending, processing, processed, error
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="thoughts")
    seeds = relationship("Seed", back_populates="thought", cascade="all, delete-orphan")

class Seed(Base):
    __tablename__ = 'seeds'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    thought_id = Column(UUID(as_uuid=True), ForeignKey('thoughts.id'), nullable=True)
    title = Column(String, nullable=False)
    content = Column(String, nullable=False)
    embedding_ref = Column(String, nullable=True)  # Weaviate object ID
    image_url = Column(String, nullable=True)
    seed_metadata = Column(JSON, nullable=True)  # renamed from metadata to avoid SQLAlchemy conflict
    created_at = Column(DateTime, default=datetime.utcnow)
    last_visited = Column(DateTime, nullable=True)  # when user last viewed this seed
    visit_count = Column(Integer, default=0)  # how many times user viewed this seed

    user = relationship("User", back_populates="seeds")
    thought = relationship("Thought", back_populates="seeds")
    source_links = relationship("SeedLink", foreign_keys="SeedLink.source_seed_id", back_populates="source_seed")
    target_links = relationship("SeedLink", foreign_keys="SeedLink.target_seed_id", back_populates="target_seed")

    __table_args__ = (
        Index('idx_seed_tenant_created', tenant_id, created_at.desc()),
    )


class SeedLink(Base):
    """Backlinks between related seeds — auto-created by the enrichment pipeline."""
    __tablename__ = 'seed_links'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_seed_id = Column(UUID(as_uuid=True), ForeignKey('seeds.id'), nullable=False)
    target_seed_id = Column(UUID(as_uuid=True), ForeignKey('seeds.id'), nullable=False)
    link_type = Column(String(32), nullable=False, default='similar')  # similar, builds_on, contradicts, related, part_of
    confidence = Column(Integer, nullable=True)  # store as int (0-1000 for 0.000-1.000 precision)
    created_at = Column(DateTime, default=datetime.utcnow)

    source_seed = relationship("Seed", foreign_keys=[source_seed_id], back_populates="source_links")
    target_seed = relationship("Seed", foreign_keys=[target_seed_id], back_populates="target_links")

    __table_args__ = (
        UniqueConstraint('source_seed_id', 'target_seed_id', 'link_type', name='uq_link_source_target_type'),
        Index('idx_link_source', source_seed_id),
        Index('idx_link_target', target_seed_id),
    )


class Entity(Base):
    """Extracted entities — people, projects, concepts, tools, etc."""
    __tablename__ = 'entities'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    entity_type = Column(String(50), nullable=False)  # person, project, concept, tool, org, source
    mention_count = Column(Integer, default=1)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('tenant_id', 'name', 'entity_type', name='uq_entity_tenant_name_type'),
        Index('idx_entity_tenant_type', tenant_id, entity_type),
    )


class SeedEntity(Base):
    """Many-to-many join between seeds and entities."""
    __tablename__ = 'seed_entities'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seed_id = Column(UUID(as_uuid=True), ForeignKey('seeds.id'), nullable=False)
    entity_id = Column(UUID(as_uuid=True), ForeignKey('entities.id'), nullable=False)
    confidence = Column(Integer, nullable=True)  # 0-1000

    __table_args__ = (
        UniqueConstraint('seed_id', 'entity_id', name='uq_seed_entity'),
    )

class Rating(Base):
    __tablename__ = 'ratings'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    message_id = Column(String, nullable=False, index=True)  # client-side message UUID
    score = Column(Integer, nullable=False)  # 1-5
    consent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('tenant_id', 'message_id', name='uq_rating_tenant_message'),
        Index('idx_rating_tenant_created', tenant_id, created_at.desc()),
    )


class ChatSession(Base):
    """Persistent chat session storage for the Seedify agent."""
    __tablename__ = 'chat_sessions'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    title = Column(String(500), nullable=True)
    messages = Column(JSON, nullable=False, default=list)  # full ContentBlock JSON
    compaction_summary = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_chat_session_tenant_user', tenant_id, user_id),
        Index('idx_chat_session_updated', tenant_id, updated_at.desc()),
    )


class Usage(Base):
    __tablename__ = 'usage'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    date = Column(DateTime, default=datetime.utcnow, nullable=False)  # we'll store date part only
    llm_tokens = Column(Integer, default=0)
    embedding_tokens = Column(Integer, default=0)
    images_generated = Column(Integer, default=0)
    vector_operations = Column(Integer, default=0)
    # optional: last_updated to allow upserts

    user = relationship("User", back_populates="usage")

    __table_args__ = (
        UniqueConstraint('tenant_id', 'date', name='uq_tenant_date'),
        Index('idx_usage_tenant_date', tenant_id, date),
    )

class CalendarConnection(Base):
    """Google Calendar OAuth tokens per user."""
    __tablename__ = 'calendar_connections'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), unique=True, nullable=False)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    provider = Column(String(32), default='google')
    access_token = Column(String, nullable=True)  # short-lived
    refresh_token = Column(String, nullable=True)  # long-lived
    token_expiry = Column(DateTime, nullable=True)
    calendar_timezone = Column(String(64), nullable=True)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
