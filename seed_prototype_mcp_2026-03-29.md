# Prototype Generation via MCP (Future Feature)

**Date**: 2026-03-29  
**Source**: Voice memo  
**Priority**: Low (post‑V1 add‑on)

---

## Concept
Integrate an MCP (Model Context Protocol) server for a Google design tool (likely Figma or FigJam) that allows users to:
- Generate quick prototypes from seeds/ideas
- Create visual mockups automatically
- Export designs

This is an **add‑on experience** — not core to the Second Brain, but enhances the "lovable" factor by enabling rapid iteration on creative concepts.

---

## Implementation Notes
- Use `xiaomi/mimo-v2-pro` model for generating design specifications
- MCP server would call the design tool's API
- Trigger from seed detail page: "Generate prototype"
- Result: embed or link to the design

---

## Status
Backlog. V1 focuses on core capture → enrich → retrieve loop.
