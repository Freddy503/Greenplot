# Streaming Event Flow

Sequence of a user message with tool usage:

```
User → Frontend: submits message
Frontend → FastAPI: POST /api/v1/chat (stream)
FastAPI → OpenRouter: chat.completions.create with tools
OpenRouter → FastAPI: stream of deltas + tool_call chunks
  ├─ delta: text_delta → FastAPI forwards to frontend
  ├─ tool_start: id, name, arguments → FastAPI buffers
  └─ tool_result: executes handler, returns content → FastAPI forwards as tool_result event
FastAPI → Frontend: NDJSON lines (text_delta, tool_start, tool_result, error, done)
Frontend: renders text progressively; tool invocations shown as collapsible cards
```

## Event Types (NDJSON)

- `{ "type": "text_delta", "content": "..." }`
- `{ "type": "tool_start", "id": "...", "name": "...", "arguments": {...} }`
- `{ "type": "tool_result", "id": "...", "content": "..." }`
- `{ "type": "error", "message": "..." }`
- `{ "type": "done" }`