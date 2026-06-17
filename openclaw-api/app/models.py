import os
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Float, JSON, Boolean, ForeignKey, Index, UniqueConstraint, Text
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
    nickname = Column(String(100), nullable=True)  # display name from onboarding
    interests = Column(JSON, nullable=True, default=list)  # e.g. ["Medicine","Legal","AI"]
    digest_frequency = Column(String, nullable=True, default='once-daily')  # twice-daily, once-daily, bi-weekly, weekly, calendar
    consents = Column(JSON, nullable=True, default=dict)  # {enrich, web, calendar, push} from onboarding privacy step
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active_at = Column(DateTime, nullable=True)  # retention: stamped on any authed request (throttled)
    stripe_customer_id = Column(String, nullable=True)
    subscription_status = Column(String, nullable=True, default='inactive')  # active, trialing, inactive

    thoughts = relationship("Thought", back_populates="user", cascade="all, delete-orphan")
    seeds = relationship("Seed", back_populates="user", cascade="all, delete-orphan")
    usage = relationship("Usage", back_populates="user", cascade="all, delete-orphan")

class UserEvent(Base):
    """Lightweight product-analytics event log — EU-local, no third-party tool.
    Used to measure the activation funnel + retention for the early beta."""
    __tablename__ = 'user_events'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    event = Column(String(64), nullable=False, index=True)  # signup, chat, seed_created, digest_sent, paper_added, prd_created
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ApiKey(Base):
    """Per-user API keys for MCP / programmatic access (gp_live_...). Only the
    sha256 hash is stored; the key itself is shown once at mint time."""
    __tablename__ = 'api_keys'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    name = Column(String(100), nullable=False, default='MCP key')
    key_hash = Column(String(64), unique=True, nullable=False, index=True)  # sha256 hex
    prefix = Column(String(20), nullable=False, default='')  # display hint, e.g. gp_live_a1b2
    scopes = Column(JSON, nullable=True, default=list)  # reserved; ["mcp"] for now
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    revoked = Column(Boolean, default=False, nullable=False)

class WaitlistEntry(Base):
    """Landing-page waitlist signups — durable storage (the Vercel route's
    filesystem fallback was ephemeral and lost entries)."""
    __tablename__ = 'waitlist'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(320), unique=True, nullable=False, index=True)
    joined_at = Column(DateTime, default=datetime.utcnow)
    invited_at = Column(DateTime, nullable=True)
    source = Column(String(50), nullable=True, default='landing')

class CanvasShare(Base):
    """Grants a collaborator access to ONE canvas — a product seed plus the PRD
    seeds attached to it — across tenant boundaries. This is the only sanctioned
    exception to per-tenant isolation: every shared-resource read/write must go
    through resolve_canvas_access(), never a tenant fallback."""
    __tablename__ = 'canvas_shares'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), nullable=False, index=True)  # the shared canvas (a product seed)
    owner_tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    owner_user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    collaborator_email = Column(String(320), nullable=False, index=True)
    collaborator_user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True, index=True)
    role = Column(String(16), nullable=False, default='viewer')      # 'viewer' | 'editor'
    status = Column(String(16), nullable=False, default='pending')   # 'pending' | 'active' | 'revoked'
    invited_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint('product_id', 'collaborator_email', name='uq_canvas_collaborator'),
        Index('ix_canvas_share_collab', 'collaborator_user_id', 'status'),
    )

class Comment(Base):
    """A comment on a PRD seed, scoped to a shared canvas. Access is enforced via
    resolve_canvas_access — anyone with access to the canvas (owner or active
    collaborator) may read and post. Flat in v1; parent_id is reply-ready."""
    __tablename__ = 'comments'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seed_id = Column(UUID(as_uuid=True), nullable=False, index=True)     # the PRD
    product_id = Column(UUID(as_uuid=True), nullable=False, index=True)  # the canvas (access scope)
    author_user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    author_name = Column(String(120), nullable=True)
    body = Column(String(4000), nullable=False)
    parent_id = Column(UUID(as_uuid=True), nullable=True)
    resolved = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    edited_at = Column(DateTime, nullable=True)

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
    # Provenance tracking fields
    created_by = Column(String(50), nullable=True, default="human")  # ENUM: human, agent_research, agent_synthesis, cron_harvest, voice_to_seed
    created_via = Column(String(100), nullable=True)  # e.g., "voice_to_seeds.py", "web_search", "mcp::cursor_agent"
    provenance_log = Column(JSON, nullable=True)  # List of provenance events
    last_interacted_at = Column(DateTime, nullable=True)  # For decay scoring
    interaction_count = Column(Integer, default=0)  # How many times seed was accessed
    quality_score = Column(Float, nullable=True)  # 0.0–1.0 composite quality score set at enrichment
    archived = Column(Boolean, default=False)  # Archived seeds hidden from Garden/briefings but not deleted
    seed_type = Column(String(32), nullable=True, default="idea")  # idea, spec, learning, log, wiki

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
class Source(Base):
    """Information sources — URLs, documents, papers, etc."""
    __tablename__ = 'sources'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String(200), nullable=False)  # source name or title
    source_type = Column(String(50), nullable=False)  # url, document, paper, article, etc.
    url = Column(String(500), nullable=True)
    content = Column(String, nullable=True)  # extracted content or summary
    domain = Column(String(100), nullable=True)  # e.g., example.com, arxiv.org
    author = Column(String(200), nullable=True)
    published_date = Column(DateTime, nullable=True)
    retrieved_at = Column(DateTime, default=datetime.utcnow)
    credibility_score = Column(Integer, nullable=True)  # 0-1000
    # Provenance tracking fields
    created_by = Column(String(50), nullable=True, default="human")  # ENUM: human, agent_research, agent_synthesis, cron_harvest, voice_to_seed
    created_via = Column(String(100), nullable=True)  # e.g., "voice_to_seeds.py", "web_search", "mcp::cursor_agent"
    provenance_log = Column(JSON, nullable=True)  # List of provenance events
    last_interacted_at = Column(DateTime, nullable=True)  # For decay scoring
    interaction_count = Column(Integer, default=0)  # How many times source was accessed
    __table_args__ = (
        UniqueConstraint('tenant_id', 'name', 'source_type', name='uq_source_tenant_name_type'),
        Index('idx_source_tenant_type', tenant_id, source_type),
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
class WikiArticle(Base):
    """Knowledge base articles — synthesized information from multiple sources."""
    __tablename__ = 'wiki_articles'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    content = Column(String, nullable=False)
    summary = Column(String, nullable=True)
    category = Column(String(100), nullable=True)
    author = Column(String(200), nullable=True)
    published_at = Column(DateTime, nullable=True)
    image_url = Column(String(500), nullable=True)
    # Provenance tracking fields
    created_by = Column(String(50), nullable=True, default="human")  # ENUM: human, agent_research, agent_synthesis, cron_harvest, voice_to_seed
    created_via = Column(String(100), nullable=True)  # e.g., "voice_to_seeds.py", "web_search", "mcp::cursor_agent"
    provenance_log = Column(JSON, nullable=True)  # List of provenance events
    last_interacted_at = Column(DateTime, nullable=True)  # For decay scoring
    interaction_count = Column(Integer, default=0)  # How many times article was accessed
    __table_args__ = (
        UniqueConstraint('tenant_id', 'title', name='uq_wiki_tenant_title'),
        Index('idx_wiki_tenant_category', tenant_id, category),
    )


class LinkCache(Base):
    """
    Postgres shadow store for Weaviate Link objects.
    Written on every link creation so a Weaviate data loss can be recovered via
    scripts/resto<RESEND_API_KEY> using this table as source of truth.
    """
    __tablename__ = 'link_cache'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    weaviate_id = Column(String, nullable=True, index=True)  # Weaviate object UUID
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    url = Column(String(2000), nullable=False)
    title = Column(String(500), nullable=True)
    summary = Column(String, nullable=True)
    domain = Column(String(200), nullable=True)
    tags = Column(String, nullable=True)
    favicon = Column(String(500), nullable=True)
    og_image = Column(String(500), nullable=True)
    starred = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('idx_link_cache_tenant', tenant_id),
        Index('idx_link_cache_url', tenant_id, url),
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


class ResearchRun(Base):
    """A long-running Deep Research job (docs/specs/deep-research-agents.md).

    Durable state for the orchestrator: survives worker restarts and is the
    resume point. Phase 2 (Temporal) reuses this table as the run-of-record.
    """
    __tablename__ = 'research_runs'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False, index=True)
    theme = Column(String(300), nullable=True)            # focus (explicit or auto-picked)
    status = Column(String(32), nullable=False, default='queued', index=True)
    # queued → scoping → scouting → synthesizing → reporting → done | error
    gap = Column(Text, nullable=True)                     # the named gap
    report_md = Column(Text, nullable=True)               # final synthesized report
    finding_count = Column(Integer, default=0)
    email_sent = Column(Boolean, default=False)
    result_seed_id = Column(UUID(as_uuid=True), nullable=True)  # garden seed of the report
    error = Column(String(500), nullable=True)
    engine = Column(String(16), default='worker')         # 'worker' (P1) | 'temporal' (P2)
    mode = Column(String(8), default='deep')              # 'deep' (full-text + 1M) | 'lite'
    parent_run_id = Column(UUID(as_uuid=True), nullable=True)  # set when "go deeper" spawns a follow-up
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    findings = relationship("ResearchFinding", back_populates="run", cascade="all, delete-orphan")


class ResearchFinding(Base):
    """One scout's hit for a run — durable so a re-run skips completed scouts."""
    __tablename__ = 'research_findings'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey('research_runs.id'), nullable=False, index=True)
    source = Column(String(32), nullable=False)           # garden|arxiv|openalex|hackernews|rss
    title = Column(String(400), nullable=True)
    url = Column(String(800), nullable=True)
    snippet = Column(Text, nullable=True)
    relevance = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("ResearchRun", back_populates="findings")
