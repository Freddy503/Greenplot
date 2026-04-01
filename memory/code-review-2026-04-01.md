# Seedify Agent System — Deep Code Review
**Date:** 2026-04-01
**Reviewer:** Subagent

---

## CRITICAL — Bugs that will cause user-visible failures

### 1. Session persistence saves NOTHING useful
**File:** `openclaw-api/app/main.py` (~line 700)
**Severity:** Critical — data loss

After the agent loop finishes, the endpoint persists only the *last user prompt* as a single message:

```python
session_messages = [_Msg.user(last_prompt)] if last_prompt else []
store.save(session_id=session_id, messages=session_messages, ...)
```

The `SeedifyAgent` builds a full `Session` object internally with all messages (user, assistant, tool results), but this session is **never returned** from `agent.run()`. The method is an `AsyncGenerator` that yields events — the session is a local variable inside `run()` and is discarded.

**Impact:** Every "load session" restores at most one message. Conversation history is lost between page reloads. Users will see empty sessions.

**Fix:** Either return the session from the generator (e.g. as a final yield), or have the agent mutate a shared session object. The simplest fix: capture events in the `generate()` coroutine and reconstruct messages, or pass a session ref into `agent.run()`.

---

### 2. Subagent LLM calls will always fail (empty API key)
**File:** `openclaw-api/app/agent/setup.py` (line 215)
**Severity:** Critical — sub-agents broken

```python
runner = SubagentRunner(
    registry=registry,
    api_key="",  # Set at runtime
    model="anthropic/claude-sonnet-4",
)
```

`SubagentRunner` passes `self.api_key` to `SeedifyAgent.__init__(api_key=...)`. Since it's always `""`, every sub-agent call will hit OpenRouter with `Authorization: Bearer ` (empty), which returns 401.

**Fix:** Pass the real key at setup time. In `main.py`, the setup call should be:
```python
runner = SubagentRunner(registry=registry, api_key=settings.OPENROUTER_API_KEY, ...)
```

---

### 3. Duplicate `status` key in `spawn_subagent` return JSON
**File:** `openclaw-api/app/agent/subagents.py` (`create_subagent_tool_spec`, ~line 290)
**Severity:** Medium — silent data loss

```python
return json.dumps({
    "status": "ok",
    "agent_id": manifest.agent_id,
    "name": manifest.name,
    "subagent_type": manifest.subagent_type,
    "status": manifest.status,  # overwrites "ok"
    "message": ...,
})
```

Python's `json.dumps` serializes the last value for duplicate keys. The response always returns `"status": "running"` instead of `"status": "ok"` indicating the spawn succeeded. Consumers see `running` as both the success indicator and the lifecycle status — confusing.

**Fix:** Rename one key (e.g., `"spawn_status": "ok"`).

---

### 4. Hook messages duplicated for WARN outcomes
**File:** `openclaw-api/app/agent/hooks.py` (`_run_hooks`, ~line 210)
**Severity:** Medium — confusing UI

```python
if outcome.message:
    messages.append(outcome.message)       # ← appends all messages (allow, deny, warn)

if outcome.kind == HookOutcomeKind.WARN and outcome.message:
    messages.append(outcome.message)       # ← appends warn messages AGAIN
```

Every WARN hook appends its message to `messages` twice. These messages surface as `AgentEvent.status("Hook: {msg}")` in the stream — the user sees duplicated status lines.

**Fix:** Remove the second append, or change the first to `if outcome.kind != HookOutcomeKind.WARN`.

---

## HIGH — Issues causing degraded UX

### 5. Vercel Hobby timeout will abort long responses
**File:** `src/app/api/chat/route.ts` (line 3, line 8)
**Severity:** High — intermittent failures

```typescript
export const maxDuration = 60 // Vercel Hobby = 10s effective, Pro = 60s+
const BACKEND_TIMEOUT_MS = 8000
```

Vercel Hobby plan caps serverless functions at **10 seconds**. `maxDuration = 60` is silently ignored. The 8s backend timeout helps, but if the agent loop takes >2s for parsing/processing, the function still dies at 10s. The comment is misleading — it implies 60s is available.

**Impact:** Complex queries (multi-round tool use) will hit the Vercel wall and show "Request timed out" errors.

---

### 6. Auth token not sent on first message
**File:** `src/app/chat/page.tsx` (lines 21-25, 35-39)
**Severity:** High — auth failures

```typescript
const [authToken, setAuthToken] = useState('')
useEffect(() => {
  setAuthToken(localStorage.getItem('seedify_token') || '')
}, [])

const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    body: () => ({ _auth_token: authToken }),
  }),
})
```

`authToken` starts as `''`. The `useEffect` runs *after* the first render. The `body()` closure captures the initial empty `authToken`. Because `DefaultChatTransport` likely captures `body` at construction time, the first request may send an empty token even after `setAuthToken` resolves.

**Fix:** Read from `localStorage` synchronously (it's client-side only, wrapped in try/catch), or use a ref that updates.

---

### 7. Session compaction not wired into the agent loop
**File:** `openclaw-api/app/main.py` (compaction check ~line 660), `openclaw-api/app/agent/agent.py`
**Severity:** Medium — long sessions degrade

Compaction is checked **before** `agent.run()` starts, but the agent's internal `Session` is built inside `agent.run()` from the raw `messages` parameter. The compacted `agent_session` is never passed to the agent.

```python
if should_compact(agent_session, config):
    result = compact_session(agent_session, config)
    agent_session = result.compacted_session
# agent_session is never passed to agent.run()!
agent = SeedifyAgent(...)
async for event in agent.run(messages, current_user, db):  # uses raw messages
```

The compaction logic in `compact.py` is fully implemented but **never actually used**. Long sessions will hit token limits.

---

### 8. SubagentManifest stored in memory only
**File:** `openclaw-api/app/agent/subagents.py` (~line 230)
**Severity:** Medium — lost state on restart

```python
self._manifests: dict[str, SubagentManifest] = {}  # in-memory dict
```

Background sub-agents run as `asyncio.create_task()`. If the server restarts (deploy, crash), all running sub-agents are lost and their manifests vanish. The comment says "replace with DB in production" — this is a production blocker.

---

### 9. Frontend ignores backend status/round/usage/done events
**File:** `src/app/api/chat/route.ts` (switch statement ~line 90)
**Severity:** Low-Medium — missing UI feedback

The backend emits `status`, `round`, `usage`, and `done` events. The frontend's SSE parser only handles: `session`, `content`, `tool_call`, `tool_result`, `error`. All other event types are silently dropped.

**Impact:** "Thinking…" status, round indicators, and token usage are never shown. The "Thinking..." shimmer in the UI is based on `status` being `submitted`/`streaming` and having no parts — this works by accident but misses the backend's actual status text.

---

## MEDIUM — Security & Reliability

### 10. Tool input JSON parsing silently defaults to empty dict
**File:** `openclaw-api/app/agent/agent.py` (~line 160)
**Severity:** Medium

```python
try:
    args = json.loads(tc["arguments"])
except json.JSONDecodeError:
    args = {}
```

If the LLM produces malformed JSON (truncated streaming), the tool is called with `{}` instead of raising an error. This could cause tools like `search_seeds` to run with no query, returning unexpected results.

---

### 11. Session load UUID errors silently return None
**File:** `openclaw-api/app/agent/persist.py` (multiple methods)
**Severity:** Low

```python
try:
    record = self._db.query(ChatSession).filter(
        ChatSession.id == uuid.UUID(session_id)
    ).first()
except (ValueError, Exception):
    return None
```

Bare `Exception` catch swallows all database errors (connection failures, schema issues). A `psycopg2.OperationalError` is treated the same as "session not found" — no logging, no alerting.

**Same pattern in:** `load()`, `load_session()`, `delete()`.

---

### 12. SubagentToolExecutor class is unused
**File:** `openclaw-api/app/agent/subagents.py` (~line 110)
**Severity:** Low — dead code

`SubagentToolExecutor` is a full class that wraps a registry with tool whitelisting. But `run_interactive()` builds a `ToolRegistry` via `_build_restricted_registry()` and passes it directly to `SeedifyAgent`. The executor class is never instantiated.

---

### 13. `tool_input` truncation in stream events
**File:** `openclaw-api/app/agent/stream.py` (line 68)
**Severity:** Low

```python
"input": input_preview[:200],
```

The `tool_call` event truncates input to 200 chars. This is fine for the SSE stream (the frontend gets it as a preview), but if the frontend tries to parse `input` as JSON for display, it'll get broken JSON for long inputs.

The `api.ts` type says `input: string` which is correct — the frontend correctly treats it as a string. No bug, but worth noting.

---

## API Contract: Backend vs Frontend

### SSE Event Types

| Backend event type | Frontend handler | Match? |
|---|---|---|
| `session` | ✅ Parsed | ✅ |
| `content` | ✅ Parsed as text-delta | ✅ |
| `tool_call` | ✅ Parsed | ✅ (frontend also expects `input` as string/obj, backend sends string — works) |
| `tool_result` | ✅ Parsed | ✅ |
| `error` | ✅ Parsed | ✅ |
| `status` | ❌ Ignored | ⚠️ Lost data |
| `round` | ❌ Ignored | ⚠️ Lost data |
| `usage` | ❌ Ignored | ⚠️ Lost data |
| `done` | ❌ Ignored | ⚠️ Lost data |

### `api.ts` vs actual wire format

The TypeScript types define `StatusEvent`, `RoundEvent`, `UsageEvent`, `DoneEvent` — these exist in the type file but are **never used** by the frontend parser. The types are aspirational but the implementation doesn't match.

The `ToolCallEvent` type says `input: string` (correct). The frontend code casts `part as any` and reads `tp.input` which works either way.

---

## Summary of Most Impactful Issues

| # | Issue | Impact |
|---|---|---|
| 1 | Session persistence saves only last user prompt | Every reload loses conversation history |
| 2 | Subagent api_key always empty | Sub-agents can never execute |
| 3 | Compaction never runs | Long sessions will hit token limits and fail |
| 4 | Vercel Hobby 10s limit kills long responses | Multi-tool conversations timeout |
| 5 | Auth token may be empty on first request | First message always unauthenticated |
| 6 | Duplicate `status` key in subagent JSON | Ambiguous spawn result |
| 7 | Hook WARN messages shown twice | Duplicated status text in UI |
| 8 | Subagent manifests lost on restart | Background agents disappear |
