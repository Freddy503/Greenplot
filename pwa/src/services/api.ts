import { Message, Attachment } from '../types';

export async function sendMessage(messages: Message[], onChunk: (chunk: string) => void, attachments?: Attachment[]): Promise<void> {
  const apiUrl = import.meta.env.VITE_API_URL || '/api/v1/chat';
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, attachments }),
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No reader');

  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    onChunk(chunk);
  }
}
