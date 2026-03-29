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

    user = relationship("User", back_populates="seeds")
    thought = relationship("Thought", back_populates="seeds")

    __table_args__ = (
        Index('idx_seed_tenant_created', tenant_id, created_at.desc()),
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
