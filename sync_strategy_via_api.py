#!/usr/bin/env python3
import httpx

API_URL = "http://localhost:8001/api/v1"
# Admin credentials (already created)
email = "admin@example.com"
password = "changeme"

# Long content: Competitive Differentiation & Moat
content = """# Competitive Differentiation & Moat

**Date**: 2026-03-29  
**Context**: Post-gym reflection on how OpenClaw Brain differs from ChatGPT/Claude and what the sustainable competitive advantage could be.

---

## How This Differs from Claude/ChatGPT

| Aspect | ChatGPT/Claude directly | OpenClaw Brain (your system) |
|--------|------------------------|-----------------------------|
| **Context** | Limited to recent conversation; each session isolated | Persistent knowledge graph (Parking Lot → Garden) that remembers forever |
| **Data ownership** | Your queries go to their servers; history in their cloud | Your data lives in *your* Weaviate/Postgres, on your server |
| **Automation** | You must manually prompt, copy, organize | System automatically enriches thoughts → creates seeds → finds connections |
| **Multi-modal** | Text mainly (plus file uploads) | Integrated vector + graph + scheduled prompts + images (BFL) |
| **Tool integration** | Can use browser/search, but no persistent connections to *your* Notion/Odoo/calendar | Skills that call *your* APIs directly, store results in your DB |
| **Cost** | Pay-per-token, can get expensive with heavy use | Fixed infrastructure cost (server) + API fees — potentially cheaper at your usage level |
| **Customization** | You can't change the prompts or workflows fundamentally | You own the code; the morning spark, enrichment pipeline, and triggers are *your* logic |

---

## What's Your Moat?

1. **Personal Knowledge Graph** — The accumulated, interconnected seeds are unique to you. No one else has your exact data and connection patterns. Classic "your data is your moat."

2. **Workflow Automation** — The cron-driven pipeline (voice → Parking Lot → enriched seed → BFL image → Telegram) is a tailored, frictionless loop that generic AI doesn't provide out of the box.

3. **Tone & Philosophy** — You're building it as a *creativity companion*, not a productivity robot. The prompts, the Receptive State Journal, the morning spark — these are *personal* and can't be replicated simply by Prompting 101.

4. **Privacy & Control** — Everything stays on your Hetzner server. No data leaves your control. For privacy‑conscious users, that's a selling point.

5. **Integration Depth** — If you connect it to your Odoo CRM, calendar, and other tools, you get a unified view that no single AI vendor can provide without building those integrations themselves.

6. **Cost Efficiency at Scale** — Once the infra is running, adding users has marginal cost. If you keep it small and hobbyist, you can operate at a loss or donation‑supported, which commercial products can't do.

---

## Competitive Positioning (Hobby Project)

You're **not** trying to beat ChatGPT. You're building a **Niche Knowledge Companion** for:

- People who want a personal, private, persistent brain
- Those who like to tinker and own their infrastructure
- Creative professionals who value *process* over *answers*
- Small communities where trust and data sovereignty matter

Your "moat" isn't technology — it's **authenticity and alignment**. You're building the tool *you* want to use, with your specific quirks (receptive state journal, Linke Tree insights, BFL images). That personal touch is hard to replicate at scale.

---

## Summary

- **Differentiator**: Permanent, personalized knowledge graph + automated enrichment + privacy
- **Moat**: Your data, your workflow, your tone
- **Not competing with**: ChatGPT as a chatbot; competing with *Notion + AI* but with a different philosophy (less corporate, more personal)

That's a perfectly valid space for a hobby project. The question "why would anyone use this instead of ChatGPT?" has a good answer: *Because it's yours, it remembers, and it respects your privacy.*"""

def main():
    # Login
    resp = httpx.post(f"{API_URL}/login", json={"email": email, "password": password})
    resp.raise_for_status()
    token = resp.json()["access_token"]
    print(f"Logged in, token: {token[:20]}...")

    # Create thought (this will trigger enrichment synchronously)
    resp2 = httpx.post(
        f"{API_URL}/thoughts",
        headers={"Authorization": f"Bearer {token}"},
        json={"content": content, "source": "strategy"}
    )
    resp2.raise_for_status()
    thought = resp2.json()
    print("Thought created and enriched:")
    print(f"  Thought ID: {thought['id']}")
    print(f"  Status: {thought['status']}")
    if 'seed' in thought or 'seeds' in thought:
        # The response includes the seed if enriched inline
        pass
    print("\nSynced successfully to PostgreSQL + Weaviate via OpenClaw API.")

if __name__ == "__main__":
    main()
