# PWA Quality Initiative — UX Cleanup & Bug Fix Plan

**Date:** 2026-04-04
**Status:** Proposed
**Priority:** High

## Problem

The PWA works but has accumulated significant UX debt and hidden bugs. Freddy reports:
- News update not showing on login (fixed — ActivitySummary added to empty state + JSX parse error fix)
- Can't enable push notifications (fixed — idempotent SW registration, clearer error handling)
- Can't save location in Settings (fixed — added /api/profile proxy route)
- General feeling of "still lots of bugs"

## Bug Audit (Confirmed + Suspected)

### Fixed in This Session
| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | Activity Summary not visible on login | Only in `messages.length > 0` branch | Added to empty state |
| 2 | Build crashed `Expected '</', got ')'` | Extra `)` at messages.map closing line | Removed stray `)` |
| 3 | Push notifications silent failure | SW re-registration + no permission check | Idempotent registration |
| 4 | Location save 404 | Missing Next.js API proxy route | Created /api/profile |
| 5 | Biweekly Challenge `AttributeError: 'str' object has no attribute 'choices'` | LLM response type mismatch | Added isinstance check |

### Needs Investigation (High Confidence)
| # | Bug/Symptom | Likely Cause |
|---|-------------|-------------|
| 6 | Wiki articles sometimes show raw source dumps (fallback) instead of LLM-synthesized content | OpenRouter rate limiting (qwen 429s), fallback template is too visible |
| 7 | Garden page may show empty grid if Weaviate query fails | No error boundary / retry on Garden page |
| 8 | Chat may show stale cached messages on first load | localStorage restore fires before auth token loads |
| 9 | Settings — Calendar Connect shows wrong state after disconnect | No re-fetch of calendar status after disconnect |
| 10 | "What's New" dismiss persists across tabs but not across page reloads within 4h | Uses localStorage but key logic may not account for tab sync |

### Needs Investigation (Medium Confidence)
| # | Bug/Symptom | Likely Cause |
|---|-------------|-------------|
| 11 | Chat input area covers last message on mobile | `pb-24` padding insufficient for all screen sizes |
| 12 | Wiki article view renders markdown inconsistently | No unified markdown renderer (GFM vs CommonMark edge cases) |
| 13 | D3 concept map overlaps with article text | Fixed positioning conflict with responsive breakpoint |
| 14 | Voice memo may not appear in Seeds if voice_to_seeds.py errors | No error retry or dead letter queue |

## UX Quality Issues

### 1. No Global Error Boundaries
If any component crashes, the whole page goes white. Need `<ErrorBoundary>` wrappers around:
- Chat conversation tree
- Garden grid
- Wiki article renderer
- Settings page sections

### 2. No Loading States (Skeleton UI)
Pages are either blank or fully loaded. Need skeleton screens for:
- Garden grid (cards loading)
- Wiki article list (cards loading)
- Settings page (profile loading)
- Sources list (links loading)

### 3. Toast Overload
Multiple `toast()` calls stack on top of each other. Need:
- Toast grouping ("3 links added" instead of 3 toasts)
- Non-blocking toasts for background actions (enrichment)
- Persistent error toasts with retry buttons

### 4. No Offline Handling
PWA has a service worker but no meaningful offline UX:
- No "You're offline" banner
- No cached fallback for Garden/Chat
- Push notification poll silently fails

### 5. Inconsistent Navigation
- Bottom nav has 4 items (Chat, Garden, Sources, Wiki) but some pages (Settings, Onboarding) aren't accessible from nav
- No "back" navigation within deep views (seed detail → related seeds)
- No persistent state: refreshing Garden page resets scroll/filter

## Proposed Architecture Changes

### 1. Global Error Boundary Layer
```tsx
// src/components/error-boundary.tsx
// Wraps each route in app/ directory
// Catches crashes → shows friendly error + "Try again" button
// Reports to cron job knowledge base for tracking
```

### 2. Toast Manager
```tsx
// src/lib/toast-manager.ts
// Groups toasts by type (success, error, info) with debounce
// Max 2 toasts on screen at once, rest queue
// Persistent error toasts with action buttons
```

### 3. Skeleton Component Library
```tsx
// src/components/skeleton/
// GardenSkeleton, WikiSkeleton, SourceSkeleton, SettingsSkeleton
// Used as: {loading ? <GardenSkeleton /> : <GardenGrid />}
```

### 4. Offline Banner
```tsx
// src/components/offline-banner.tsx
// Checks navigator.onLine + shows banner
// Dismissible, auto-hides when connection restored
// Caches failed API calls and retries on reconnect
```

## Prioritization Matrix

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| P0 | Error boundaries for Chat + Garden | 2h | High — prevents white screens |
| P0 | Toast manager (debounce + grouping) | 3h | High — reduces visual noise |
| P1 | Skeleton loading states | 4h | Medium — perceived performance |
| P1 | Offline handling (banner + retry) | 3h | Medium — reliability |
| P1 | Navigation consistency (back + tabs) | 3h | Medium — daily usability |
| P2 | Wiki markdown renderer fix | 2h | Low — only affects Wiki views |
| P2 | D3 layout fix (overlap) | 1h | Low — cosmetic |
| P2 | Voice memo dead-letter queue | 4h | Low — rare edge case |

## Implementation Approach

### Phase 1: Stabilize (This Week)
1. Wrap Chat and Garden in `<ErrorBoundary>`
2. Add toast grouping — merge same-type toasts within 2s window
3. Fix the 5 confirmed bugs from this session's audit
4. Add loading skeletons to Garden and Wiki pages

### Phase 2: Polish (Next Week)
1. Offline banner + retry queue
2. Navigation back buttons for deep views
3. Fix remaining 8 medium-confidence bugs
4. Settings page: proper re-fetching after state changes

### Phase 3: Resilience (Following Week)
1. Voice memo retry queue
2. Consistent markdown rendering across all components
3. Layout stress-testing (all breakpoints, all themes)
4. Bug report flow: "shaky" button → screenshot + bug report to Notion

## Success Metrics

| Metric | Current | Target (Phase 1) | Target (Phase 3) |
|--------|---------|-------------------|-------------------|
| White-screen crashes | Unknown but frequent | 0 for Chat + Garden | 0 across all routes |
| Visible bug reports from Freddy | Multiple per session | < 2 per week | < 1 per week |
| Toast stacking incidents | Common | Eliminated | Eliminated |
| Perceived page load speed | "Flash then populate" | < 300ms skeleton | < 200ms skeleton |
| Offline UX | Broken (blank page) | Banner + cached data | Full offline read mode |
