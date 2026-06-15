# Landing — feature screenshots

Drop the real-UI exports for the landing feature showcase here (design them in
Claude Design). Each maps 1:1 to a feature in `src/app/page.tsx` (`FEATURES`).
Until a file exists, the showcase shows a branded "Product preview" placeholder —
so the page never looks broken while you're designing.

| File | Feature | Show |
|---|---|---|
| `thinking-partner.png` | A thinking partner that knows what you know | A chat turn grounded in the garden, with the "Grounded in your garden" citation chip expanded + a mode chip (Brainstorm/Pressure-test) |
| `garden-capture.png` | Capture anything — it connects itself | The composer "+" capture menu (PDF / link) or a fresh seed being enriched + connected in the garden |
| `studio-build.png` | From a thread to a shipped PRD | The Studio Build pipeline (Design → Doing → Built) with a PRD card, or "Turn into PRD" in chat |
| `research-digest.png` | Research that comes to you | A Research Digest card: a paper matched to a seed + the auto-drafted PRD / actionable move |
| `mcp.png` | Your second brain, in every AI tool | The Settings "Coding agents · MCP" card, or Claude Code/Cursor with a Greenplot tool call |

**Specs**
- Aspect ratio ~**4:3** (the panel is ~460×380). `object-fit: cover`, so design a little bleed at the edges.
- Export at **2×** (e.g. ~920×760) for retina; PNG (or WebP — then update the `image:` paths in `FEATURES`).
- Light theme to match the showcase panel background (`#fafaf8`-ish).
- Keep the key UI element centered; corners may be cropped slightly.
