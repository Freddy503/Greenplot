#!/bin/sh
set -e

# Run Alembic migrations.
# On an existing DB with no alembic_version table, stamp head first so
# future migrations are tracked without re-running the initial schema.
if alembic current 2>&1 | grep -q "No version"; then
    echo "[entrypoint] No alembic version found — stamping existing DB as head"
    alembic stamp head
else
    echo "[entrypoint] Running alembic upgrade head"
    alembic upgrade head
fi

exec "$@"
