# Asset Credits & Provenance

Record of third-party and AI-generated assets used in Greenplot, so origin
and license status stay traceable.

## Landing page hero video — `public/hero-garden.mp4`

- **What**: the 12-second cinematic loop behind the landing hero.
- **Generated with**: [Higgsfield AI](https://higgsfield.ai) (AI video
  generation) under Frederick Künstler's account, on **2026-03-14 13:17**.
- **Original asset**:
  `https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4`
  (Higgsfield's CDN — previously hot-linked; localized 2026-06-13 so the
  hero doesn't depend on a third-party CDN keeping user assets alive).
- **Processing**: re-encoded with ffmpeg (`scale=1280:-2`, x264 CRF 28,
  audio stripped, faststart) — 14.1 MB → 0.74 MB, same 12.04s duration.
- **License**: AI-generated content under Higgsfield's terms of service for
  account holders (commercial use per their plan terms — re-verify the plan's
  terms if usage scales beyond the landing page).

## Fonts

- **Instrument Serif, Barlow, Sora** — Google Fonts, OFL (SIL Open Font
  License), loaded via `next/font`.

## Icons

- **Lucide** — ISC license (`lucide-react` + inlined path data in
  `src/components/onboarding/gp-icons.ts` from the design handoff).
