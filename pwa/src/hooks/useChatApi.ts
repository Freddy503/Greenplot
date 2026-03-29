import { useState, useCallback } from 'react';
import { Message } from '../types';

export function useChatApi() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
    };
    setMessages((msgs) => [...msgs, userMsg]);
    setInput('');
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((msgs) => [...msgs, { id: assistantId, role: 'assistant', content: '', toolStatus: 'Thinking…' }]);

    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });
      if (!response.ok) throw new Error(`API error ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let content = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        content += chunk;
        setMessages((msgs) => msgs.map(m => m.id === assistantId ? { ...m, content, toolStatus: undefined } : m));
      }
    } catch (err) {
      setMessages((msgs) => msgs.map(m => m.id === assistantId ? { ...m, content: 'Error: ' + (err as Error).message, toolStatus: undefined } : m));
    } finally {
      setIsLoading(false);
    }
  }, [input, messages]);

  return {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    setMessages,
  };
}
