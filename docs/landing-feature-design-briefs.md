# Landing feature visuals — Claude Design briefs

Five images for the landing feature showcase (`src/app/page.tsx` → `FEATURES`,
served from `public/landing/features/*.png`). Each brief is based on a real
product screenshot — **keep the real layout/components** so it reads as the
actual app, but **replace the on-screen content** with the clean placeholder
copy below (the real screenshots contain work-in-progress/PII we don't want on
the marketing site).

## Global direction (applies to all 5)

- **One demo persona across all 5** so the set feels coherent: a builder using
  Greenplot to research and ship a **focus/learning app**. Reuse this cast of
  generic seeds/PRDs everywhere:
  - Seeds: *Spaced repetition & retention*, *Onboarding friction teardown*,
    *Usage-based vs seat pricing*, *Power-user interviews*, *Activation metric*,
    *Competitor feature gaps*.
  - PRD: **Smart Onboarding Checklist — PRD**.
  - Interests/topics: *Product design · Learning science · AI*.
- **Theme: light.** The landing panel sits on `#fafaf8`. Design the **light
  content area** of each screen; **crop out or fade the dark left sidebar** (a
  thin sliver is OK for context, but the hero element must be the light UI).
- **Frame:** ~**4:3** (panel is ≈460×380). Export **2×** (~**920×760**), PNG (or
  WebP — then update the `image:` paths). `object-fit: cover`, so let the key
  element breathe with a little edge bleed; keep it centered.
- **Brand:** green `#16a34a` / deep green `#06281a`, serif display for titles
  (as in the app), rounded cards, soft shadows. Keep Greenplot's leaf mark.
- **Do:** show ONE clear hero moment per image, real-looking but tidy, with
  generous whitespace. **Don't:** dense walls of text, real names, real weather,
  real company names, lorem ipsum, or stocky illustration.

---

## 1. `thinking-partner.png` — "A thinking partner that knows what you know"

**Source:** the Chat screenshot.

- **Keep:** the chat layout — one assistant answer bubble, the **mode chips row**
  (Brainstorm · Pressure-test · Devil's advocate · Spec it · Deep Research) with
  one active, and the composer with the **`+` / Tools / mic / send** controls.
- **Change:** replace the long "what can I do" capability dump (it reads like a
  help menu, not a thinking partner). Show a **real exchange that proves it knows
  your knowledge and cites it** — the killer differentiator.
- **Show this content:**
  - User bubble: *"Is usage-based pricing right for our onboarding tool?"*
  - Assistant: 2–3 tight sentences taking a position (not a list), e.g. *"Lean
    usage-based — your own notes point the same way…"*
  - **The hero element:** the expanded **"Grounded in your garden · 3 seeds"**
    citation chip showing three clickable seed chips: *Usage-based vs seat
    pricing* · *Power-user interviews* · *Activation metric*.
  - Active mode chip: **Pressure-test**.
- **Crop / focal point:** center on the assistant bubble + the citation chip;
  show the mode chips just below and the top of the composer. Fade the sidebar.

---

## 2. `garden-capture.png` — "Capture anything — it connects itself"

**Source:** the Garden screenshot.

- **Keep:** the "Knowledge Garden" hero with the stat tiles, the **List / Graph**
  toggle, and the seed cards with **status pills (Enriched / Sprouting)** and
  **connection counts**.
- **Change:** genericize every seed title; round the stats; and make the point of
  the feature visible — **varied capture sources all auto-connecting.** Give each
  seed card a small **source icon**: a note, a 🎙️ voice memo, a 📄 PDF, a 🔗 link.
  *(If a second variant is easy, also design the **Graph** view — a node/edge
  network — since "it connects itself" is strongest as a graph.)*
- **Show this content:**
  - Stats: **128 seeds** · **22 domains** (clean round-ish numbers).
  - Seed cards (each with a source icon + Enriched/Sprouting + a "⇄ N" link
    count): *Spaced repetition & retention* (📄 PDF · Enriched · ⇄ 7) ·
    *Power-user interviews* (🎙️ voice · Enriched · ⇄ 4) · *Competitor feature
    gaps* (🔗 link · Sprouting) · *Activation metric* (note · Enriched · ⇄ 5).
- **Crop / focal point:** the hero band + the first 3–4 seed cards. The eye
  should land on the mix of source icons + connection counts.

---

## 3. `studio-build.png` — "From a thread to a shipped PRD"

**Source:** the Studio screenshot (style reference) — but **design a different
view**: the **Build pipeline**, which best shows "shipped."

- **Keep:** Studio's visual language — the deep-green hero band, serif title,
  light card grid below.
- **Change:** instead of the thinking-partner mode cards, show the **Design →
  Doing → Built kanban** with PRD cards, so the "thread → PRD → shipped" story
  is literal. One card should read **Built · merged PR**.
- **Show this content:**
  - Hero: **The Studio** · subtitle *"Smart onboarding for first-time users."*
  - Three columns: **Design** (card: *Pricing experiment — PRD*), **Doing**
    (card: *Smart Onboarding Checklist — PRD*, small "in progress" dot), **Built**
    (card: *Activation email flow — PRD* with a **✓ merged PR** badge).
  - Optional small chip on a card: *"Turned into a PRD from chat."*
- **Crop / focal point:** the three-column board with the **Built · merged PR**
  card clearly visible — that's the payoff.

---

## 4. `research-digest.png` — "Research that comes to you"

**Source:** the Research Digest modal screenshot.

- **Keep:** the digest card — the **RESEARCH DIGEST** eyebrow + graduation-cap
  icon, the serif **"Research Digest — [date]"** title, the *"Grounded in your
  interests: …"* line, the **TL;DR** section, and the bottom **"Chat about this /
  Garden"** actions.
- **Change:** genericize all content; **drop the Weather block** (off-message);
  and make the **payoff** visible — a fresh paper connected to a seed **plus the
  auto-drafted PRD / actionable move** (that's the feature, not the news list).
- **Show this content:**
  - Title: **Research Digest — Monday** · *Grounded in your interests: Product
    design, Learning science, AI*.
  - **TL;DR:** 2 short bullets, e.g. *"New study backs spaced-repetition for
    onboarding retention — directly supports your Activation metric seed."*
  - **A paper card:** *"Spacing Effects in Applied Learning (2026)"* with a
    **↳ connects to: Spaced repetition & retention** chip + *"PDF indexed"*.
  - **The hero callout (green, pinned):** *"Actionable move + a draft PRD planted
    in your Studio →"*.
- **Crop / focal point:** the card top (title + TL;DR) and the green
  paper→seed→PRD callout. Keep it a clean single card on a softly dimmed backdrop.

---

## 5. `mcp.png` — "Your second brain, in every AI tool"

**Source:** the Settings screenshot — focus only on the **Coding agents · MCP**
card (crop out Calendar / GitHub / "Got an idea").

- **Keep:** the "Coding agents · MCP" card style and copy intent (mint a key →
  paste a config).
- **Change:** show it **unlocked and configured** — the value moment — and name
  the agents. Strongest version: a **split** — Greenplot's MCP config on the left,
  a coding agent (Claude Code / Cursor) **calling a Greenplot tool** on the right.
- **Show this content:**
  - Header: **Coding agents · MCP** — *"Your whole garden, inside Claude Code,
    Cursor & Claude Desktop."*
  - A config snippet block (monospace) with a masked key: `"Authorization":
    "Bearer gp_live_••••••••"`, url `https://api.greenplot.ink/mcp`.
  - Right panel (optional but ideal): a terminal/editor line —
    *"› search_seeds('onboarding retention') → 4 seeds"* and *"› write_spec(…) →
    PRD saved to Studio"* — proving the garden is usable from the editor.
  - Small logos/wordmarks: **Claude Code · Cursor · Claude Desktop**.
- **Crop / focal point:** the MCP card + the agent-tool-call panel. Light theme.

---

### Handoff checklist
- 5 files, exact names: `thinking-partner.png`, `garden-capture.png`,
  `studio-build.png`, `research-digest.png`, `mcp.png`.
- ~4:3, 2× (~920×760), light theme, generic content above.
- Drop them in `public/landing/features/`, commit — they replace the
  placeholders automatically. Send me the Claude Design API/links and I'll pull
  them in (and handle WebP / a CDN URL if you prefer).
