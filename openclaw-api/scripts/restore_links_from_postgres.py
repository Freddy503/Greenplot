"""
resto<RESEND_API_KEY>
Re-populate Weaviate Link class from the Postgres link_cache table.
Run this after a Weaviate data loss to recover all saved links.

Usage (on server):
    docker exec openclaw-api python3 /app/scripts/resto<RESEND_API_KEY>
"""
from app.database import SessionLocal
from app.models import LinkCache
from app.weaviate_client import weaviate_client
import sys

db = SessionLocal()
try:
    rows = db.query(LinkCache).all()
    print(f"Found {len(rows)} links in Postgres link_cache")

    ok = err = skipped = 0
    for row in rows:
        tenant_id = str(row.tenant_id)
        user_id = str(row.user_id)

        # Skip if already in Weaviate
        existing = weaviate_client.find_link_by_url(tenant_id=tenant_id, url=row.url)
        if existing:
            skipped += 1
            continue

        try:
            wid = weaviate_client.add_link(
                tenant_id=tenant_id,
                user_id=user_id,
                url=row.url,
                title=row.title or "",
                summary=row.summary or "",
                domain=row.domain or "",
                tags=row.tags or "",
                favicon=row.favicon or "",
                og_image=row.og_image or "",
                raw_text="",
                status="enriched",
                starred=row.starred or False,
            )
            # Update weaviate_id in postgres
            row.weaviate_id = wid
            db.add(row)
            ok += 1
        except Exception as e:
            print(f"  ❌ {row.url}: {e}", file=sys.stderr)
            err += 1

    db.commit()
    print(f"✅ Restored: {ok} | Skipped (already existed): {skipped} | Errors: {err}")
finally:
    db.close()
