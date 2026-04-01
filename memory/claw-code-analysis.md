# Claw-Code Architecture Analysis

**Repo:** https://github.com/instructkr/claw-code
**Date:** 2026-04-01
**Purpose:** Identify reusable patterns for **Seedify** (Idea Garden RAG system: FastAPI + Weaviate + React + Vercel/Cloudflare)

---

## 1. Overall Architecture

### Two Implementations

| Layer | Python (`src/`) | Rust (`rust/crates/`) |
|-------|----------------|----------------------|
| **Status** | Clean-room reference / CLI harness | Production-grade rewrite (active) |
| **Scope** | Routing, session mgmt, tool registry (mirrored) | Full agent loop, streaming, hooks, MCP, permissions |

The Python version is a structural mirror — it captures the *architecture patterns* (routing, session, tool pools, turn loops) without executing real tools. The Rust version is the real runtime.

### Module Map (Rust Crates)

```
rust/crates/
├── api/          # API client, provider abstraction, SSE streaming
├── runtime/      # Session, conversation loop, compaction, hooks, permissions, prompt, MCP
├── tools/        # Tool registry, spec definitions, execution dispatch
├── commands/     # Slash command registry
├── plugins/      # Plugin model, hook pipeline
├── compat-harness/  # Upstream editor compatibility
├── claw-cli/     # REPL, CLI args, rendering, init
├── lsp/          # LSP client/manager for context enrichment
└── server/       # Server mode
```

---

## 2. Agent Loop — The Core Pattern

The agent loop lives in `rust/crates/runtime/src/conversation.rs`. It's a **generic, trait-based** conversation runtime:

```rust
pub struct ConversationRuntime<C, T> {
    session: Session,               // Persistent message history
    api_client: C,                   // impl ApiClient (streaming)
    tool_executor: T,                // impl ToolExecutor
    permission_policy: PermissionPolicy,
    system_prompt: Vec<String>,
    max_iterations: usize,
    usage_tracker: UsageTracker,
    hook_runner: HookRunner,
}
```

### The Loop (pseudocode)

```
fn run_turn(user_input):
    append user message to session
    loop (up to max_iterations):
        1. Build ApiRequest { system_prompt, messages }
        2. Call api_client.stream(request) → Vec<AssistantEvent>
        3. Build assistant message from events (TextDelta + ToolUse blocks)
        4. Track token usage
        5. Push assistant message to session
        6. If no ToolUse blocks → break (text-only response)
        7. For each ToolUse:
           a. Check permission_policy.authorize()
           b. If allowed → run PreToolUse hook
              - If hook denies → return error ToolResult
           c. Execute tool via tool_executor.execute()
           d. Run PostToolUse hook (can mark error)
           e. Push ToolResult to session
    return TurnSummary { messages, tool_results, iterations, usage }
```

**Key insight:** The loop is **model-agnostic** — `ApiClient` and `ToolExecutor` are traits. You can swap in any LLM provider or tool backend.

### Content Block Model

Messages use a typed content block system:

```rust
enum ContentBlock {
    Text { text: String },
    ToolUse { id: String, name: String, input: String },
    ToolResult { tool_use_id: String, tool_name: String, output: String, is_error: bool },
}
```

This maps directly to Anthropic's API format but is generic enough for any provider.

---

## 3. Tool System

### Tool Spec (Declarative Schema)

Each tool is a `ToolSpec` with JSON Schema input validation:

```rust
struct ToolSpec {
    name: &'static str,
    description: &'static str,
    input_schema: Value,           // JSON Schema
    required_permission: PermissionMode,
}
```

### GlobalToolRegistry

The registry supports **built-in + plugin tools** with conflict detection:

```rust
struct GlobalToolRegistry {
    plugin_tools: Vec<PluginTool>,
}
```

- `definitions()` → generates API-compatible tool definitions
- `execute()` → dispatches by name to either built-in or plugin handler
- `permission_specs()` → maps each tool to its permission level

### Built-in Tools (18 total)

| Tool | Permission | Purpose |
|------|-----------|---------|
| `bash` | DangerFullAccess | Shell execution |
| `read_file` | ReadOnly | File reading with offset/limit |
| `write_file` | WorkspaceWrite | File creation/update |
| `edit_file` | WorkspaceWrite | Surgical text replacement |
| `glob_search` | ReadOnly | Glob pattern file search |
| `grep_search` | ReadOnly | Regex content search |
| `WebFetch` | ReadOnly | URL fetch + summarization |
| `WebSearch` | ReadOnly | Web search (DuckDuckGo) |
| `TodoWrite` | WorkspaceWrite | Structured task tracking |
| `Skill` | ReadOnly | Load SKILL.md instructions |
| `Agent` | DangerFullAccess | Spawn sub-agent |
| `ToolSearch` | ReadOnly | Search deferred tools |
| `NotebookEdit` | WorkspaceWrite | Jupyter cell editing |
| `Sleep` | ReadOnly | Duration wait |
| `SendUserMessage` | ReadOnly | User notification |
| `Config` | WorkspaceWrite | Get/set settings |
| `StructuredOutput` | ReadOnly | Return structured data |
| `REPL` | DangerFullAccess | Code execution (Python/JS/sh) |
| `PowerShell` | DangerFullAccess | PowerShell execution |

### StaticToolExecutor (for testing)

A simple BTreeMap-based executor for unit testing:

```rust
struct StaticToolExecutor {
    handlers: BTreeMap<String, Box<dyn FnMut(&str) -> Result<String, ToolError>>>,
}
```

---

## 4. Permission System

Five-tier permission model with escalation logic:

```
ReadOnly < WorkspaceWrite < DangerFullAccess
Prompt = user-interaction mode
Allow = bypass everything
```

**Authorization flow:**
1. If `active_mode >= required_mode` → Allow
2. If `active_mode == Prompt` → ask PermissionPrompter
3. If `WorkspaceWrite` tool needs `DangerFullAccess` → prompt user
4. Otherwise → Deny with reason

**Per-tool overrides** via `PermissionPolicy::with_tool_requirement()`.

---

## 5. Hook System

Shell-based hooks with exit-code semantics:

| Exit Code | Meaning |
|-----------|---------|
| 0 | Allow (with optional stdout message) |
| 2 | Deny (with optional stdout reason) |
| Other | Warn (allow but surface message) |

**Hook events:** `PreToolUse`, `PostToolUse`

**Hook payload (JSON via stdin):**
```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "bash",
  "tool_input": "...",
  "tool_input_json": "...",
  "tool_output": null,
  "tool_result_is_error": false
}
```

**Environment variables** also passed: `HOOK_EVENT`, `HOOK_TOOL_NAME`, `HOOK_TOOL_INPUT`, `HOOK_TOOL_OUTPUT`, `HOOK_TOOL_IS_ERROR`

---

## 6. Session & Context Management

### Session Persistence

```rust
struct Session {
    version: u32,
    messages: Vec<ConversationMessage>,
}
```

Serializable to/from JSON. Supports save/load to disk.

### Context Compaction

Smart context compression when sessions grow too large:

```rust
fn compact_session(session, config) -> CompactionResult
```

- Preserves recent N messages verbatim
- Summarizes older messages into a system message
- Extracts: key files, pending work, tool usage, user requests
- Merges with any previous compaction summary
- Continuation instruction: "Resume directly — do not acknowledge the summary"

### System Prompt Builder

Builder pattern for composable system prompts:

```rust
SystemPromptBuilder::new()
    .with_os("linux", "6.8")
    .with_project_context(context)    // git status, CLAW.md files
    .with_runtime_config(config)
    .with_output_style("Concise", "...")
    .with_lsp_context(enrichment)
    .append_section("Custom section")
    .build()  → Vec<String>
```

**Instruction file discovery:** Walks directory tree up from CWD, loads `CLAW.md`, `CLAW.local.md`, `.claw/CLAW.md`, `.claw/instructions.md`.

---

## 7. Streaming

### SSE-based API streaming

`api/src/sse.rs` handles Server-Sent Events parsing. The `ApiClient` trait returns `Vec<AssistantEvent>`:

```rust
enum AssistantEvent {
    TextDelta(String),
    ToolUse { id, name, input },
    Usage(TokenUsage),
    MessageStop,
}
```

### Python-side streaming

The Python `QueryEnginePort` has a generator-based streaming interface:

```python
def stream_submit_message(self, prompt, ...):
    yield {'type': 'message_start', 'session_id': ..., 'prompt': ...}
    yield {'type': 'command_match', 'commands': [...]}
    yield {'type': 'tool_match', 'tools': [...]}
    yield {'type': 'permission_denial', 'denials': [...]}
    result = self.submit_message(...)
    yield {'type': 'message_delta', 'text': result.output}
    yield {'type': 'message_stop', 'usage': {...}, 'stop_reason': ...}
```

---

## 8. Sub-Agent System

The `Agent` tool spawns background sub-agents with:

- **Typed subagent types:** `Explore`, `Plan`, `Verification`, `claw-guide`, `statusline-setup`, `general-purpose`
- **Per-type tool restrictions:** e.g., Explore can't use `bash`, Plan can't use `Agent`
- **Isolated sessions:** Each subagent gets its own `Session` and `ConversationRuntime`
- **Manifest persistence:** Agent metadata written to `.claw-agents/{id}.json`
- **Output file:** Results in `.claw-agents/{id}.md`
- **Thread-based spawning:** Runs in a separate OS thread

---

## 9. Key Design Patterns

### Pattern 1: Trait-Based Dependency Injection
`ApiClient` and `ToolExecutor` are traits/interfaces. Enables testing with mock implementations and swapping providers.

### Pattern 2: Declarative Tool Specs with JSON Schema
Each tool declares its name, description, input schema, and permission level. The registry auto-generates API-compatible definitions.

### Pattern 3: Builder Pattern for System Prompts
`SystemPromptBuilder` composes prompts from OS info, project context, config, instruction files, and custom sections.

### Pattern 4: Typed Content Blocks
`ContentBlock` enum (Text / ToolUse / ToolResult) provides type-safe message handling across the entire pipeline.

### Pattern 5: Permission Escalation Ladder
Five-tier permission model with per-tool overrides and optional user prompting at escalation boundaries.

### Pattern 6: Hook Pipeline with Exit-Code Semantics
Shell commands as hooks with JSON stdin payload and exit-code-based allow/deny/warn decisions.

### Pattern 7: Session Compaction with Summary Merging
Context-aware compaction that preserves recency, extracts key info, and merges with prior compactions.

### Pattern 8: Command/Tool Graph Segmentation
Commands and tools are categorized (built-in, plugin-like, skill-like) for routing and filtering.

---

## 10. What's Most Useful for Seedify

### Directly Reusable Patterns

#### 1. **Agent Loop Architecture** ⭐⭐⭐
The `ConversationRuntime<C, T>` pattern is perfect for Seedify's RAG agent. Adapt it as:

```python
class SeedifyAgent:
    def __init__(self, llm_client, tool_executor, vector_store):
        self.session = Session()
        self.llm = llm_client          # OpenAI/Anthropic/etc
        self.tools = tool_executor     # Weaviate + file tools
        self.vector_store = vector_store
```

The loop: send query → get tool calls → execute (including vector search) → feed results back → repeat until done.

#### 2. **Tool System with JSON Schema** ⭐⭐⭐
Seedify needs tools like:
- `vector_search` — query Weaviate with semantic search
- `idea_ingest` — process and store new ideas
- `idea_relate` — find connections between ideas
- `web_research` — fetch external context
- `structured_output` — return formatted results

Use the `ToolSpec` pattern: name, description, JSON Schema input, permission level. Register in a `ToolRegistry` with auto-dispatch.

#### 3. **Streaming Architecture** ⭐⭐⭐
The SSE-based streaming + Python generator pattern maps directly to FastAPI's `StreamingResponse`:

```python
@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def generate():
        yield f"data: {json.dumps({'type': 'message_start'})}\n\n"
        # ... stream tool calls and text deltas
        yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```

#### 4. **Permission System** ⭐⭐
For Seedify, adapt as a simpler model:
- `read_only` — search and browse ideas
- `write` — create/modify ideas
- `admin` — manage collections, delete, system config

#### 5. **Session Compaction** ⭐⭐
Long idea exploration sessions will hit context limits. The compaction pattern (summarize old messages, preserve recent, merge summaries) is directly applicable.

#### 6. **Sub-Agent System** ⭐⭐
Seedify could use typed sub-agents:
- `ExploreAgent` — deep-dive into a knowledge cluster
- `SynthesisAgent` — combine multiple ideas into new ones
- `ResearchAgent` — web research + ingestion
- `ConnectionAgent` — find cross-domain idea connections

#### 7. **Hook Pipeline** ⭐
For Seedify: pre/post hooks on idea ingestion (validation, dedup, enrichment), search (filtering, ranking adjustments).

### Architecture Recommendations for Seedify

```
┌─────────────────────────────────────────────┐
│              React Frontend                  │
│  (Idea Canvas, Chat, Search, Graph View)    │
└──────────────────┬──────────────────────────┘
                   │ SSE / WebSocket
┌──────────────────▼──────────────────────────┐
│            FastAPI Backend                   │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │       SeedifyAgent (Agent Loop)     │     │
│  │  - Session management               │     │
│  │  - Tool execution dispatch          │     │
│  │  - Streaming response generation    │     │
│  │  - Permission checking              │     │
│  └──────────┬──────────────────────────┘     │
│             │                                │
│  ┌──────────▼──────────────────────────┐     │
│  │         ToolRegistry                │     │
│  │  vector_search │ idea_ingest        │     │
│  │  idea_relate   │ web_research       │     │
│  │  structured_out │ summarize         │     │
│  └──────────┬──────────────────────────┘     │
│             │                                │
│  ┌──────────▼──────────────────────────┐     │
│  │      Weaviate Vector Store          │     │
│  │  - Idea embeddings                  │     │
│  │  - Semantic search                  │     │
│  │  - Cross-reference graph            │     │
│  └─────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

### Implementation Priority

1. **Agent loop + tool registry** — the core engine
2. **Streaming endpoint** — FastAPI SSE for real-time chat
3. **Vector search tool** — Weaviate integration
4. **Session management** — persistence + compaction
5. **Sub-agents** — for deep research and synthesis
6. **Hooks** — for idea validation pipelines

### Key Files to Reference

| Claw-Code File | What to Extract |
|---------------|-----------------|
| `rust/crates/runtime/src/conversation.rs` | Agent loop structure, trait design |
| `rust/crates/tools/src/lib.rs` | Tool spec + registry + dispatch pattern |
| `rust/crates/runtime/src/session.rs` | Session/content block model |
| `rust/crates/runtime/src/compact.rs` | Context compaction algorithm |
| `rust/crates/runtime/src/permissions.rs` | Permission escalation logic |
| `rust/crates/runtime/src/hooks.rs` | Hook pipeline design |
| `rust/crates/runtime/src/prompt.rs` | System prompt builder pattern |
| `src/query_engine.py` | Python streaming generator pattern |
| `src/execution_registry.py` | Registry + dispatch pattern (Python) |
| `src/runtime.py` | Turn loop + routing (Python) |
