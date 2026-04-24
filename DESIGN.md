---
version: alpha
name: Greenplot
description: Living laboratory for ideas — off-white, editorial, and grounded in nature.
colors:
  background: "#fafaf8"
  surface: "#ffffff"
  surface-dim: "#e8e8e5"
  surface-container: "#ffffff"
  surface-container-low: "#fdfdFB"
  surface-container-high: "#eeeeec"
  primary: "#22c55e"
  primary-container: "#dcfce7"
  primary-foreground: "#ffffff"
  primary-fixed: "#86efac"
  on-primary: "#0a3622"
  secondary: "#14532d"
  secondary-container: "#dcfce7"
  secondary-foreground: "#ffffff"
  tertiary: "#14b8a6"
  tertiary-container: "#ccfbf1"
  foreground: "#141413"
  on-surface: "#141413"
  on-surface-variant: "#5f5f5a"
  muted-foreground: "#71716b"
  border: "#e8e6df"
  outline: "#ccc9c0"
  outline-variant: "#e0ddd6"
  error: "#ef4444"
  error-container: "#fef2f2"
typography:
  display-xl:
    fontFamily: Instrument Serif
    fontSize: clamp(2.5rem, 7vw, 5rem)
    fontWeight: "400"
    fontStyle: italic
    lineHeight: "1.08"
    letterSpacing: "-0.02em"
  display-lg:
    fontFamily: Instrument Serif
    fontSize: clamp(1.75rem, 4vw, 3rem)
    fontWeight: "400"
    fontStyle: italic
    lineHeight: "1.15"
    letterSpacing: "-0.02em"
  display-md:
    fontFamily: Instrument Serif
    fontSize: 1.5rem
    fontWeight: "400"
    fontStyle: italic
    lineHeight: "1.2"
    letterSpacing: "-0.015em"
  heading:
    fontFamily: Instrument Serif
    fontSize: 1.25rem
    fontWeight: "400"
    lineHeight: "1.3"
    letterSpacing: "-0.01em"
  body-lg:
    fontFamily: Barlow
    fontSize: 1.0625rem
    fontWeight: "400"
    lineHeight: "1.75"
  body-md:
    fontFamily: Barlow
    fontSize: 0.9375rem
    fontWeight: "400"
    lineHeight: "1.6"
  body-sm:
    fontFamily: Barlow
    fontSize: 0.8125rem
    fontWeight: "400"
    lineHeight: "1.5"
  label:
    fontFamily: Sora
    fontSize: 0.8125rem
    fontWeight: "500"
    lineHeight: "1.2"
    letterSpacing: "0.01em"
  label-caps:
    fontFamily: Sora
    fontSize: 0.625rem
    fontWeight: "600"
    lineHeight: "1"
    letterSpacing: "0.08em"
  caption:
    fontFamily: Sora
    fontSize: 0.6875rem
    fontWeight: "400"
    lineHeight: "1.4"
rounded:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
    height: 36px
  button-primary-hover:
    backgroundColor: "#16a34a"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
  card-glass:
    backgroundColor: "rgba(255,255,255,0.6)"
    rounded: "{rounded.xl}"
  badge:
    rounded: "{rounded.full}"
    typography: "{typography.label-caps}"
    height: 20px
---

## Overview

**Greenplot** is a living knowledge garden — an off-white, editorial product that feels like a
premium notebook meets a modern SaaS tool. The aesthetic bridges the warmth of printed matter
with the precision of a well-engineered interface.

The design language has two registers:
- **Editorial / display** — Instrument Serif italic for headings and moment-of-delight typography.
  Signals permanence and thoughtfulness. Used for article titles, section labels, and hero text.
- **Functional / UI** — Barlow (body) and Sora (labels, buttons, metadata). Clean, humanist,
  neutral. Never competes with the serif display layer.

The palette is warm neutrals anchored by a single nature-derived green (`#22c55e`). No secondary
accent colors in the UI — green is reserved for primary actions and brand moments only.

## Colors

**Background (`#fafaf8`)** — Warm off-white. Not pure white. The warmth reduces eye strain and
signals that this is a personal, thoughtful tool rather than a corporate dashboard.

**Primary (`#22c55e`)** — Nature green. Used exclusively for CTAs, selected states, and the
Greenplot logo mark. Never used as a background color in the app (only in badges/containers).

**On-surface variant (`#5f5f5a`)** — Secondary text, metadata, timestamps, captions. Warm gray
that reads softly against the off-white background.

**Border (`#e8e6df`)** — Subtle warm-toned dividers. Never pure gray.

## Typography

Three font families, each with a strict role:

**Instrument Serif** (`--font-display`) — The editorial voice. Used for:
- Article titles and wiki headings
- Section headings on key pages
- Any "moment of delight" text (pull quotes, empty-state messages, onboarding)
- Always in italic for the editorial feel (`font-style: italic`)

**Barlow** (`--font-body`) — The body voice. Used for:
- All body copy, descriptions, prose
- Markdown content in seeds and wiki articles
- Form input labels and helper text
- Weights: 300 (light prose), 400 (body), 500 (emphasis), 600 (strong labels)

**Sora** (`--font-ui`) — The UI voice. Used for:
- Button labels
- Navigation items
- Badges, tags, metadata chips
- Numerical readouts and stats
- Uppercase tracking labels (`letter-spacing: 0.08em`)

### Type Scale

Display text uses `clamp()` for fluid scaling. Body and UI text use fixed sizes from the token
scale. Never use sizes smaller than `10px` for any readable content.

### Italic Display Rule

All Instrument Serif headings in the app are italic. This is intentional — the italic form of
the serif is warmer and more personal than the roman, and avoids the stiffness that Roman serif
headings can project in a modern UI.

## Layout

The app is full-bleed with a fixed header. Content areas use a max-width of `672px` (prose) or
`960px` (wide panels) centered with horizontal padding. Bottom safe-area insets are applied to
all scrollable views (PWA requirement for iOS notch devices).

Card grids use `gap-3` (12px) on mobile, `gap-4` (16px) on desktop.

Header height: `56px` (`--header-height: 56px`).

## Elevation & Depth

Greenplot uses a **glass-first** elevation model on the off-white background:

**Level 0 — Surface** — `#fafaf8` base. No elevation.

**Level 1 — Card** — White (`#fff`) with `ring-1 ring-foreground/10`. Standard cards, list items.

**Level 2 — Glass Card** — `rgba(255,255,255,0.6)` with `backdrop-filter: blur(12px)` and
gradient border mask (`.glass-card` utility). Used for panels floating over content, feature
cards, stat widgets.

**Level 3 — Sheet / Modal** — Full white or `#fafaf8` with `box-shadow` drop.

**Glass border technique** — Cards at Level 2+ use a CSS gradient border mask instead of a
plain `border`: a `1px` pseudo-element with a top-bright / bottom-subtle linear gradient gives
the appearance of light hitting a glass edge from above. This is the same technique used on the
landing page's dark glass panels, adapted for a light background.

## Shapes

Consistent radius scale applied by component type:
- **Chips / badges / pills / buttons** → `rounded-full` (9999px)
- **Cards, sheets, drawers** → `rounded-xl` (20px) or `rounded-2xl` (24px)
- **Input fields, selects** → `rounded-lg` (16px)
- **Icon buttons, small controls** → `rounded-md` (12px)
- **Inline code** → `rounded-sm` (8px)

Never use `rounded-none` in the UI. Even system-level chrome uses a minimum of `rounded-sm`.

## Components

### Button — Primary

Green pill. Font: Sora 500. Padding: `10px 20px`. Full-radius. On hover: slight darkening
(`#16a34a`), no translation (translations feel cheap on utility buttons).

### Button — Outline

Transparent background, `border-border`, full-radius pill. Same Sora font. Used for secondary
CTAs alongside a primary.

### Button — Ghost

No border, no background. Hover: `bg-muted`. Used for toolbar actions, icon buttons,
navigation links.

### Card

White background, `rounded-xl`, `ring-1 ring-foreground/10` (replaces `border` — the ring
approach avoids layout shift). Internal padding: `16px`. Card titles use Instrument Serif italic.

### Glass Card (`.glass-card`)

`rgba(255,255,255,0.6)` + `backdrop-filter: blur(12px)` + gradient border mask pseudo-element.
Use for panels that overlay or float above the `#fafaf8` background — stat widgets, feature
detail panels, floating toolbars.

### Badge

Sora 600, `font-size: 10px`, `letter-spacing: 0.08em`, `text-transform: uppercase`,
`rounded-full`. Category badges use the corresponding Material color pair from the token set
(e.g. `primary-container` + `on-primary` for green category, `tertiary-container` + `on-tertiary`
for teal).

## Do's and Don'ts

**Do:**
- Use Instrument Serif italic for any heading that introduces a section or article.
- Use green (`#22c55e`) sparingly — only for primary CTAs, selected/active states, and brand marks.
- Apply the glass card treatment to panels that benefit from visual depth.
- Use `rounded-full` for all interactive chips, tags, and primary/outline buttons.
- Let off-white breathe — generous whitespace is a feature, not waste.

**Don't:**
- Don't use Instrument Serif roman (non-italic) in the app. If it's Instrument Serif, it's italic.
- Don't use green as a background color in the main app (only in `primary-container` tinted chips).
- Don't use Plus Jakarta Sans or Be Vietnam Pro anywhere — they're replaced by the new stack.
- Don't use `border` for card outlines — use `ring-1 ring-foreground/10` to avoid layout shift.
- Don't use font sizes below `10px` for any meaningful text.
- Don't add drop shadows to cards on the off-white background — they feel heavy; use rings instead.
