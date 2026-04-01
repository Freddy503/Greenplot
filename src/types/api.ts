/**
 * Shared API Types — Contract between Python backend and TypeScript frontend.
 *
 * These types define the wire format for chat events, sessions, and tools.
 * Both sides should agree on these shapes.
 */

// ── Chat Events (SSE stream) ────────────────────────────────────────────────

export type ChatEvent =
  | SessionEvent
  | ContentEvent
  | ToolCallEvent
  | ToolResultEvent
  | StatusEvent
  | RoundEvent
  | ErrorEvent
  | DoneEvent

export interface SessionEvent {
  type: 'session'
  session_id: string
}

export interface ContentEvent {
  type: 'content'
  text: string
}

export interface ToolCallEvent {
  type: 'tool_call'
  id: string
  name: string
  input: string
}

export interface ToolResultEvent {
  type: 'tool_result'
  id: string
  result: string
}

export interface StatusEvent {
  type: 'status'
  text: string
}

export interface RoundEvent {
  type: 'round'
  number: number
  max: number
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export interface DoneEvent {
  type: 'done'
}

// ── Sessions ────────────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string
  title: string | null
  created_at: string | null
  updated_at: string | null
  message_count: number
}

export interface SessionDetail {
  session_id: string
  messages: MessageData[]
}

export interface MessageData {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: ContentBlockData[]
  timestamp?: number
}

export type ContentBlockData =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock

export interface TextBlock {
  kind: 'text'
  text: string
}

export interface ToolUseBlock {
  kind: 'tool_use'
  tool_use_id: string
  tool_name: string
  tool_input: Record<string, unknown>
}

export interface ToolResultBlock {
  kind: 'tool_result'
  tool_use_id: string
  tool_name: string
  tool_output: string
  is_error: boolean
}

// ── Sub-Agents ──────────────────────────────────────────────────────────────

export type SubagentType = 'Explore' | 'Synthesis' | 'Research' | 'Connection'

export interface SubagentManifest {
  agent_id: string
  name: string
  description: string
  subagent_type: SubagentType
  status: 'running' | 'completed' | 'failed'
  result?: string
  error?: string
  created_at: string
  completed_at?: string
}

// ── Health ──────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded'
  checks: {
    weaviate: 'ok' | 'down'
    postgres: 'ok' | 'down'
    openrouter: 'ok' | 'down' | 'unknown'
  }
}

// ── Tools ───────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
  permission: 'READ' | 'WRITE' | 'ADMIN'
}
