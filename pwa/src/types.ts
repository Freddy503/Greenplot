export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolStatus?: string;
  attachments?: Attachment[];
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, any>;
}

export interface Attachment {
  name: string;
  type: string;
  dataUrl?: string; // base64 data URL for images/audio
  text?: string; // for text files
}

export interface Rating {
  score: number; // 1-5
  consent: boolean; // allow use for improvement
}
