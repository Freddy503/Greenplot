# Claw-Code: Session Persistence, System Prompt Builder & Compaction — Deep Dive

**Source files:** `session.rs`, `compact.rs`, `prompt.rs`, `session_store.py`

---

## 1. Session Persistence

### How claw-code does it

**Rust (`session.rs`):**
```rust
// Save to JSON file
session.save_to_path("/path/to/session.json")?;
// Load from JSON file
let session = Session::load_from_path("/path/to/session.json")?;
```

JSON structure:
```json
{
  "version": 1,
  "messages": [
    {
      "role": "user",
      "blocks": [{"type": "text", "text": "hello"}]
    },
    {
      "role": "assistant",
      "blocks": [
        {"type": "text", "text": "Hi there!"},
        {"type": "tool_use", "id": "t1", "name": "bash", "input": "ls"}
      ],
      "usage": {"input_tokens": 10, "output_tokens": 4, ...}
    },
    {
      "role": "tool",
      "blocks": [{"type": "tool_result", "tool_use_id": "t1", "tool_name": "bash", "output": "file.txt", "is_error": false}]
    }
  ]
}
```

**Python (`session_store.py`):**
```python
StoredSession(
    session_id="abc123",
    messages=("user: hello", "assistant: hi"),  # Simplified text-only
    input_tokens=10,
    output_tokens=4,
)
# Saves to .port_sessions/{session_id}.json
```

### Key Design Decisions
- Full message history with typed ContentBlocks (not just text)
- Token usage tracking per message
- Version field for schema migration
- Simple file-based persistence (JSON)

---

## 2. System Prompt Builder

### How claw-code does it (`prompt.rs`)

Builder pattern that composes sections:

```rust
SystemPromptBuilder::new()
    .with_os("linux", "6.8")
    .with_project_context(context)    // cwd, date, git status/diff, instruction files
    .with_runtime_config(config)      // settings
    .with_output_style("Concise", "...")  // Output style instructions
    .with_lsp_context(enrichment)     // LSP context
    .append_section("Custom section")
    .build()  → Vec<String>           // Returns list of sections
    .render() → String                // Joins with \n\n
```

### Sections Generated (in order):
1. **Intro** — "You are an interactive agent that helps with software engineering..."
2. **Output Style** (optional) — Custom response style
3. **System** — Rules about tool use, permissions, hooks
4. **Doing Tasks** — Best practices for code changes
5. **Actions** — Blast radius consideration
6. **`__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`** — Separator marker
7. **Environment** — Model, working dir, date, platform
8. **Project Context** — Date, cwd, git status, git diff
9. **Instruction Files** — CLAW.md, CLAW.local.md, .claw/CLAW.md, .claw/instructions.md
10. **Config** — Runtime settings
11. **Custom Sections** — Any appended sections

### Instruction File Discovery
Walks up directory tree from CWD to root, loading in order:
- `{dir}/CLAW.md`
- `{dir}/CLAW.local.md`
- `{dir}/.claw/CLAW.md`
- `{dir}/.claw/instructions.md`

Deduplicates by content hash. Truncates at 4000 chars per file, 12000 chars total.

---

## 3. Session Compaction

### How claw-code does it (`compact.rs`)

```rust
compact_session(&session, CompactionConfig {
    preserve_recent_messages: 4,     // Keep last N messages verbatim
    max_estimated_tokens: 10_000,     // Threshold to trigger compaction
})
```

### When to compact
- More than `preserve_recent_messages` messages
- AND estimated tokens >= `max_estimated_tokens`
- Ignores existing compaction summary when deciding

### What compaction produces
A system message containing:
```xml
<summary>
Conversation summary:
- Scope: N earlier messages compacted (user=X, assistant=Y, tool=Z).
- Tools mentioned: search_seeds, create_seed, web_search.
- Recent user requests:
  - "Find all ideas about AI"
  - "Create a seed about machine learning"
- Pending work:
  - "Next: update the enrichment pipeline"
- Key files referenced: path/to/file.py, path/to/other.ts
- Current work: Working on the compaction algorithm
- Key timeline:
  - user: Find all ideas about AI
  - assistant: I'll search for AI-related seeds
  - tool_use search_seeds({"query": "AI"})
  - tool_result search_seeds: {"results": [...]}
  - ...
</summary>
```

### Summary Merging (on re-compaction)
When compacting a session that already has a compacted summary:
```
Previously compacted context:
  - Scope: 5 earlier messages compacted...
  - Tools mentioned: search_seeds

Newly compacted context:
  - Scope: 3 new messages compacted...
  - Recent user requests:
    - "Add regression tests"

Key timeline:
  - user: Add regression tests for compaction
  - ...
```

### Continuation Message
```text
This session is being continued from a previous conversation that ran out of context.
The summary below covers the earlier portion of the conversation.

Summary:
[formatted summary]

Recent messages are preserved verbatim.
Continue the conversation from where it left off without asking the user any
further questions. Resume directly — do not acknowledge the summary, do not
recap what was happening, and do not preface with continuation text.
```

### Token Estimation
```rust
// Rough estimate: 4 chars ≈ 1 token
Text { text } → text.len() / 4 + 1
ToolUse { name, input } → (name.len() + input.len()) / 4 + 1
ToolResult { tool_name, output } → (tool_name.len() + output.len()) / 4 + 1
```

### Summary Extraction Helpers
- `collect_recent_role_summaries()` — Last N messages of a given role
- `infer_pending_work()` — Messages containing "todo", "next", "pending", "follow up", "remaining"
- `collect_key_files()` — File paths with .rs/.ts/.tsx/.js/.json/.md extensions
- `infer_current_work()` — Most recent non-empty text
- `summarize_block()` — Truncate block to 160 chars for timeline
