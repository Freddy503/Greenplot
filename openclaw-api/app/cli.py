#!/usr/bin/env python3
"""
Initialize database and create first admin user.
Usage: python -m app.cli --email admin@example.com --password changeme
"""

import sys
import argparse
import uuid
from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash

def create_admin(email: str, password: str):
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            print(f"User {email} already exists.")
            return
        user = User(
            email=email,
            password_hash=get_password_hash(password),
            tenant_id=uuid.uuid4()
        )
        db.add(user)
        db.commit()
        print(f"Admin user created: {email} (tenant_id: {user.tenant_id})")
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OpenClaw API admin CLI")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    args = parser.parse_args()
    create_admin(args.email, args.password)
