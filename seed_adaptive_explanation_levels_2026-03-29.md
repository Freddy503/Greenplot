# Adaptive Explanation Levels

**Date**: 2026-03-29  
**Source**: Voice memo during gym  
**Priority**: High — core UX differentiator

---

## Concept
Allow users to toggle how explanations are delivered:
- **Beginner**: Simple language, more context, examples
- **Medium**: Balanced, assumes some familiarity
- **Expert**: Concise, technical, skip basics

Additionally, a "Repeat" button to re‑hear/read the explanation in the current level.

---

## Use Cases
- Learning agentic coding: start beginner, progress to expert
- Explaining complex business processes (P2P, O2C) at the right depth
- Onboarding users with different skill levels

---

## Implementation Ideas
- Store user preference per session (or globally)
- LLM prompt modulation: prefix with "Explain at beginner level: ..."
- In voice interface: "Repeat that in simpler terms" changes level
- In UI: show current level badge; allow quick switch

---

## Next Steps
- Add to PWA design (settings panel)
- Backend: support `?level=beginner` on all explanation endpoints
- Enrichment pipeline could tag seeds with suggested audience level
