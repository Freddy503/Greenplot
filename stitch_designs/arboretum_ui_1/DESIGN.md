```markdown
# Design System Specification: The Digital Greenhouse

## 1. Overview & Creative North Star
This design system is built on the Creative North Star of **"The Digital Greenhouse."** 

We are moving away from the cold, clinical aesthetic of traditional AI interfaces. Instead, we treat information as living matter that needs to be nurtured. The goal is to move beyond the "template" look by utilizing intentional asymmetry, organic layering, and high-contrast typography scales. 

In this system, we reject the rigid grid in favor of "breathing layouts." Elements should feel like they have settled naturally onto the screen rather than being forced into boxes. We achieve a premium, editorial feel by prioritizing white space as a functional element—giving ideas room to grow.

---

## 2. Colors & Surface Philosophy
The palette is rooted in a lush, emerald core, supported by earthy neutrals and sun-drenched accents.

### The "No-Line" Rule
**Standard 1px solid borders are strictly prohibited for sectioning.** Boundaries must be defined solely through background color shifts or subtle tonal transitions. For example, a `surface-container-low` section should sit directly against a `surface` background to create a soft, sophisticated edge without the "cheapness" of a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of fine vellum.
- **Base:** `surface` (#f0fdf4)
- **Deepest Depth:** `surface-container-low` (#e8f7ed)
- **Highest Elevation:** `surface-container-highest` (#cfe8da)
- **Interactive Floating:** `surface-container-lowest` (#ffffff)

### The "Glass & Gradient" Rule
To ensure the interface feels "alive," use Glassmorphism for floating action buttons (FABs) or navigation overlays. Use the `surface-tint` (#006d4a) at 10% opacity with a `24px` backdrop-blur. 

**Signature Texture:** Main CTAs or Hero headers should utilize a subtle linear gradient (Top-Left to Bottom-Right) transitioning from `primary` (#006d4a) to `primary-container` (#69f6b8) at 15% opacity to provide a luminous, "backlit" effect.

---

## 3. Typography
Our typography pairing balances the geometric authority of *Plus Jakarta Sans* with the approachable warmth of *Be Vietnam Pro*.

- **Display & Headlines (Plus Jakarta Sans):** These are the "statement" elements. Use `display-lg` (3.5rem) with negative letter-spacing (-0.02em) to create a high-fashion, editorial impact. This conveys the "inspiring" nature of a second brain.
- **Titles & Body (Be Vietnam Pro):** These are the "functional" elements. `body-lg` (1rem) provides a friendly, legible experience for long-form creative thought.
- **Labels (Be Vietnam Pro):** Use `label-md` for metadata. Keep these in `on-surface-variant` (#4e6459) to maintain a soft hierarchy.

---

## 4. Elevation & Depth
We convey importance through **Tonal Layering**, not shadows.

- **The Layering Principle:** Place a `surface-container-lowest` (#ffffff) card on a `surface-container-low` (#e8f7ed) section. This creates a soft, natural lift that mimics paper under sunlight.
- **Ambient Shadows:** Only use shadows for "Floating" states (like a bottom sheet). Shadows must be diffused: `0px 20px 40px` with a 6% opacity using the `on-surface` (#21372d) color. Never use pure black shadows.
- **The "Ghost Border" Fallback:** If accessibility requires a stroke (e.g., in high-contrast mode), use the `outline-variant` (#9fb8aa) token at **15% opacity**. 100% opaque borders are forbidden.
- **The Seed Motif:** Use the `xl` (3rem) or `full` (9999px) roundedness tokens to create "seed-shaped" containers for imagery or icons, reinforcing the organic growth theme.

---

## 5. Components

### Buttons
- **Primary:** High-saturation `primary` (#006d4a) with `on-primary` (#e6ffee) text. Use `xl` (3rem) corner radius.
- **Secondary:** `secondary-container` (#b1fedc) with `on-secondary-container` (#11644b).
- **Tertiary:** No background. Use `primary` text. These should be placed with generous `spacing-6` (2rem) padding to feel intentional.

### Cards & Lists
- **The Rule:** **No divider lines.** 
- Separate list items using `spacing-3` (1rem) vertical gaps or by alternating backgrounds between `surface` and `surface-container-low`. 
- **Cards:** Always use `lg` (2rem) or `xl` (3rem) corner radius. Cards should never have a border; they should rely on the `surface-container` shifts for definition.

### Input Fields
- Avoid the "box" look. Use `surface-container-highest` (#cfe8da) as a background with a `md` (1.5rem) corner radius. 
- When focused, transition the background to `surface-container-lowest` (#ffffff) and apply a subtle `primary` (#006d4a) "Ghost Border" at 20% opacity.

### The "Nurture" Progress Bar
Specialized for an AI assistant. Use a thick `12px` bar with `full` (9999px) radius. The background is `surface-variant` (#cfe8da) and the progress fill is a gradient from `primary` to `inverse_primary`.

---

## 6. Do's and Don'ts

### Do:
- **Asymmetric Margins:** Use `spacing-8` (2.75rem) on the left and `spacing-4` (1.4rem) on the right for certain header blocks to create a custom, avant-garde feel.
- **Large Radius:** Default to `xl` (3rem) for any container that holds content.
- **Tinted Neutrals:** Always use the green-tinted neutrals (`surface`, `surface-dim`) rather than "true" greys to maintain the garden vibe.

### Don't:
- **No Sharp Corners:** Never use a radius smaller than `sm` (0.5rem). Even small buttons should be `xl`.
- **No Industrial Shadows:** Avoid any shadow that feels "heavy" or "dirty." If it's not soft and ambient, remove it.
- **No Flat Lists:** Avoid long, dense lists of text without "breathing room" (use at least `spacing-4` between items).
- **No Hard Dividers:** Never use a `#CCCCCC` 1px line to separate content. Use whitespace or color-blocking instead.

---

## 7. Signature Motifs
To bridge the gap between AI and Nature, use the **"Seed" shape** (a rectangle with two opposite corners at `xl` and two at `full`) for profile avatars and feature icons. This creates a signature visual language that is unique to this design system.```