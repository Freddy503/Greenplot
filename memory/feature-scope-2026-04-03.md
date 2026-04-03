# Feature Scoping — 2026-04-03

## Feature 1: Cron Cadence Selector (Onboarding)

### What
A new onboarding step (or enhancement to Step 3 "Nurture") where users pick their preferred cron cadence and see a preview of what they'll receive.

### UX Flow
- **Location:** Replace/expand Step 3 (currently digest frequency only)
- **UI:** Two-column layout:
  - Left: Cadence selector (radio cards like current digest options)
  - Right: Live preview panel showing which cron jobs map to that cadence
- **Cadence tiers:**
  - `twice-daily` — Morning Spark (8 AM) + Evening Reflection (8 PM)
  - `once-daily` — Daily Briefing (9 AM)
  - `bi-weekly` — Mid-week Digest (Wed) + Weekend Review (Sun)
  - `weekly` — Weekly Roundup (Sunday 10 AM)
  - `manual` — No auto-cron; user triggers from settings
- **Preview panel:** Shows a mini timeline of when cron drops will fire, with job names and brief descriptions

### Components Needed
| Component | Location | Notes |
|-----------|----------|-------|
| `CronCadenceCard` | `src/components/onboarding/cron-cadence-card.tsx` | Radio card with cadence label, sublabel, icon |
| `CronPreviewPanel` | `src/components/onboarding/cron-preview-panel.tsx` | Timeline preview of jobs for selected cadence |
| `StepCronCadence` | Part of `onboarding/page.tsx` | New step or merge into Step 3 |

### API / Backend Needs
- **New endpoint:** `POST /api/cron/preferences` — Save user's cadence preference to backend
  - Body: `{ tenant_id, cadence: 'twice-daily' | 'once-daily' | 'bi-weekly' | 'weekly' | 'manual' }`
  - Backend stores in user profile / tenant config
- **Backend cron setup:** Map cadence → actual cron jobs on the OpenClaw side
  - This is backend/infra work — the backend needs to schedule OpenClaw cron jobs per tenant based on cadence

### Data Model
```typescript
interface CronPreferences {
  cadence: 'twice-daily' | 'once-daily' | 'bi-weekly' | 'weekly' | 'manual'
  timezone: string // auto-detected from browser
  preferredTime: string // "09:00" format
  enabledJobs: string[] // ['morning_spark', 'daily_briefing', ...]
}
```

### Effort Estimate
- Frontend: ~1 day (new step, preview component, API wiring)
- Backend: ~0.5 day (save preference endpoint + cron job mapping)

---

## Feature 2: "Create Image" Button (Reflections) — BFL/FLUX

### What
After a user submits a reflection/mental thought, show a contextual "Create Image" button that generates a FLUX visualization via Black Forest Labs.

### Trigger Conditions
- **ONLY** appears on messages classified as reflections/mental thoughts
- Detection heuristic:
  - User message contains reflective language ("I feel like...", "I've been thinking...", "what if...", "I wonder...")
  - OR message is tagged as `source: 'reflection'` (if we add a reflection mode to the input)
  - OR message length > 100 chars with low question density (not a Q&A)
- **NOT** on: regular questions, commands, short messages, web searches

### UX Flow
1. User sends a reflective message → AI responds normally
2. Below the AI response, show a subtle "✨ Visualize this idea" button
3. Click → call BFL API (async: submit → poll → get image URL) → show generated image inline in chat
4. Image appears as a new assistant message with the generated image
5. Optional: "Add to Garden" button on the generated image

### Components Needed
| Component | Location | Notes |
|-----------|----------|-------|
| `CreateImageButton` | `src/components/ai-elements/create-image-button.tsx` | Contextual button, appears below reflection responses |
| Image display | Within `MessageContent` | Render FLUX images inline |

### API / Backend Needs
- **New endpoint:** `POST /api/images/generate`
  - Body: `{ prompt: string, context?: string, width?: number, height?: number }`
  - Backend calls BFL API:
    1. `POST https://api.bfl.ai/v1/flux-2-pro` with `{ prompt, width: 1024, height: 1024 }`
    2. Auth: `x-key: ${BFL_API_KEY}` header
    3. Poll `GET https://api.bfl.ai/v1/get_result?id=<task_id>` until `status === "Ready"`
    4. Return `{ url: sample_url, revised_prompt }`
  - Returns: `{ url: string, revised_prompt: string }`
- **BFL API key** already in `openclaw-api/.env` → `BFL_API_KEY=<BFL_API_KEY>`
- **Model:** FLUX.2 [pro] — good quality/speed balance for interactive use
- **Reflection detection:** Add a lightweight classifier or keyword check in the chat route
  - Option A: Frontend heuristic (fast, imperfect)
  - Option B: Backend classifies during chat processing and includes a `is_reflection: true` flag in the SSE stream

### Data Flow
```
User message → [reflection check] → AI responds → [if reflection] → show button
                                                                    ↓
Button click → POST /api/images/generate → BFL FLUX.2 → image URL → render inline
```

### Effort Estimate
- Frontend: ~0.5 day (button + image rendering + loading state for async BFL)
- Backend: ~0.5 day (BFL proxy endpoint with async polling + reflection detection)
- BFL cost: ~$0.025/image (FLUX.2 [pro], 1024x1024)

---

## Feature 3: "Add to Garden" Button (Long Discussions)

### What
After a substantive conversation, surface an "Add to Garden" button that lets the user save key insights to their Idea Garden.

### Trigger Conditions
- Conversation has been going on for a while (threshold-based):
  - ≥ 6 messages (3 exchanges) AND
  - At least one of:
    - Web search tool was used
    - Message contains research/knowledge content
    - A reflection occurred
    - Total conversation word count > 500
- **NOT** on: short Q&A, greetings, simple commands
- Show once per conversation (not spammy), maybe with a cooldown

### UX Flow
1. After threshold is met → show a floating or inline "🌱 Add to Garden" button
2. Click → opens a sheet/modal with:
   - Auto-generated summary of the conversation's key insights
   - User can edit/deselect points
   - "Save to Garden" CTA
3. On save → seeds are created in Weaviate via existing seed creation API
4. Toast confirmation: "3 seeds planted in your garden 🌱"

### Components Needed
| Component | Location | Notes |
|-----------|----------|-------|
| `AddToGardenButton` | `src/components/ai-elements/add-to-garden-button.tsx` | Contextual floating/inline button |
| `GardenHarvestSheet` | `src/components/ai-elements/garden-harvest-sheet.tsx` | Sheet/modal for reviewing + saving insights |

### API / Backend Needs
- **New endpoint:** `POST /api/chat/harvest` — Analyze conversation and extract seed-worthy insights
  - Body: `{ messages: Message[], session_id?: string }`
  - Returns: `{ seeds: Array<{ title: string, content: string, domain: string, tags: string[] }> }`
- **Use existing:** `POST /api/thoughts` or `POST /api/seeds` to actually create the seeds
- **Conversation state tracking:**
  - Frontend tracks message count, tool usage, word count
  - When thresholds are met → show button
  - Track `hasShownGardenButton` to avoid re-showing

### Data Flow
```
Messages accumulate → [threshold check on frontend] → show button
                                                        ↓
Click → POST /api/chat/harvest → LLM extracts insights → show preview sheet
                                                        ↓
User confirms → POST /api/seeds (bulk) → seeds created → toast
```

### Effort Estimate
- Frontend: ~1 day (button logic + harvest sheet UI)
- Backend: ~1 day (harvest endpoint with LLM extraction)

---

## Feature 4: Google Calendar Integration

### What
Connect Google Calendar to make cron timing intelligent and feed calendar context into conversations.

### Use Cases
1. **Smart cron timing** — Deliver notifications/cron drops only during calendar gaps (free time), not mid-meeting
2. **Calendar-aware conversations** — Upcoming meetings, deadlines, travel plans surface as context in chat
3. **Morning Spark enrichment** — Briefing includes today's schedule, next commitments, travel alerts

### UX Flow
- **Connection:** "Connect Google Calendar" button in onboarding (Step 5) or Settings
- **OAuth:** Standard Google OAuth2 flow → store refresh token
- **Permissions:** Read-only calendar access
- **In chat:** Subtle calendar context appears when relevant (e.g., "You have a meeting in 30min")
- **In Morning Spark:** Daily schedule overview included in briefing

### Components Needed
| Component | Location | Notes |
|-----------|----------|-------|
| `ConnectCalendarButton` | `src/components/settings/connect-calendar.tsx` | OAuth trigger |
| Calendar context chip | In chat `MessageContent` | Inline "📅 Meeting in 20min" |

### API / Backend Needs
- **New endpoint:** `GET /api/calendar/auth` — Initiate Google OAuth2 flow
- **New endpoint:** `POST /api/calendar/callback` — Handle OAuth callback, store tokens
- **New endpoint:** `GET /api/calendar/free-busy` — Check free/busy for cron scheduling
- **New endpoint:** `GET /api/calendar/events` — Fetch upcoming events for context
- Backend cron scheduler queries calendar before firing jobs — skip if user is busy, defer to next free slot
- Calendar events injected as context into Morning Spark generation

### Data Model
```typescript
interface CalendarConnection {
  provider: 'google'
  refreshToken: string // encrypted
  timezone: string
  lastSynced: string
  enabled: boolean
}
```

### Effort Estimate
- Frontend: ~1 day (OAuth flow, settings UI, context chips)
- Backend: ~2 days (OAuth, free/busy API, cron integration)
- Dependencies: Google Cloud project, OAuth consent screen

---

## Feature 5: Morning Spark — Location-Aware Weather

### What
Use the city from onboarding (Step 1 "Roots") to show local weather in Morning Spark cron drops.

### Implementation
- City already stored in `OnboardingProfile.city` during onboarding
- Morning Spark cron job reads user's city → passes to weather API → includes in briefing
- No new UI needed — just enriches existing Morning Spark content

### Backend Needs
- Morning Spark generation reads `profile.city` from user config
- Calls weather API (wttr.in or Open-Meteo, no key needed) with city name
- Formats as: "☀️ 22°C in Munich — clear skies today"

### Effort Estimate
- Backend only: ~2 hours (read city, call weather API, inject into prompt)

---

## Summary & Prioritization

| Feature | Frontend | Backend | Total | Dependencies |
|---------|----------|---------|-------|-------------|
| 1. Cron Cadence | 1 day | 0.5 day | 1.5 days | Backend cron infra |
| 2. Create Image | 0.5 day | 0.5 day | 1 day | BFL API key (already have) |
| 3. Add to Garden | 1 day | 1 day | 2 days | Harvest LLM logic |
| 4. Google Calendar | 1 day | 2 days | 3 days | Google OAuth project |
| 5. Location Weather | — | 2 hrs | 2 hrs | City from onboarding |

**Suggested order:** 5 → 2 → 1 → 3 → 4
- Feature 5 is trivial (2 hrs backend only)
- Feature 2 is quickest visual win
- Feature 1 builds on existing onboarding
- Feature 3 is highest long-term value but more complex
- Feature 4 is biggest lift (OAuth + calendar integration)
