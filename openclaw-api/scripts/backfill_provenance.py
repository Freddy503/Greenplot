#!/usr/bin/env python3
"""
Backfill provenance data for existing seeds, sources, and wiki articles.

This script populates the new provenance tracking fields:
- created_by: Set to 'human' for existing records
- created_via: Set to 'legacy_import'
- provenance_log: Initialize with legacy_create event
- last_interacted_at: Set to created_at (for decay scoring)
- interaction_count: Initialize to 0

Run this ONCE before deploying the provenance feature.
Safe to re-run - will skip records that already have provenance data.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import Seed, Source, WikiArticle
from datetime import datetime


def backfill_seeds():
    """Backfill provenance data for Seed records."""
    db = SessionLocal()
    try:
        # Only backfill seeds that don't have provenance data
        seeds = db.query(Seed).filter(Seed.created_by.is_(None)).all()
        
        for seed in seeds:
            seed.created_by = 'human'
            seed.created_via = 'legacy_import'
            seed.provenance_log = [{
                'ts': seed.created_at.isoformat() if seed.created_at else datetime.utcnow().isoformat(),
                'actor': 'human',
                'action': 'create',
                'reason': 'legacy_data'
            }]
            seed.last_interacted_at = seed.last_visited  # Use existing last_visited if available
            seed.interaction_count = seed.visit_count or 0  # Migrate existing visit_count
        
        db.commit()
        print(f"Backfilled {len(seeds)} seeds")
        
        # Report on already-provenanced seeds
        provenanced = db.query(Seed).filter(Seed.created_by.isnot(None)).count()
        print(f"Seeds already with provenance: {provenanced}")
        
    except Exception as e:
        db.rollback()
        print(f"Error backfilling seeds: {e}")
        raise
    finally:
        db.close()


def backfill_sources():
    """Backfill provenance data for Source records (if table exists)."""
    db = SessionLocal()
    try:
        # Check if sources table exists and has records
        try:
            seeds = db.query(Source).filter(Source.created_by.is_(None)).all()
        except Exception:
            print("Sources table not yet created - skipping")
            return
        
        for source in seeds:
            source.created_by = 'human'
            source.created_via = 'legacy_import'
            source.provenance_log = [{
                'ts': source.retrieved_at.isoformat() if source.retrieved_at else datetime.utcnow().isoformat(),
                'actor': 'human',
                'action': 'create',
                'reason': 'legacy_data'
            }]
            source.interaction_count = 0
            source.last_interacted_at = None
        
        db.commit()
        print(f"Backfilled {len(seeds)} sources")
        
    except Exception as e:
        db.rollback()
        print(f"Error backfilling sources: {e}")
        raise
    finally:
        db.close()


def backfill_wiki_articles():
    """Backfill provenance data for WikiArticle records (if table exists)."""
    db = SessionLocal()
    try:
        # Check if wiki_articles table exists and has records
        try:
            articles = db.query(WikiArticle).filter(WikiArticle.created_by.is_(None)).all()
        except Exception:
            print("WikiArticle table not yet created - skipping")
            return
        
        for article in articles:
            article.created_by = 'human'
            article.created_via = 'legacy_import'
            article.provenance_log = [{
                'ts': article.published_at.isoformat() if article.published_at else datetime.utcnow().isoformat(),
                'actor': 'human',
                'action': 'create',
                'reason': 'legacy_data'
            }]
            article.interaction_count = 0
            article.last_interacted_at = None
        
        db.commit()
        print(f"Backfilled {len(articles)} wiki articles")
        
    except Exception as e:
        db.rollback()
        print(f"Error backfilling wiki articles: {e}")
        raise
    finally:
        db.close()


def main():
    print("=" * 60)
    print("Provenance Backfill Script")
    print("=" * 60)
    print()
    
    print("This script will backfill provenance data for existing entities.")
    print("Safe to re-run - only processes records without provenance data.")
    print()
    
    confirm = input("Continue? (y/N): ")
    if confirm.lower() != 'y':
        print("Aborted.")
        return
    
    print()
    print("Step 1: Backfilling seeds...")
    backfill_seeds()
    
    print()
    print("Step 2: Backfilling sources...")
    backfill_sources()
    
    print()
    print("Step 3: Backfilling wiki articles...")
    backfill_wiki_articles()
    
    print()
    print("=" * 60)
    print("Backfill complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
