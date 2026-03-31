#!/usr/bin/env python3
"""
enrichment_monitor.py — Check enrichment health and dead-letter queue.

Run via cron or manually:
  python3 enrichment_monitor.py
  python3 enrichment_monitor.py --check-failures
"""

import json
import os
import sys
import urllib.request
import urllib.error
import datetime

WEAVIATE_URL = os.environ.get("WEAVIATE_URL", "http://localhost:8080")


def weaviate_graphql(query):
    req = urllib.request.Request(
        f"{WEAVIATE_URL}/v1/graphql",
        data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def get_enrichment_stats():
    """Get enrichment coverage statistics."""
    try:
        # All unique seeds (by notion_id)
        all_q = '{ Get { IdeaSeed { notion_id enrichment_version } } }'
        res = weaviate_graphql(all_q)
        hits = res.get("data", {}).get("Get", {}).get("IdeaSeed", [])

        # Deduplicate by notion_id
        seen = {}
        for h in hits:
            nid = h.get("notion_id", "")
            if nid and nid not in seen:
                seen[nid] = h.get("enrichment_version")

        total_unique = len(seen)
        enriched_unique = sum(1 for v in seen.values() if v is not None and int(v) >= 1)

        # Domain breakdown
        domain_q = '{ Get { IdeaSeed(where: { operator: GreaterThan path: ["enrichment_version"] valueInt: 0 }) { domain } } }'
        dres = weaviate_graphql(domain_q)
        domain_hits = dres.get("data", {}).get("Get", {}).get("IdeaSeed", [])
        domains = {}
        for h in domain_hits:
            d = h.get("domain", "unknown")
            domains[d] = domains.get(d, 0) + 1

        return {
            "total_chunks": len(hits),
            "unique_seeds": total_unique,
            "enriched_seeds": enriched_unique,
            "unenriched_seeds": total_unique - enriched_unique,
            "coverage_pct": round(enriched_unique / max(total_unique, 1) * 100, 1),
            "domains": domains
        }
    except Exception as e:
        return {"error": str(e)}


def check_dead_letters():
    """Check if Redis dead-letter queue has entries."""
    try:
        import redis
        r = redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
        dead = r.hgetall("enrichment:dead_letter")
        if dead:
            items = {}
            for k, v in dead.items():
                key = k.decode() if isinstance(k, bytes) else k
                val = json.loads(v.decode() if isinstance(v, bytes) else v)
                items[key] = val
            return {"count": len(items), "items": items}
        return {"count": 0, "items": {}}
    except ImportError:
        return {"error": "redis-py not installed"}
    except Exception as e:
        return {"error": str(e)}


def check_stale_seeds():
    """Find seeds that haven't been enriched (potential failures)."""
    try:
        # Get all seeds and check enrichment status
        gql = '{ Get { IdeaSeed { notion_id title enrichment_version } } }'
        res = weaviate_graphql(gql)
        hits = res.get("data", {}).get("Get", {}).get("IdeaSeed", [])

        # Deduplicate by notion_id
        seen = {}
        for h in hits:
            nid = h.get("notion_id", "")
            if nid and nid not in seen:
                seen[nid] = {
                    "notion_id": nid,
                    "title": h.get("title", ""),
                    "enrichment_version": h.get("enrichment_version")
                }

        unenriched = [v for v in seen.values() if v["enrichment_version"] is None or int(v["enrichment_version"]) < 1]
        return {
            "total_unique_seeds": len(seen),
            "unenriched_count": len(unenriched),
            "unenriched_seeds": [{"notion_id": s["notion_id"], "title": s["title"]} for s in unenriched[:5]]
        }
    except Exception as e:
        return {"error": str(e)}


def full_report():
    """Generate full health report."""
    report = {
        "timestamp": datetime.datetime.now().isoformat(),
        "enrichment_stats": get_enrichment_stats(),
        "dead_letters": check_dead_letters(),
        "stale_seeds": check_stale_seeds(),
    }

    # Alert conditions
    alerts = []
    stats = report["enrichment_stats"]
    if stats.get("coverage_pct", 100) < 80:
        alerts.append(f"⚠ Enrichment coverage low: {stats['coverage_pct']}%")
    if report["dead_letters"].get("count", 0) > 0:
        alerts.append(f"⚠ {report['dead_letters']['count']} seeds in dead-letter queue")
    if report["stale_seeds"].get("unenriched_count", 0) > 10:
        alerts.append(f"⚠ {report['stale_seeds']['unenriched_count']} unenriched seeds")

    report["alerts"] = alerts
    report["healthy"] = len(alerts) == 0

    return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Enrichment monitoring")
    parser.add_argument("--full", action="store_true", help="Full health report")
    parser.add_argument("--stats", action="store_true", help="Enrichment stats only")
    parser.add_argument("--check-failures", action="store_true", help="Check dead letters")
    args = parser.parse_args()

    if args.stats:
        print(json.dumps(get_enrichment_stats(), indent=2))
    elif args.check_failures:
        print(json.dumps(check_dead_letters(), indent=2))
    else:
        report = full_report()
        print(json.dumps(report, indent=2))
        if not report.get("healthy", True):
            print("\n🚨 Issues detected:", file=sys.stderr)
            for alert in report.get("alerts", []):
                print(f"  {alert}", file=sys.stderr)
