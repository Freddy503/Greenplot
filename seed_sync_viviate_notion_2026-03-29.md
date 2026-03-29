# Sync to Viviate and Notion

**Date**: 2026-03-29  
**Source**: Voice memo  
**Priority**: Medium — essential for data redundancy and UX

---

## Problem
Currently seeds are stored in PostgreSQL + Weaviate. Notion is used as source of truth for some entities (Parking Lot, Garden, Journal). Need a unified sync strategy.

---

## Requirements
- Every seed must be persisted in **both**:
  - **Viviate** (vector search)
  - **Notion** (source of truth for manual browse/edit)
- Ensure eventual consistency: if seed updated in one store, propagate to the other
- Handle conflicts (rare)

---

## Approach
- Treat **Notion as the master** for human‑editable content
- OpenClaw API is the **write‑through** layer:
  - When a seed is created/updated via API, write to Postgres + Weaviate **and** create/update the corresponding Notion page
  - When user edits a seed in Notion, the next sync job picks up changes and updates Weaviate (one‑way sync from Notion → vector)
- Use `notion_id` property to link seeds to Notion pages
- Periodic full sync (cron) to reconcile drift

---

## Next Step
Implement Notion sync in the enrichment pipeline and background worker.
