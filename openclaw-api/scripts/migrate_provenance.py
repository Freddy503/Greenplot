"""Add provenance tracking fields to seeds table."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine
from sqlalchemy import text


def upgrade():
    """Add provenance columns to seeds table."""
    with engine.connect() as conn:
        # Add columns to seeds table
        migrations = [
            "ALTER TABLE seeds ADD COLUMN IF NOT EXISTS created_by VARCHAR(50) DEFAULT 'human'",
            "ALTER TABLE seeds ADD COLUMN IF NOT EXISTS created_via VARCHAR(100)",
            "ALTER TABLE seeds ADD COLUMN IF NOT EXISTS provenance_log JSONB",
            "ALTER TABLE seeds ADD COLUMN IF NOT EXISTS last_interacted_at TIMESTAMP",
            "ALTER TABLE seeds ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 0",
        ]
        
        for migration in migrations:
            try:
                conn.execute(text(migration))
                conn.commit()
                print(f"Executed: {migration}")
            except Exception as e:
                print(f"Error on '{migration}': {e}")
                conn.rollback()
        
        print("\nMigration complete for seeds table!")


def downgrade():
    """Remove provenance columns from seeds table (DANGER!)."""
    print("WARNING: This will delete provenance data!")
    confirm = input("Are you sure? (y/N): ")
    if confirm.lower() != 'y':
        print("Aborted.")
        return
    
    with engine.connect() as conn:
        columns = [
            "created_by",
            "created_via", 
            "provenance_log",
            "last_interacted_at",
            "interaction_count"
        ]
        
        for col in columns:
            try:
                conn.execute(text(f"ALTER TABLE seeds DROP COLUMN IF EXISTS {col}"))
                conn.commit()
                print(f"Dropped column: {col}")
            except Exception as e:
                print(f"Error dropping {col}: {e}")
                conn.rollback()
        
        print("\nDowngrade complete!")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--downgrade":
        downgrade()
    else:
        upgrade()
