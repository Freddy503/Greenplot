# Digest Scheduling & Calendar Integration

**Date**: 2026-03-29  
**Source**: Voice memo  
**Priority**: Medium — post‑onboarding feature

---

## User Control
After connecting Google Calendar, users can set:

- **Frequency**: 
  - Once daily
  - Twice daily
  - Weekly
  - Biweekly
- **Time**: Specific time(s) for delivery (e.g., 08:00 and 20:00 for twice daily)
- **Smart scheduling** (optional): Base delivery times on calendar availability (avoid busy slots)

---

## Implementation
- Store user preferences in `users` table: `digest_frequency` (enum), `digest_times` (JSON array), `smart_schedule` (bool)
- Cron job runs at min intervals, checks each user's preferences and calendar (if smart), and triggers `/spark` or `/briefing` accordingly
- User can edit preferences in Settings UI

---

## UI
Settings page:
- [ ] Enable daily digest at 08:00
- [ ] Enable evening digest at 20:00
- [ ] Smart scheduling based on my calendar (requires calendar access)
- Save button

---

**Next**: Build after core MVP stable.
