# Odoo CRM Ingest Setup

## 1) Set credentials as environment variables

```bash
export ODOO_URL="https://test-claw.odoo.com"
export ODOO_DB="test-claw"
export ODOO_USER="<your-odoo-login>"
export ODOO_PASSWORD="<your-odoo-password-or-api-key>"
```

## 2) Create lead from unstructured text

```bash
python3 odoo_lead_ingest.py "
Met Anna from Example GmbH at meetup.
Interested in onboarding 20 seats next quarter.
Email: anna@example.com
Phone: +49 170 1234567
"
```

Optional flags:

- `--lead-name "Example GmbH - Meetup"`
- `--partner-name "Example GmbH"`
- `--email "anna@example.com"`
- `--phone "+49 170 1234567"`

## Behavior

- Looks up `res.partner` by email, then exact name.
- Creates `res.partner` if not found.
- Creates `crm.lead` with your full raw text in `description`.
