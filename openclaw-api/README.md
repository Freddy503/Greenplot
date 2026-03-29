# OpenClaw API Service

Multi-tenant FastAPI backend for the Second Brain PWA.

## Setup

1. Copy `.env.example` to `.env` and fill in values:
   - `DATABASE_URL` — Postgres connection
   - `WEAVIATE_URL` — Weaviate endpoint
   - `OPENROUTER_API_KEY` — LLM provider
   - `NVIDIA_API_KEY` — embeddings
   - `BFL_API_KEY` — image generation
   - `SECRET_KEY` — JWT signing secret
   - `REDIS_URL` — Redis for queue (optional)

2. Start with Docker Compose:
   ```bash
   docker-compose up -d
   ```

This will start:
- FastAPI app on http://localhost:8000
- PostgreSQL on localhost:5432
- Weaviate on http://localhost:8081 (different port from your existing)
- Redis on localhost:6379

3. Initialize database:
   ```bash
   docker-compose exec api alembic upgrade head
   ```

4. Create superuser (first tenant):
   ```bash
   docker-compose exec api python -m app.cli create-admin --email admin@example.com
   ```

---

## API Endpoints

See `/docs` at http://localhost:8000/docs for interactive documentation.

All endpoints require `Authorization: Bearer <token>` except `/api/v1/register` and `/api/v1/login`.

---

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally (without Docker)
uvicorn app.main:app --reload

# Run worker
python -m worker.main
```

---

## Notes

- Multi-tenancy enforced via `tenant_id` in all queries
- Weaviate class: `AppSeed` with `tenant_id` property
- Background jobs: Redis queue processed by `worker/main.py`
- Usage metering: daily aggregates in `usage` table
