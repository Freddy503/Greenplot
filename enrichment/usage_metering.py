#!/usr/bin/env python3
"""
usage_metering.py — Track API usage in Weaviate.

Creates an ApiCall class in Weaviate for token/cost tracking.
No Postgres dependency — everything in Weaviate.
"""

import json
import os
import sys
import urllib.request
import urllib.error
import datetime

WEAVIATE_URL = os.environ.get("WEAVIATE_URL", "http://localhost:8080")
CLASS_NAME = "ApiCall"


def weaviate_request(method, path, data=None):
    url = f"{WEAVIATE_URL}/v1{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            if r.length == 0 or r.length is None:
                return {}
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        raise RuntimeError(f"Weaviate {method} {path} -> {e.code}: {error_body}")


def ensure_schema():
    """Create the ApiCall class if it doesn't exist."""
    schema = weaviate_request("GET", "/schema")
    existing = [c["class"] for c in schema.get("classes", [])]
    if CLASS_NAME in existing:
        print(f"  ✓ {CLASS_NAME} class exists")
        return

    class_def = {
        "class": CLASS_NAME,
        "description": "API call usage tracking for cost monitoring",
        "vectorizer": "none",
        "properties": [
            {"name": "user_id", "dataType": ["text"], "indexFilterable": True},
            {"name": "tenant_id", "dataType": ["text"], "indexFilterable": True},
            {"name": "model", "dataType": ["text"], "indexFilterable": True},
            {"name": "endpoint", "dataType": ["text"], "indexFilterable": True},
            {"name": "tokens_in", "dataType": ["int"], "indexFilterable": True},
            {"name": "tokens_out", "dataType": ["int"], "indexFilterable": True},
            {"name": "cost_usd", "dataType": ["number"], "indexFilterable": True},
            {"name": "latency_ms", "dataType": ["int"], "indexFilterable": True},
            {"name": "status", "dataType": ["text"], "indexFilterable": True},
            {"name": "timestamp", "dataType": ["text"], "indexFilterable": True},
            {"name": "source", "dataType": ["text"], "indexFilterable": True},  # chat, cron, enrichment
        ]
    }
    weaviate_request("POST", "/schema", class_def)
    print(f"  + Created {CLASS_NAME} class")


def log_call(user_id: str, model: str, endpoint: str,
             tokens_in: int = 0, tokens_out: int = 0,
             cost_usd: float = 0.0, latency_ms: int = 0,
             status: str = "ok", source: str = "chat",
             tenant_id: str = ""):
    """Log a single API call."""
    obj = {
        "class": CLASS_NAME,
        "properties": {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "model": model,
            "endpoint": endpoint,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost_usd,
            "latency_ms": latency_ms,
            "status": status,
            "timestamp": datetime.datetime.now().isoformat(),
            "source": source,
        }
    }
    try:
        weaviate_request("POST", "/objects", obj)
    except Exception as e:
        print(f"  ⚠ Failed to log: {e}", file=sys.stderr)


def get_usage_summary(hours: int = 24) -> dict:
    """Get usage summary for the last N hours."""
    gql = """
    {
      Aggregate {
        ApiCall {
          meta { count }
          tokensIn { sum mean }
          tokensOut { sum mean }
          costUsd { sum mean }
          latencyMs { mean maximum }
        }
      }
    }
    """
    try:
        req = urllib.request.Request(
            f"{WEAVIATE_URL}/v1/graphql",
            data=json.dumps({"query": gql}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            res = json.loads(r.read())
        agg = res.get("data", {}).get("Aggregate", {}).get("ApiCall", [{}])[0]
        return {
            "total_calls": agg.get("meta", {}).get("count", 0),
            "total_tokens_in": agg.get("tokensIn", {}).get("sum", 0),
            "total_tokens_out": agg.get("tokensOut", {}).get("sum", 0),
            "total_cost_usd": round(agg.get("costUsd", {}).get("sum", 0), 4),
            "avg_latency_ms": agg.get("latencyMs", {}).get("mean", 0),
            "max_latency_ms": agg.get("latencyMs", {}).get("maximum", 0),
        }
    except Exception as e:
        return {"error": str(e)}


def get_usage_by_model() -> list:
    """Get usage breakdown by model."""
    gql = """
    {
      Aggregate {
        ApiCall(groupBy: ["model"]) {
          model
          meta { count }
          tokensIn { sum }
          tokensOut { sum }
          costUsd { sum }
        }
      }
    }
    """
    try:
        req = urllib.request.Request(
            f"{WEAVIATE_URL}/v1/graphql",
            data=json.dumps({"query": gql}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            res = json.loads(r.read())
        groups = res.get("data", {}).get("Aggregate", {}).get("ApiCall", [])
        return [
            {
                "model": g.get("model", "unknown"),
                "calls": g.get("meta", {}).get("count", 0),
                "tokens_in": g.get("tokensIn", {}).get("sum", 0),
                "tokens_out": g.get("tokensOut", {}).get("sum", 0),
                "cost_usd": round(g.get("costUsd", {}).get("sum", 0), 4),
            }
            for g in groups
        ]
    except Exception as e:
        return [{"error": str(e)}]


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Usage metering")
    parser.add_argument("--init", action="store_true", help="Create schema")
    parser.add_argument("--summary", action="store_true", help="Show usage summary")
    parser.add_argument("--by-model", action="store_true", help="Show usage by model")
    parser.add_argument("--log", nargs=4, metavar=("USER", "MODEL", "ENDPOINT", "TOKENS"),
                        help="Log a call: user_id model endpoint total_tokens")
    args = parser.parse_args()

    if args.init:
        ensure_schema()
    elif args.summary:
        print(json.dumps(get_usage_summary(), indent=2))
    elif args.by_model:
        print(json.dumps(get_usage_by_model(), indent=2))
    elif args.log:
        user_id, model, endpoint, tokens = args.log
        log_call(user_id, model, endpoint, tokens_in=int(tokens))
        print("Logged.")
    else:
        parser.print_help()
