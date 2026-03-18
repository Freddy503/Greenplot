#!/usr/bin/env python3
"""
Minimal Odoo CRM ingest helper.

Behavior:
- Finds or creates `res.partner` (by email first, then exact name)
- Creates `crm.lead` with:
  - name (provided or auto-derived)
  - partner_id
  - description = raw unstructured input text

Credentials are read from env vars:
- ODOO_URL
- ODOO_DB
- ODOO_USER
- ODOO_PASSWORD
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import textwrap
import xmlrpc.client
from dataclasses import dataclass
from typing import Optional


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+?\d[\d\s\-()]{6,}\d)")


@dataclass
class OdooConfig:
    url: str
    db: str
    user: str
    password: str


class OdooClient:
    def __init__(self, cfg: OdooConfig):
        self.cfg = cfg
        common_url = f"{cfg.url.rstrip('/')}/xmlrpc/2/common"
        object_url = f"{cfg.url.rstrip('/')}/xmlrpc/2/object"
        self.common = xmlrpc.client.ServerProxy(common_url)
        self.models = xmlrpc.client.ServerProxy(object_url)
        self.uid = self.common.authenticate(cfg.db, cfg.user, cfg.password, {})
        if not self.uid:
            raise RuntimeError("Odoo authentication failed")

    def execute(self, model: str, method: str, *args, **kwargs):
        return self.models.execute_kw(
            self.cfg.db,
            self.uid,
            self.cfg.password,
            model,
            method,
            list(args),
            kwargs,
        )


def derive_name(raw: str) -> str:
    first_line = (raw.strip().splitlines() or ["New Lead"])[0].strip()
    if not first_line:
        return "New Lead"
    return first_line[:120]


def extract_email(raw: str) -> Optional[str]:
    m = EMAIL_RE.search(raw)
    return m.group(0) if m else None


def extract_phone(raw: str) -> Optional[str]:
    m = PHONE_RE.search(raw)
    return m.group(0) if m else None


def get_config_from_env() -> OdooConfig:
    missing = [
        k for k in ["ODOO_URL", "ODOO_DB", "ODOO_USER", "ODOO_PASSWORD"] if not os.getenv(k)
    ]
    if missing:
        raise RuntimeError(f"Missing env vars: {', '.join(missing)}")
    return OdooConfig(
        url=os.environ["ODOO_URL"],
        db=os.environ["ODOO_DB"],
        user=os.environ["ODOO_USER"],
        password=os.environ["ODOO_PASSWORD"],
    )


def find_or_create_partner(client: OdooClient, *, partner_name: str, email: Optional[str], phone: Optional[str]) -> int:
    partner_id = None

    if email:
        ids = client.execute(
            "res.partner",
            "search",
            [("email", "=", email)],
            limit=1,
            order="id desc",
        )
        if ids:
            partner_id = ids[0]

    if not partner_id and partner_name:
        ids = client.execute(
            "res.partner",
            "search",
            [("name", "=", partner_name)],
            limit=1,
            order="id desc",
        )
        if ids:
            partner_id = ids[0]

    if partner_id:
        return partner_id

    values = {"name": partner_name or "Unknown Contact"}
    if email:
        values["email"] = email
    if phone:
        values["phone"] = phone

    return client.execute("res.partner", "create", values)


def create_lead(client: OdooClient, *, lead_name: str, partner_id: int, description: str) -> int:
    values = {
        "name": lead_name,
        "partner_id": partner_id,
        "description": description,
    }
    return client.execute("crm.lead", "create", values)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Create Odoo CRM lead from unstructured text, creating partner if needed."
    )
    p.add_argument("raw", help="Unstructured lead text")
    p.add_argument("--lead-name", help="Lead name override")
    p.add_argument("--partner-name", help="Partner/company name (strongly recommended)")
    p.add_argument("--email", help="Contact email override")
    p.add_argument("--phone", help="Phone override")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    raw = textwrap.dedent(args.raw).strip()
    if not raw:
        print("Error: raw text is empty", file=sys.stderr)
        return 2

    lead_name = args.lead_name or derive_name(raw)
    email = args.email or extract_email(raw)
    phone = args.phone or extract_phone(raw)
    partner_name = args.partner_name or lead_name

    cfg = get_config_from_env()
    client = OdooClient(cfg)

    partner_id = find_or_create_partner(
        client, partner_name=partner_name, email=email, phone=phone
    )
    lead_id = create_lead(client, lead_name=lead_name, partner_id=partner_id, description=raw)

    print(f"OK partner_id={partner_id} lead_id={lead_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
