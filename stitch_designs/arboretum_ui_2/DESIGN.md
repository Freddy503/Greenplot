# Design System Specification: The Digital Greenhouse

## 1. Creative North Star: "The Living Laboratory"
This design system moves beyond the static nature of traditional fintech or crypto dashboards. We are creating a "Digital Greenhouse"—a space that feels high-tech and precise (Technical) yet breathes with organic fluidity (Natural). 

The goal is to move away from "Modular Box" design. Instead of placing content in rigid, bordered containers, we treat the UI as a series of interconnected, light-refracting surfaces. We leverage heavy roundedness and tonal depth to simulate growth and premium craftsmanship.

**The Signature Feel:**
*   **Asymmetry over Grids:** Use off-center hero alignments and overlapping "Glass" cards to break the template look.
*   **Atmospheric Depth:** Rely on color shifts rather than lines.
*   **Intentional Friction:** High-contrast accent placement (Orange) to guide the eye precisely where action is required.

---

## 2. Color & Atmospheric Surface Rules

### The Palette
We utilize a deep, "compost" dark base with bioluminescent accents.

*   **Primary (Growth):** `#69f6b8` (Primary) & `#06b77f` (Container). This is our life force. Use it for progress, success, and primary navigation.
*   **Secondary (Pollination):** `#f8a010` (Secondary) & `#855300` (Container). This vibrant orange is a "stinger." Use it sparingly for critical CTAs, active states, and high-energy highlights.
*   **Neutral (The Soil):** Base background starts at `#01120b`.

### The "No-Line" Rule
**Strict Mandate:** 1px solid borders for sectioning are prohibited. 
Structural boundaries must be defined solely through background color shifts. To separate a sidebar from a main feed, use `surface-container-low` against the base `surface`. This creates a sophisticated, "molded" look rather than a "sketched" one.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of semi-translucent materials.
*   **Level 0 (Earth):** `surface` (#01120b) - The foundation.
*   **Level 1 (Substrate):** `surface-container-low` (#021710) - Large layout sections.
*   **Level 2 (Leaf):** `surface-container` (#051e15) - Standard cards and interactive modules.
*   **Level 3 (Bloom):** `surface-container-highest` (#0d2b21) - Hover states or "pop-out" information.

### The Glass & Gradient Rule
To achieve a "Premium Technical" feel, main CTAs should never be flat. Use a linear gradient: `primary` (#69f6b8) to `primary-container` (#06b77f) at a 135° angle. 
For floating overlays (Modals, Tooltips), apply **Glassmorphism**:
*   **Fill:** `surface-bright` at 60% opacity.
*   **Backdrop Blur:** 20px to 40px.
*   **Result:** The background emerald tones "bleed" through, creating an integrated, high-end feel.

---

## 3. Typography: Editorial Precision
We use **Plus Jakarta Sans** not as a standard sans-serif, but as an editorial tool.

*   **Display (The Statement):** `display-lg` (3.5rem) should be used with tight letter-spacing (-0.04em). Reserve this for "Hero" moments where the tech meets the vision.
*   **Headline & Title:** Use `headline-md` (1.75rem) for section headers. Always pair these with generous top-padding to let the "greenery" breathe.
*   **Labels:** `label-md` (0.75rem) should be used in all-caps with increased letter-spacing (+0.05em) when used for metadata or category tags.

**Hierarchy Strategy:** 
Use `on-surface` (#e4fcf0) for high-importance text and `on-surface-variant` (#9ab0a5) for supporting body copy. This 20% drop in contrast creates a natural focal point without using bold weights.

---

## 4. Elevation & Depth: Tonal Layering

### The Layering Principle
Depth is achieved through the "Stack." A card (`surface-container-lowest`) placed on a section (`surface-container-low`) creates an inset, natural shadow-less lift.

### Ambient Shadows
Shadows are rarely used. When necessary (e.g., a floating secondary CTA or a dropdown), use a "Botanical Shadow":
*   **Color:** `#000000` at 40% opacity.
*   **Blur:** 40px to 60px.
*   **Spread:** -10px (to keep the shadow "tucked" under the element).
*   **Tone:** The shadow must feel like it’s sinking into the dark green background, not sitting on top of a grey sheet.

### The Ghost Border Fallback
If a border is required for accessibility (e.g., Input Fields), use a **Ghost Border**:
*   **Token:** `outline-variant` (#384c43) at 15% opacity.
*   **Weight:** 1.5px (slightly thicker but softer).

---

## 5. Components

### Buttons (The Seed & The Bloom)
*   **Primary:** Full roundness (`9999px`). Gradient fill (Primary to Primary-Container). Text color: `on-primary` (#005a3c).
*   **Secondary (Highlight):** Full roundness. Solid `secondary` (#f8a010). Use this for "Invest," "Buy," or "Launch" to provide an energetic counterpoint to the green.
*   **Tertiary:** No background. `on-surface` text with a subtle `primary` icon.

### Inputs & Fields
*   **Body:** `surface-container-highest` background.
*   **Shape:** `1rem` (md) roundedness.
*   **State:** On focus, the "Ghost Border" becomes 100% opaque `primary`.

### Cards & Lists
*   **Prohibition:** No divider lines between list items.
*   **Separation:** Use a `1.4rem` (4) spacing gap or a subtle background shift (alternating `surface-container-low` and `surface-container-lowest`).

### Specialized Component: The "Growth Monitor" (Chart/Graph)
*   **Style:** Use "glow-paths." Lines should be `primary` with a 4px outer glow of the same color. Area fills should be a gradient from `primary` (20% opacity) to transparent.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical margins (e.g., 80px left, 40px right) in hero sections to create a custom, high-end editorial feel.
*   **Do** use `full` roundness for all interactive elements to maintain the "organic" aesthetic.
*   **Do** use the Orange (`secondary`) sparingly—it is the "flower" in the greenhouse; too much of it ruins the serenity.

### Don't:
*   **Don't** use pure white (#FFFFFF). It breaks the immersion of the "Digital Greenhouse." Use `on-surface` (#e4fcf0) instead.
*   **Don't** use 90-degree corners. Everything must feel tumbled, like river stones.
*   **Don't** use standard "Drop Shadows" from default UI kits. They feel "dry" and "dusty" against our vibrant emerald palette.