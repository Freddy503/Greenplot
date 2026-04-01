# Digital Greenhouse Design System (from Google Stitch)

## Colors (Dark Mode — active design)
```css
--background: #111412;
--surface: #111412;
--surface-container: #1f211f;
--surface-container-low: #1a1c1a;
--surface-container-high: #232623;
--surface-container-highest: #2e312e;
--primary: #10B981;
--on-primary: #003825;
--on-surface: #e1e3df;
--on-surface-variant: #9fb8aa;
--tertiary: #ffb84d;
--on-tertiary: #482a00;
--tertiary-container: #fea619;
--outline-variant: #3f4943;
```

## Typography
- Font: Plus Jakarta Sans (all weights)
- Headlines: `font-extrabold`, `tracking-tight`
- Body: `font-medium`, `leading-relaxed`

## Shape Rules
- ALL border-radius: `9999px` (pill shape everywhere)
- Buttons, inputs, cards, nav — everything is pill-shaped
- NO square corners anywhere

## Chat Design
- User bubble: `surface-container-high`, pill-shaped (2rem 2rem 0.25rem 2rem)
- Assistant bubble: `primary` bg, `on-primary` text, (0.25rem 2rem 2rem 2rem)
- Action buttons below AI: pill-shaped grid (Create image, Explore, Add to seed, Rate)
- Input: pill-shaped container with attach + mic + send button
- Bottom nav: pill-shaped active tab with primary/10 bg

## Onboarding
- Welcome: Seed motif (rounded-full container), glass-morphism floating icon, amber CTA
- Progress: thin line, fixed bottom, green gradient
- All inputs: pill-shaped
- Chips: pill-shaped
