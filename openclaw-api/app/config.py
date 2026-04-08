from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # App
    SECRET_KEY: str = "<SECRET_KEY>"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

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
    # Model for enrichment (LLM)
    ENRICH_MODEL: str = "nvidia/nemotron-super-49b-v1:free"
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

    # Harvest / internal API key
    HARVEST_API_KEY: str = "<HARVEST_API_KEY>"

    class Config:
        env_file = ".env"

settings = Settings()

