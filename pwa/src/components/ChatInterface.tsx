import React, { useState, useRef, useEffect } from 'react';
import { Message, Attachment } from '../types';
import { MessageBubble } from './MessageBubble';
import { VoiceRecorder } from './VoiceRecorder';

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && attachments.length === 0) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
    setMessages((msgs) => [...msgs, userMsg]);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((msgs) => [...msgs, { id: assistantId, role: 'assistant', content: '', toolStatus: 'Thinking…' }]);

    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg], attachments }),
      });

      if (!response.ok) throw new Error('API error');

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
  };

  const addAttachment = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(async (file) => {
      const base64 = await fileToBase64(file);
      setAttachments((prev) => [...prev, {
        name: file.name,
        type: file.type,
        dataUrl: base64,
      }]);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="flex flex-col h-full bg-background text-on-surface">
      <header className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">psychology</span>
          <h1 className="font-headline font-bold text-lg">Second Brain</h1>
        </div>
        <div className="text-xs font-label text-on-surface-variant">Step 1/7 • Initialization</div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-outline-variant/20 bg-surface-container">
        <div className="flex items-end gap-2">
          <VoiceRecorder onAttachment={(att) => setAttachments((a) => [...a, att])} />
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => addAttachment(e.target.files)}
            multiple
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-full bg-surface text-on-surface"
            title="Attach file"
          >
            <span className="material-symbols-outlined">attach_file</span>
          </button>
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              className="w-full rounded-full bg-surface-dim/30 pl-4 pr-12 py-3 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={1}
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || (!input.trim() && attachments.length === 0)}
            className="h-12 px-6 rounded-full bg-secondary text-on-secondary font-headline font-bold shadow-[0_12px_30px_-10px_rgba(248,160,16,0.4)] disabled:opacity-50"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="text-xs bg-surface-dim/30 rounded-full px-3 py-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">{att.type.startsWith('image/') ? 'image' : 'description'}</span>
                {att.name}
                <button type="button" onClick={() => setAttachments((a) => a.filter((_, i) => i !== idx))} className="ml-1 text-on-error">✕</button>
              </div>
            ))}
          </div>
        )}
      </form>

      <footer className="px-8 pb-10 pt-6 bg-surface-container">
        <div className="max-w-md mx-auto flex flex-col items-center gap-4">
          <div className="flex justify-between w-full items-end">
            <span className="text-on-surface font-label text-[10px] font-bold uppercase tracking-widest">Initialization</span>
            <span className="text-primary font-headline font-black text-xl tracking-tighter">Step 1/7</span>
          </div>
          <div className="w-full h-[6px] bg-surface rounded-full overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full w-[14.28%] bg-gradient-to-r from-primary to-primary-container rounded-full shadow-[0_0_15px_rgba(105,246,184,0.5)]" />
          </div>
          <div className="flex items-center gap-1 opacity-40">
            <span className="material-symbols-outlined text-xs">info</span>
            <span className="text-[9px] font-medium tracking-wide">Secure encrypted neural architecture</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
