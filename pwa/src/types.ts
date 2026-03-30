export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolStatus?: string;
  attachments?: Attachment[];
  ratingSubmitted?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, any>;
  status?: 'running' | 'done' | 'error';
  result?: string;
}

export interface Attachment {
  name: string;
  type: string;
  dataUrl?: string; // base64 data URL for images/audio
  base64?: string;  // raw base64 (no prefix) — used for API sends
  text?: string; // for text files
}

export interface Rating {
  score: number; // 1-5
  consent: boolean; // allow use for improvement
}

// NDJSON stream event types
export type StreamEvent =
  | { type: 'status'; text: string }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; id: string; name: string; input?: Record<string, any> }
  | { type: 'tool_result'; id: string; result: string }
  | { type: 'tool_error'; id: string; error: string }
  | { type: 'error'; text: string }
  | { type: 'done' };
