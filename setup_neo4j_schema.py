#!/usr/bin/env python3
"""
setup_neo4j_schema.py
Create constraints and vector indexes for the Second Brain knowledge graph.
Run this after Neo4j is started.

Usage: python3 setup_neo4j_schema.py
"""

import os
import sys
from neo4j import GraphDatabase

# Neo4j connection - adjust if needed
NEO4J_URI = os.getenv("NEO4J_URI", "neo4j://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "StrongPasswordHere123!")

# Vector index config
VECTOR_DIMENSIONS = 1024  # nvidia/nv-embedqa-e5-v5 output dim
SIMILARITY = "cosine"

def main():
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    with driver.session() as session:
        print("Creating uniqueness constraints...")
        # Constraints to ensure fast lookups and prevent duplicates
        constraints = [
            "CREATE CONSTRAINT parked_thought_id IF NOT EXISTS FOR (p:ParkedThought) REQUIRE p.notion_id IS UNIQUE",
            "CREATE CONSTRAINT idea_garden_id IF NOT EXISTS FOR (g:IdeaGarden) REQUIRE g.notion_id IS UNIQUE",
            "CREATE CONSTRAINT journal_entry_id IF NOT EXISTS FOR (j:JournalEntry) REQUIRE j.notion_id IS UNIQUE",
            "CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE",
        ]
        for c in constraints:
            try:
                session.run(c)
                print(f"  ✓ {c}")
            except Exception as e:
                print(f"  ✗ {c} -> {e}")

        print("\nCreating vector index for Chunk nodes...")
        # This is the main vector search index
        vector_index = f"""
        CREATE VECTOR INDEX chunk_vector IF NOT EXISTS
        FOR (c:Chunk) ON (c.embedding)
        OPTIONS {{
          indexConfig: {{
            `vector.dimensions`: {VECTOR_DIMENSIONS},
            `vector.similarity_function`: '{SIMILARITY}',
            `vector.hnsw.efConstruction`: 128,
            `vector.hnsw.m`: 16
          }}
        }}
        """
        try:
            session.run(vector_index)
            print("  ✓ Vector index created (or already exists)")
        except Exception as e:
            print(f"  ✗ Vector index -> {e}")

        print("\nCreating fulltext index for text search...")
        # Optional: fulltext search for hybrid queries
        fulltext = """
        CREATE FULLTEXT INDEX chunk_text_fulltext IF NOT EXISTS
        FOR (c:Chunk) ON EACH [c.text]
        """
        try:
            session.run(fulltext)
            print("  ✓ Fulltext index created")
        except Exception as e:
            print(f"  ✗ Fulltext index -> {e}")

        print("\nSchema setup complete!")

if __name__ == "__main__":
    main()
