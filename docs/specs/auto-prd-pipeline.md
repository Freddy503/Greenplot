# Auto-PRD Pipeline — Papers to Draft PRDs on Autopilot — PRD

**Status:** ready · **Owner:** Freddy · **Target:** ~1 week

## Problem Alignment

The loop from research to build now works, but every stage still waits for the user to push: papers arrive parsed and indexed, yet nothing happens until Freddy opens Studio, picks a paper, and runs "Spec it". The highest-leverage moment — *"this paper implies a product"* — depends on the user noticing it. The system already knows the paper's full text, its connection to the garden, and the user's interests; it should act on that knowledge. Draft PRDs should appear on autopilot so the user's role shifts from drafting documents to shaping product vision with the thinking partner.

## Solution Summary

A new **auto-PRD stage** runs after paper parsing completes: a relevance gate scores each newly parsed digest paper against the user's garden; papers scoring high (cap 2–3/day) get a full PRD draft generated from the paper's actual chunks plus related seeds, following the canonical gstack structure (Problem Alignment → Solution Summary → System Architecture → Scope → Risks → Milestones). Drafts land in the Studio drafts strip marked **AUTO**, each opening into a one-tap **"Shape the vision"** chat session — spec-mode preloaded with the draft and paper context, where the thinking partner asks the vision-forcing questions and rewrites the PRD in place. Untouched drafts roll up into a weekly review digest and archive at 30 days.

## System Architecture

- **Trigger** (`auto_prd.py`, new): hooks the end of the paper-parse worker job — when a paper seed flips to `parse_status='parsed'` AND `created_via='academic_digest'`, enqueue `sco<RESEND_API_KEY>(seed_id)` on the existing Redis/RQ worker. Manually pasted papers do NOT auto-trigger (the user already has intent there); they get a **"Draft PRD"** button in the paper detail instead, which calls the same job.
- **Relevance gate**: one cheap LLM call (Gemini 3.5 Flash) scoring 0–10: inputs are the digest's garden-connection description, top-5 related seeds (vector search), and the user's interests. Threshold ≥ 7 AND daily cap (default 3, setting `AUTO_PRD_DAILY_CAP`) checked against a `usage`-style counter. Below threshold → seed metadata `auto_prd: 'skipped_low_relevance'` (so the UI can still offer the manual button).
- **Draft generator**: builds the PRD with one strong generation call: context = top 8 `PaperChunk`s (method/results-weighted) + the 5 related seeds + the example-PRD structure as the system prompt template (the exact section set and tone of this document). Output saved via the existing `write_spec` path → spec seed with `seed_metadata: { auto_generated: true, source_paper_id, build_status: 'draft', vision_status: 'pending' }`. Library compile is **skipped** for auto-drafts (they only earn an article once the vision session promotes them).
- **"Shape the vision" flow**: the Studio draft card and PRD detail show a primary button → `/chat?mode=spec&seed={id}&flow=vision`. The chat page preloads the draft + `search_paper_content` context and runs a **vision interrogation prompt** (new section in `thinking-modes.ts`): WHO is this for, what demand signal exists, why us/why now, what's the wedge vs. the paper's authors commercializing it — then calls `update_seed` (append=false) with the rewritten PRD and sets `vision_status: 'shaped'`, `build_status` stays draft until the user drags it to Ready.
- **Weekly roundup** (cron, reuses briefing scheduler): every Sunday, drafts with `auto_generated && vision_status='pending'` older than 7 days are bundled into a "Draft review" notification + email section (title, one-line problem, Shape/Dismiss links). At 30 days untouched → `archived: true` (never deleted, still searchable).
- **UI**: drafts strip cards get an `AUTO` pill and the Shape-the-vision button; Studio section header shows "N auto-drafts awaiting vision". Settings → a toggle (`auto_prd_enabled`, default on) and the daily cap.

Data flow: `digest paper parsed → relevance gate (≥7, cap ok) → PRD draft generated from chunks+seeds → Studio drafts strip [AUTO] → user taps Shape the vision → spec-chat interrogation → update_seed rewrite → user drags to Ready → existing build pipeline`.

## Scope & Capabilities

**In:** relevance gate + daily cap, digest-paper autopilot, manual "Draft PRD" button for any paper (incl. the 170 backfilled), gstack-structured generation grounded in PaperChunks, AUTO badge + Shape-the-vision chat flow, vision interrogation prompt, weekly roundup notification, 30-day archive, settings toggle + cap.
**Out (v1):** auto-drafts from non-paper seeds (ideas/links), multi-paper synthesis into one PRD, auto-generating the architecture diagram (user triggers it after vision — diagrams cost BFL credits), auto-promotion to Ready (a human always gates the board).

## Delivery Risks & Open Questions

- **Draft quality**: a bad auto-PRD erodes trust fast. Mitigate: the generator must cite ≥3 paper chunks and ≥2 garden seeds or it aborts to `skipped_insufficient_context`; weekly-roundup framing sets expectation that these are *starting points*.
- **Cost**: gate call (~1K tokens) per digest paper + ~12K-token generation per accepted draft ≈ cents/day at Flash pricing under the cap.
- **Prompt drift vs. the canonical structure**: keep the example PRD as a versioned template string (`PRD_TEMPLATE_V1`) — tests assert all six section headers appear in output.
- Open: should "Dismiss" in the roundup teach the relevance gate (thumbs-down topics)? Propose yes in v1.1 via a `taste` memory seed.

## Milestones

1. Relevance gate + draft generator + worker hook, AUTO metadata (2 days)
2. Studio: AUTO pills, Shape-the-vision button, manual Draft PRD button (1 day)
3. Vision interrogation flow in spec-mode chat + update_seed rewrite (2 days)
4. Weekly roundup cron + settings toggle/cap + 30-day archive (1–2 days)
