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
    # Model for chat/agent responses — needs strong tool-use and reasoning
    CHAT_MODEL: str = "google/gemini-3-flash-preview"
    # Model for enrichment (structured JSON output, seed generation)
    ENRICH_MODEL: str = "minimax/minimax-m2.7"
    # Model for embeddings (use OpenRouter's embedding endpoint)
    EMBEDDING_MODEL: str = "openai/text-embedding-ada-002"
    BFL_API_KEY: Optional[str] = None
    BFL_API_URL: str = "https://api.bfl.ai/v1/flux-dev"
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

    # Sentry error monitoring
    SENTRY_DSN: Optional[str] = None

    class Config:
        env_file = ".env"

settings = Settings()

