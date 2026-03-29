# Privacy Guardrail & Image Creation Toggle

**Date**: 2026-03-29  
**Source**: Voice memo

---

## 1. Privacy Boundary (Onboarding)

During onboarding, after the concept explanation, show a clear warning:

> "This is a creativity sparker, not a work tool. Please don't disclose sensitive company info, project names, or confidential details. Keep conversations about technology, creativity, and business trends in general terms."

User must acknowledge (checkbox "I understand") before proceeding.

---

## 2. Picture Creation Toggle

### Feature
From any user message or assistant response, there should be an easy way to generate a BFL image visualizing the described concept.

### UI Options
- **Per‑message**: A small 🎨 icon next to each message; tap → "Generate image" → shows loading → displays result below
- **Global setting**: "Auto‑generate images for seeds" toggle in Settings (default off). When on, every seed automatically includes a BFL image.

### Implementation
- Call BFL API with the user's text (or seed title/content)
- Display image inline or modal; allow saving/downloading
- Track usage per tenant for rate limiting/costing

---

**Status**: Logged for future implementation. Privacy guardrail to be added to onboarding spec; image toggle to be added to PWA after core MVP.
