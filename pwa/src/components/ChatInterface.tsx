import { API_BASE } from '../config';
import { useState, useRef, useEffect } from 'react';
import { Message, Attachment, StreamEvent } from '../types';
import { MessageBubble } from './MessageBubble';
import { VoiceRecorder } from './VoiceRecorder';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';
import { enqueue, flush, count } from '../services/offlineQueue';
import { getSettings, saveSettings, ProcessingSettings } from '../services/processingSettings';

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token') || null);
  const [showRegister, setShowRegister] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSettings, setShowSettings] = useState(false);
  const [processingSettings, setProcessingSettings] = useState<ProcessingSettings>(getSettings());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Online/offline detection + queue flush
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const result = await flush(async (item) => {
        // Re-send queued messages
        try {
          const headers: HeadersInit = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await fetch(`${API_BASE}/api/v1/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ messages: item.messages, attachments: item.attachments }),
          });
          return res.ok;
        } catch { return false; }
      });
      setPendingCount(await count());
      if (result.sent > 0) {
        console.log(`Flushed ${result.sent} queued messages`);
      }
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Initial count
    count().then(setPendingCount);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [token]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    }
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleRating = async (messageId: string, rating: { score: number; consent: boolean }) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message_id: messageId,
          score: rating.score,
          consent: rating.consent,
        }),
      });
      if (res.ok) {
        setMessages((msgs) => msgs.map(m => m.id === messageId ? { ...m, ratingSubmitted: true } : m));
      }
    } catch (err) {
      console.error('Rating failed:', err);
    }
  };

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

    // Offline: queue message instead of sending
    if (!navigator.onLine) {
      await enqueue({ messages: [...messages, userMsg], attachments });
      setPendingCount(await count());
      setMessages((msgs) => [...msgs, {
        id: assistantId,
        role: 'assistant',
        content: '📭 Queued — will send when back online.',
      }]);
      setIsLoading(false);
      return;
    }

    setMessages((msgs) => [...msgs, { id: assistantId, role: 'assistant', content: '', toolStatus: 'Connecting…' }]);

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${API_BASE}/api/v1/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: [...messages, userMsg], attachments }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setToken(null);
          localStorage.removeItem('token');
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error(`API error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete NDJSON lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: StreamEvent = JSON.parse(line);
            switch (event.type) {
              case 'status':
                setMessages((msgs) => msgs.map(m => m.id === assistantId
                  ? { ...m, toolStatus: event.text || undefined } : m));
                break;
              case 'content':
                setMessages((msgs) => msgs.map(m => m.id === assistantId
                  ? { ...m, content: m.content + event.text, toolStatus: undefined } : m));
                break;
              case 'tool_call':
                setMessages((msgs) => msgs.map(m => {
                  if (m.id !== assistantId) return m;
                  const existing = m.toolCalls || [];
                  const idx = existing.findIndex(tc => tc.id === event.id);
                  if (idx >= 0) {
                    const updated = [...existing];
                    updated[idx] = { ...updated[idx], name: event.name, input: event.input, status: 'running' };
                    return { ...m, toolCalls: updated };
                  }
                  return { ...m, toolCalls: [...existing, { id: event.id, name: event.name, input: event.input, status: 'running' }] };
                }));
                break;
              case 'tool_result':
                setMessages((msgs) => msgs.map(m => {
                  if (m.id !== assistantId) return m;
                  const updated = (m.toolCalls || []).map(tc =>
                    tc.id === event.id ? { ...tc, status: 'done' as const, result: event.result } : tc
                  );
                  return { ...m, toolCalls: updated };
                }));
                break;
              case 'tool_error':
                setMessages((msgs) => msgs.map(m => {
                  if (m.id !== assistantId) return m;
                  const updated = (m.toolCalls || []).map(tc =>
                    tc.id === event.id ? { ...tc, status: 'error' as const, result: event.error } : tc
                  );
                  return { ...m, toolCalls: updated };
                }));
                break;
              case 'error':
                setMessages((msgs) => msgs.map(m => m.id === assistantId
                  ? { ...m, content: `Error: ${event.text}`, toolStatus: undefined } : m));
                break;
              case 'done':
                setMessages((msgs) => msgs.map(m => m.id === assistantId
                  ? { ...m, toolStatus: undefined } : m));
                break;
            }
          } catch {
            // skip malformed lines
          }
        }
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

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setMessages([]);
  };

  // Not logged in: show auth screens
  if (!token) {
    if (showRegister) {
      return <RegisterScreen onRegister={setToken} onSwitchToLogin={() => setShowRegister(false)} />;
    }
    return <LoginScreen onLogin={setToken} onSwitchToRegister={() => setShowRegister(true)} />;
  }

  // Logged in: show chat
  return (
    <div className="flex flex-col h-full bg-background text-on-surface">
      <header className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">psychology</span>
          <h1 className="font-headline font-bold text-lg">Second Brain</h1>
          {!isOnline && (
            <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full font-medium">
              Offline{pendingCount > 0 ? ` · ${pendingCount} queued` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 rounded-full hover:bg-surface-dim/20" title="Settings">
            <span className="material-symbols-outlined text-lg text-on-surface-variant">tune</span>
          </button>
          <button onClick={handleLogout} className="text-xs text-primary" title="Log out">
            Log out
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="px-4 py-3 border-b border-outline-variant/20 bg-surface-container space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Local transcription (Privacy mode)</p>
              <p className="text-xs text-on-surface-variant">Transcribe voice in-browser — audio never leaves your device</p>
            </div>
            <button
              onClick={() => {
                const next = { ...processingSettings, localTranscription: !processingSettings.localTranscription };
                setProcessingSettings(next);
                saveSettings(next);
              }}
              className={`w-10 h-6 rounded-full transition-colors ${processingSettings.localTranscription ? 'bg-primary' : 'bg-surface-dim'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform mx-1 ${processingSettings.localTranscription ? 'translate-x-4' : ''}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Local embeddings</p>
              <p className="text-xs text-on-surface-variant">Compute vectors locally via gte-small (coming soon)</p>
            </div>
            <button
              disabled
              className="w-10 h-6 rounded-full bg-surface-dim opacity-40"
              title="Coming soon"
            >
              <div className="w-4 h-4 rounded-full bg-white shadow mx-1" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onRating={handleRating} />
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
