# Claw-Code Sub-Agent System — Deep Dive

**Source:** `rust/crates/tools/src/lib.rs` lines 1500-1700
**Purpose:** Understand exactly how claw-code's typed sub-agents work for Seedify implementation

---

## Architecture Overview

```
Parent Agent (main conversation)
    │
    ├── calls Agent tool
    │   ├── description: "Find all ideas about X"
    │   ├── prompt: "Search seeds for... then analyze..."
    │   ├── subagent_type: "Explore"
    │   └── name: optional, model: optional
    │
    ▼
Agent Tool Handler (execute_agent)
    │
    ├── 1. Validate input (description + prompt non-empty)
    ├── 2. Generate agent_id (unique)
    ├── 3. Create output dir (.claw-agents/)
    ├── 4. Build system_prompt for type
    ├── 5. Determine allowed_tools for type
    ├── 6. Write initial .md output file
    ├── 7. Write .json manifest (status: "running")
    ├── 8. Spawn thread → run_agent_job()
    └── 9. Return AgentOutput manifest immediately
    │
    ▼
Sub-Agent Thread (spawn_agent_job)
    │
    ├── Builds ConversationRuntime with:
    │   ├── own Session (isolated history)
    │   ├── own ApiClient (fresh LLM connection)
    │   ├── SubagentToolExecutor (restricted tools)
    │   ├── agent_permission_policy (DangerFullAccess base)
    │   └── system_prompt (base + type context)
    │
    ├── Calls runtime.run_turn(prompt, None)
    │   └── Runs up to 32 iterations
    │       └── Until text-only response (no tool calls)
    │
    └── Writes final state:
        ├── Appends "## Result" to .md output file
        └── Updates .json manifest (status: "completed"/"failed")
```

## Key Data Structures

### AgentInput (what the LLM provides)
```rust
struct AgentInput {
    description: String,       // High-level task description
    prompt: String,            // Detailed prompt for the sub-agent
    subagent_type: Option<String>,  // "Explore", "Plan", "Verification", etc.
    name: Option<String>,      // Optional agent name
    model: Optional<String>,   // Optional model override
}
```

### AgentOutput (returned to parent immediately)
```rust
struct AgentOutput {
    agent_id: String,          // Unique ID
    name: String,              // Slugified name
    description: String,       // Task description
    subagent_type: Option<String>,
    model: Option<String>,
    status: String,            // "running" → "completed"/"failed"
    output_file: String,       // Path to .md result file
    manifest_file: String,     // Path to .json manifest
    created_at: String,        // ISO timestamp
    started_at: Option<String>,
    completed_at: Option<String>,
    error: Option<String>,
}
```

### AgentJob (internal to thread)
```rust
struct AgentJob {
    manifest: AgentOutput,
    prompt: String,
    system_prompt: Vec<String>,
    allowed_tools: BTreeSet<String>,
}
```

## Typed Sub-Agents & Tool Restrictions

| Subagent Type | Allowed Tools | Purpose |
|---------------|--------------|---------|
| `Explore` | read_file, glob_search, grep_search, WebFetch, WebSearch, ToolSearch, Skill, StructuredOutput | Read-only exploration |
| `Plan` | read_file, glob_search, grep_search, WebFetch, WebSearch, ToolSearch, Skill, TodoWrite, StructuredOutput, SendUserMessage | Planning & task breakdown |
| `Verification` | bash, read_file, glob_search, grep_search, WebFetch, WebSearch, ToolSearch, TodoWrite, StructuredOutput, SendUserMessage, PowerShell | Testing & verification |
| `claw-guide` | read_file, glob_search, grep_search, WebFetch, WebSearch, ToolSearch, Skill, StructuredOutput, SendUserMessage | Help & guidance |
| `statusline-setup` | bash, read_file, write_file, edit_file, glob_search, grep_search, ToolSearch | Configuration |
| `_default` (general-purpose) | ALL tools | Unrestricted |

## SubagentToolExecutor — The Enforcement Layer

```rust
struct SubagentToolExecutor {
    allowed_tools: BTreeSet<String>,
}

impl ToolExecutor for SubagentToolExecutor {
    fn execute(&mut self, tool_name: &str, input: &str) -> Result<String, ToolError> {
        if !self.allowed_tools.contains(tool_name) {
            return Err(ToolError::new(format!(
                "tool `{tool_name}` is not enabled for this sub-agent"
            )));
        }
        // Delegate to the global execute_tool function
        execute_tool(tool_name, &input).map_err(ToolError::new)
    }
}
```

## System Prompt for Sub-Agents

```
{base_system_prompt}  // OS info, project context, etc.

You are a background sub-agent of type `{subagent_type}`.
Work only on the delegated task, use only the tools available
to you, do not ask the user questions, and finish with a
concise result.
```

## Execution Flow

1. **Parent calls Agent tool** → `execute_agent(input)`
2. **Validate** → description and prompt must be non-empty
3. **Prepare** → generate ID, create dirs, build system prompt, determine tools
4. **Write initial state** → .md file with task description, .json manifest
5. **Spawn thread** → `std::thread::Builder::new().name("claw-agent-{id}").spawn()`
6. **Return immediately** → parent gets AgentOutput with status "running"
7. **Thread runs** → `run_agent_job()` builds runtime, calls `run_turn(prompt, None)`
8. **Sub-agent loop** → up to 32 iterations of tool use + text generation
9. **Complete** → extract final text, write to .md, update .json manifest
10. **Error handling** → catch_unwind for panics, update manifest on failure

## Key Design Decisions

### Fire-and-Forget Spawning
- Parent doesn't wait for sub-agent to complete
- Results are persisted to disk, not returned directly
- Manifest tracks lifecycle (running → completed/failed)

### Isolated Sessions
- Each sub-agent gets a fresh `Session::new()`
- No shared history with parent
- No way for sub-agent to affect parent's conversation

### Tool Restriction via Executor Wrapper
- `SubagentToolExecutor` wraps the global `execute_tool`
- Checks `allowed_tools` set before dispatching
- Same tool implementations, different access control

### System Prompt Extension
- Base system prompt (OS, project context) is prepended
- Sub-agent type instruction is appended
- Sub-agent knows its role and constraints

### Single-Turn Completion
- Sub-agent runs ONE turn (with up to 32 internal iterations)
- Not a multi-turn conversation
- Result is a text response (no tool calls in final output)

## Implications for Seedify

### Adaptation for Seedify's Multi-Tenant SaaS

1. **Persistence**: Instead of filesystem .md/.json files, use:
   - Database records (Postgres) for manifests
   - Weaviate for result indexing
   - Redis for real-time status updates

2. **Isolation**: Instead of OS threads, use:
   - asyncio tasks (non-blocking)
   - Or Celery/background workers for long-running tasks
   - Per-tenant isolation at data layer

3. **Typed Agents for Seedify**:
   - `Explore` → Deep-dive into knowledge cluster
   - `Synthesis` → Combine ideas into new ones
   - `Research` → Web research + ingestion
   - `Connection` → Find cross-domain relationships

4. **Tool Restriction**: Each type gets different Weaviate access:
   - Explore: read-only search
   - Synthesis: search + create
   - Research: search + web + ingest
   - Connection: search + cross-reference analysis

5. **Result Format**: Return structured JSON, not markdown files
