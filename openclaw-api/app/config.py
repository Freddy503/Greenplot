from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # App
    SECRET_KEY: str = "<SECRET_KEY>"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days

    # Database
    DATABASE_URL: str = "postgresql+psycopg2://postgres:${POSTGRES_PASSWORD}@db:5432/openclaw"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://postgres:${POSTGRES_PASSWORD}@db:5432/openclaw"

    # Weaviate
    WEAVIATE_URL: str = "http://weaviate:8080"
    WEAVIATE_CLASS: str = "IdeaSeed"

    # LLM & APIs
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    NVIDIA_API_KEY: Optional[str] = None
    # Each tier is its own OpenRouter slug, overridable via the matching env var.
    # Interactive chat / agent — fast, low-latency, non-reasoning responses.
    CHAT_MODEL: str = "deepseek/deepseek-v4-flash"
    # Briefings, Research Digest, reflections, weekly eval — long-context synthesis.
    BRIEFING_MODEL: str = "xiaomi/mimo-v2.5"
    # Premium one-off generation (strategy / solution-design papers).
    PREMIUM_MODEL: str = "xiaomi/mimo-v2.5-pro"
    # Bulk structured background work — enrichment, extraction, backlinking, insight mining.
    ENRICH_MODEL: str = "deepseek/deepseek-v4-flash"
    # Reliable non-thinking safety net for briefing retries.
    FALLBACK_MODEL: str = "minimax/minimax-m2.7"
    # Wiki article compilation — long-form synthesis, same tier as briefings.
    WIKI_MODEL: str = "xiaomi/mimo-v2.5"
    # Secondary model wiki synthesis falls back to if the primary fails.
    WIKI_FALLBACK_MODEL: str = "minimax/minimax-m2.7"
    # Model for embeddings (use OpenRouter's embedding endpoint)
    EMBEDDING_MODEL: str = "openai/text-embedding-ada-002"

    # Briefing/digest cron jobs skip any user whose email domain is listed here
    # (comma-separated). Keeps throwaway/seed accounts off the mailing + push
    # path. Add your own test domains (e.g. greenplot.app) via env if needed.
    BRIEFING_EXCLUDE_DOMAINS: str = "test.com,example.com,test.test,localhost"
    EXA_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None  # for Whisper + vision

    # Redis (for queue)
    REDIS_URL: str = "redis://redis:6379/0"

    # Rate limiting
    RATE_LIMIT_REQUESTS: int = 100  # per minute per tenant
    DAILY_TOKEN_LIMIT: int = 100_000  # LLM tokens per user per day (0 = unlimited)

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"
    APP_URL: str = "https://seedify-six.vercel.app"
    APP_NAME: str = "Seedify"

    # Attachments
    MAX_ATTACHMENT_SIZE_MB: int = 10
    ALLOWED_IMAGE_TYPES: str = "image/png,image/jpeg,image/gif,image/webp"
    ALLOWED_DOC_TYPES: str = "application/pdf,text/plain,text/markdown"
    ATTACHMENTS_DIR: str = "/tmp/openclaw-attachments"

    # Google Calendar
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "https://api.greenplot.ink/api/v1/calendar/callback"

    # VAPID (Web Push)
    VAPID_PRIVATE_KEY_BASE64: Optional[str] = None
    VAPID_PRIVATE_KEY_PATH: Optional[str] = None

    # Email (Resend)
    RESEND_API_KEY: Optional[str] = None
    EMAIL_FROM: str = "Greenplot <digest@greenplot.ink>"

    # Wiki data path (inside container)
    WIKI_DATA_PATH: str = "/data/wiki"

    # Harvest / internal API key — must be set via environment variable
    HARVEST_API_KEY: Optional[str] = None

    # Comma-separated list of emails allowed to call /api/v1/admin/* endpoints
    ADMIN_EMAILS: str = "contact@example.com"

    # Private beta: 6-character invite codes (comma-separated, case-insensitive).
    # INVITE_REQUIRED=true makes register reject signups without a valid code.
    INVITE_CODES: str = "GARDEN"
    INVITE_REQUIRED: bool = False

    # Auto-PRD pipeline (docs/specs/auto-prd-pipeline.md)
    AUTO_PRD_ENABLED: bool = True
    AUTO_PRD_DAILY_CAP: int = 3
    # Generator v2: critique-and-revise loop (docs/specs/prd-generator-v2.md)
    PRD_PIPELINE_V2: bool = True

    # Sentry error monitoring
    SENTRY_DSN: Optional[str] = None

    # GitHub integration (for Spec → Issue export)
    GITHUB_TOKEN: Optional[str] = None
    GITHUB_REPO: str = "Freddy503/Seedify"  # default repo for issue filing
    # One-click GitHub connect (OAuth app; callback must be
    # https://api.greenplot.ink/api/v1/github/oauth/callback). When unset,
    # the Settings UI falls back to the manual PAT flow.
    GITHUB_OAUTH_CLIENT_ID: Optional[str] = None
    GITHUB_OAUTH_CLIENT_SECRET: Optional[str] = None

    class Config:
        env_file = ".env"

settings = Settings()

