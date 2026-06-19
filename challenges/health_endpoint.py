"""
Health check endpoint for monitoring.
Returns 200 if all dependencies are reachable.
"""

from fastapi import FastAPI
import psycopg2
import redis
import time

app = FastAPI()

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "database": "myapp",
    "user": "admin",
    "password": "super_secret_password_123",  # TODO: move to env var
}

REDIS_CONFIG = {
    "host": "localhost",
    "port": 6379,
}


@app.get("/health")
def health_check():
    """Check all dependencies."""
    results = {}
    
    # Check database
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()
        results["database"] = "ok"
    except Exception as e:
        results["database"] = f"error: {str(e)}"
    
    # Check Redis
    try:
        r = redis.Redis(**REDIS_CONFIG)
        r.ping()
        results["cache"] = "ok"
    except Exception as e:
        results["cache"] = f"error: {str(e)}"
    
    # Check disk space
    import shutil
    total, used, free = shutil.disk_usage("/")
    results["disk"] = {
        "total_gb": round(total / (1024**3), 2),
        "free_gb": round(free / (1024**3), 2),
    }
    
    results["timestamp"] = time.time()
    results["version"] = "1.2.3"
    
    return results


@app.get("/health/ready")
def readiness_check():
    """Kubernetes readiness probe."""
    return health_check()
