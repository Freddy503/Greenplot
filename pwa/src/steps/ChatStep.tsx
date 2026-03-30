import { useState, useEffect, useRef } from 'react';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { RatingStars } from '../components/Rating';
import type { Attachment } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: { name: string; type: string }[];
}

export function ChatStep(props: any) {
  const { onLogout } = props;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newAttachments: Attachment[] = [];
    for (const file of Array.from(e.target.files)) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // Strip data URL prefix — backend expects raw base64
          const result = reader.result as string;
          resolve(result.split(',')[1] || '');
        };
        reader.readAsDataURL(file);
      });
      newAttachments.push({ name: file.name, type: file.type, base64 });
    }
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      attachments: attachments.length > 0 ? attachments.map(a => ({ name: a.name, type: a.type })) : undefined,
    };

    // Build API attachments (base64 format the backend expects)
    const apiAttachments = attachments.map(a => ({
      name: a.name,
      mimeType: a.type,
      data: a.base64 || a.dataUrl?.split(',')[1] || '',
    })).filter(a => a.data);

    setMessages(msgs => [...msgs, userMsg]);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages(msgs => [...msgs, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
      const body: Record<string, unknown> = { messages: [...messages, userMsg] };
      if (apiAttachments.length > 0) {
        body.attachments = apiAttachments;
      }
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();
      let content = '';
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'content') {
              content += event.text;
              setMessages(msgs => msgs.map(m => m.id === assistantId ? { ...m, content } : m));
            }
            // status, tool_call, tool_result events are handled silently for now
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      setMessages(msgs => msgs.map(m => m.id === assistantId ? { ...m, content: 'Error: ' + (err as Error).message } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRate = async (messageId: string, score: number) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/v1/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message_id: messageId, score, consent: true }),
      });
    } catch (err) {
      console.error('Rating failed:', err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-surface font-body text-on-surface selection:bg-primary/30 selection:text-primary">
      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl flex justify-between items-center px-6 py-4 border-b border-outline-variant/10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-full overflow-hidden shadow-lg shadow-primary/20">
            <span className="text-on-primary font-bold text-lg">JD</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-extrabold text-on-surface font-headline tracking-tight">Arboretum AI</h1>
            <span className="text-[10px] font-label uppercase tracking-[0.2em] text-primary font-bold">The Living Laboratory</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onLogout} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-all active:scale-95" title="Log out">
            <span className="material-symbols-outlined text-on-surface-variant">logout</span>
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="pt-24 pb-44 px-4 md:max-w-4xl md:mx-auto min-h-screen">
        <div className="flex flex-col gap-8">
          {messages.map((message) => (
            <div key={message.id} className={`flex flex-col items-${message.role === 'user' ? 'end' : 'start'} gap-2 pr-12`}>
              <div
                className={`max-w-[85%] rounded-[2rem] px-8 py-6 shadow-sm border ${
                  message.role === 'user'
                    ? 'bg-surface-container-high text-on-surface user-bubble border-outline-variant/20'
                    : 'bg-primary text-on-primary assistant-bubble shadow-xl shadow-primary/10'
                }`}
              >
                <p className="text-base leading-relaxed whitespace-pre-wrap">{message.content}</p>
                {message.attachments && message.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {message.attachments.map((file, idx) => (
                      <div key={idx} className="text-xs bg-surface-dim/30 rounded-full px-3 py-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">{file.type.startsWith('image/') ? 'image' : 'description'}</span>
                        {file.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 pl-2">
                <span className="material-symbols-outlined text-sm text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>science</span>
                <span className="text-[10px] font-label text-on-surface-variant/60">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {/* Rating for assistant */}
              {message.role === 'assistant' && (
                <div className="w-full pt-4">
                  <RatingStars onRate={(r) => handleRate(message.id, r.score)} />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-3 px-6 py-3 bg-tertiary-container/10 border border-tertiary-container/20 rounded-full w-fit mx-auto animate-pulse">
              <span className="material-symbols-outlined text-tertiary text-sm">local_florist</span>
              <span className="text-xs font-semibold text-tertiary tracking-wide uppercase">🔍 Searching your garden…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 w-full px-4 pb-8 md:pb-12 pt-10 bg-gradient-to-t from-surface via-surface/90 to-transparent z-40">
        <div className="max-w-4xl mx-auto">
          <div className="bg-surface-container-highest shadow-2xl rounded-full p-2 flex flex-col gap-2 border border-outline-variant/10 backdrop-blur-md">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 text-on-surface-variant hover:text-primary transition-colors active:scale-90 rounded-full">
                <span className="material-symbols-outlined">attach_file</span>
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} multiple />
              <div className="flex-1 relative">
                <textarea
                  className="w-full bg-transparent border-none focus:ring-0 text-on-surface py-3 px-3 resize-none max-h-40 font-body placeholder:text-on-surface-variant/40"
                  placeholder="Nurture a new idea..."
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
                  disabled={isLoading}
                />
              </div>
              <button type="button" className="p-3 text-on-surface-variant hover:text-primary transition-colors active:scale-90 rounded-full" title="Voice input">
                <VoiceRecorder onAttachment={(att) => setAttachments(prev => [...prev, att])} />
              </button>
              <button type="submit" disabled={isLoading || (!input.trim() && attachments.length === 0)} className="bg-primary text-on-primary p-4 rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-95 flex items-center justify-center">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
              </button>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 pb-2">
                {attachments.map((f, i) => (
                  <div key={i} className="text-xs bg-surface-dim/30 rounded-full px-3 py-1 flex items-center gap-1">
                    {f.name}
                    <button type="button" onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="ml-1 text-on-error">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BottomNavBar (mobile only) */}
      <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-8 pb-8 pt-4 bg-surface/80 backdrop-blur-2xl border-t border-outline-variant/10 z-50 md:hidden">
        <a className="flex flex-col items-center justify-center bg-primary/10 text-primary rounded-full px-6 py-2 transition-all" href="#">
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>chat_bubble</span>
          <span className="font-body text-[10px] font-bold uppercase tracking-wider mt-1">Chat</span>
        </a>
        <a className="flex flex-col items-center justify-center text-on-surface-variant/60 hover:text-primary transition-all" href="#">
          <span className="material-symbols-outlined">local_florist</span>
          <span className="font-body text-[10px] font-bold uppercase tracking-wider mt-1">Garden</span>
        </a>
      </nav>
    </div>
  );
}
