from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.config import settings

engine = create_engine(
    settings.SYNC_DATABASE_URL,
    pool_pre_ping=True,       # drops stale connections before use
    pool_size=20,             # was 5 — cron jobs + API need headroom
    max_overflow=40,          # was 10 — burst capacity
    pool_timeout=10,          # fail fast instead of hanging for 30s
    pool_recycle=1800,        # recycle connections every 30 min to avoid stale handles
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
