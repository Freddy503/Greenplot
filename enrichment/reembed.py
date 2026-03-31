#!/usr/bin/env python3
"""
reembed.py — Re-process all existing Weaviate seeds through the enrichment pipeline.

This script:
  1. Fetches all unique seeds from Weaviate
  2. Runs each through the enrichment pipeline (chunk → extract → backlink → upsert)
  3. Reports results

Usage:
  python3 reembed.py                  # Enrich all (default)
  python3 reembed.py --limit 5        # Test with 5 seeds
  python3 reembed.py --dry-run        # Preview without writing
  python3 reembed.py --notion-id ID   # Single seed
"""

import sys
import os
import json
import argparse

sys.path.insert(0, os.path.dirname(__file__))
from schema import extend_schema, verify_schema
from pipeline import enrich_seed, enrich_all


def main():
    parser = argparse.ArgumentParser(description="Re-embed all Weaviate seeds through enrichment")
    parser.add_argument("--notion-id", help="Re-embed a specific seed")
    parser.add_argument("--limit", type=int, default=0, help="Max seeds to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--skip-schema", action="store_true", help="Skip schema extension")
    args = parser.parse_args()

    # Step 1: Ensure schema is up to date
    if not args.skip_schema:
        print("Step 1: Extending Weaviate schema...")
        extend_schema()
        verify_schema()
    else:
        print("Step 1: Skipping schema extension")

    # Step 2: Run enrichment
    print("\nStep 2: Running enrichment pipeline...")
    if args.notion_id:
        result = enrich_seed(args.notion_id, dry_run=args.dry_run)
        print(f"\nResult: {json.dumps(result, indent=2, ensure_ascii=False)}")
    else:
        results = enrich_all(limit=args.limit, dry_run=args.dry_run)

        # Save results log
        log_path = os.path.join(os.path.dirname(__file__), "..", "logs", "reembed_results.json")
        os.makedirs(os.path.dirname(log_path), exist_ok=True)
        with open(log_path, "w") as f:
            json.dump({
                "timestamp": __import__("datetime").datetime.now().isoformat(),
                "total": len(results),
                "enriched": sum(1 for r in results if r["status"] == "enriched"),
                "skipped": sum(1 for r in results if r["status"] == "already_enriched"),
                "errors": sum(1 for r in results if r["status"].startswith("error")),
                "results": results
            }, f, indent=2, ensure_ascii=False)
        print(f"\nResults logged to {log_path}")


if __name__ == "__main__":
    main()
