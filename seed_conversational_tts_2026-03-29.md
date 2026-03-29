# Conversational Voice Interface & Cheap TTS

**Date**: 2026-03-29  
**Source**: Voice memo  
**Priority**: Low (post‑MVP)

---

## Vision
Toggle into a fully conversational mode where the AI agent feels like a natural spoken dialogue partner — "wavy" feeling, low‑latency, expressive.

---

## Constraints
- ElevenLabs is too expensive for mass usage
- Need a **cheaper/free** TTS alternative that still sounds natural and supports real‑time streaming

---

## Options to Explore
- **Piper** (open‑source, local, fast, decent quality)
- **Coqui TTS** (open, self‑hosted)
- **Google TTS** (free tier, robotic but usable)
- **NVIDIA NeMo TTS** (if we have GPU)
- **OpenAI TTS** (affordable at scale? ~$0.015/1K chars)
- **Web Speech API** (`speechSynthesis`) — built‑in, free, limited voices but okay for MVP

---

## MVP Approach
- Use browser's `speechSynthesis` for TTS in the PWA (free, no API key)
- Add a "talk to me" toggle that reads assistant responses aloud
- Later, upgrade to a streaming TTS endpoint if more naturalness needed

---

## Future
- Full duplex voice chat (push‑to‑talk or always‑listening)
- Low‑latency streaming TTS with natural cadence
- Voice personas (different tones for beginner/expert)
