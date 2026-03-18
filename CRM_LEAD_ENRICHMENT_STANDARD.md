# CRM Lead Enrichment Standard (v1)

Use this exact structure for every new lead before writing to Odoo.

## 1) Source lead input
Raw unstructured text from Freddy.

## 2) Company snapshot
- Company name
- Website/domain
- What they do (1-2 lines)
- Optional: HQ/funding/compliance if confidently sourced

## 3) ICP / use-case fit
- Why this lead could matter for us
- Which team/problem this solution maps to

## 4) Recommended contact (non-CEO preferred)
- Contact name
- Role/function
- Why this person is the right first touchpoint

## 5) Outreach route
- Preferred direct channel/email if verified
- If unverified: official contact/sales/partner form URL

## 6) Data quality + confidence
- Confidence: High / Medium / Low
- Unknowns that need manual verification

## 7) Sources
- Bullet list of source URLs

---

## Odoo write rules

1. Find/create `res.partner` first (match email, then exact name).
2. Create `crm.lead` with full enriched report in `description`.
3. Populate lead fields when known:
   - `contact_name`
   - `email_from`
   - `function`
   - `website`
4. Never invent direct emails. Use official contact routes when direct email is not verified.
