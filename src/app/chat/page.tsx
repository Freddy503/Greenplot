'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRef, useEffect, useState } from 'react'

export default function ChatPage() {
  const [token, setToken] = useState('')
  const [nickname, setNickname] = useState('')
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setToken(localStorage.getItem('seedify_token') || '')
    setNickname(localStorage.getItem('seedify_nickname') || '')
  }, [])

  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || status !== 'ready') return
    sendMessage({ text: input })
    setInput('')
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 border-b backdrop-blur-xl" style={{ background: 'rgba(1,18,11,0.8)', borderColor: 'var(--outline-variant)' }}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 flex items-center justify-center rounded-full shadow-lg" style={{ background: 'var(--primary)' }}>
            <span className="font-bold text-lg" style={{ color: 'var(--on-primary)' }}>S</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--on-surface)' }}>Seedify</h1>
            {nickname && <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>@{nickname}</span>}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="pt-24 pb-44 px-4 md:max-w-4xl md:mx-auto min-h-screen w-full">
        <div className="flex flex-col gap-8">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: 'rgba(105,246,184,0.1)' }}>
                <span className="material-symbols-outlined text-4xl" style={{ color: 'var(--primary)' }}>local_florist</span>
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--on-surface)' }}>Plant your first seed</h2>
              <p className="max-w-md text-sm" style={{ color: 'var(--on-surface-variant)' }}>Share a thought, paste an article, or ask a question. Your garden starts here.</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'} gap-2 pr-12`}>
              <div className={`max-w-[85%] rounded-[2rem] px-8 py-6 shadow-sm border ${message.role === 'user' ? '' : 'shadow-xl'}`}
                style={message.role === 'user'
                  ? { background: 'var(--surface-container-high)', borderColor: 'var(--outline-variant)' }
                  : { background: 'var(--primary)', color: 'var(--on-primary)', boxShadow: '0 10px 25px rgba(105,246,184,0.1)' }
                }>
                {message.parts.map((part, index) => {
                  if (part.type === 'text') {
                    return <p key={index} className="text-base leading-relaxed whitespace-pre-wrap">{part.text}</p>
                  }
                  return null
                })}
              </div>

              {message.role === 'assistant' && (
                <div className="flex items-center gap-3 pl-2">
                  <span className="material-symbols-outlined text-sm filled" style={{ color: 'var(--primary-container)' }}>science</span>
                </div>
              )}
            </div>
          ))}

          {status === 'submitted' && (
            <div className="flex items-center gap-3 px-6 py-3 rounded-full w-fit mx-auto animate-pulse" style={{ background: 'rgba(6,183,127,0.1)', border: '1px solid rgba(6,183,127,0.2)' }}>
              <span className="material-symbols-outlined text-sm" style={{ color: 'var(--primary-container)' }}>local_florist</span>
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--primary-container)' }}>Searching your garden…</span>
            </div>
          )}

          {error && (
            <div className="rounded-2xl px-6 py-4 text-sm max-w-md mx-auto" style={{ background: 'rgba(255,113,108,0.1)', color: 'var(--error)' }}>
              Connection error: {error.message}. Check that NEXT_PUBLIC_API_URL is set in Vercel.
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div className="fixed bottom-0 left-0 w-full px-4 pb-8 pt-10 z-40" style={{ background: 'linear-gradient(to top, var(--background) 60%, transparent)' }}>
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="rounded-full p-2 flex items-center gap-1 shadow-2xl backdrop-blur-md" style={{ background: 'var(--surface-container-highest)', border: '1px solid var(--outline-variant)' }}>
            <textarea
              className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-3 resize-none max-h-40"
              style={{ color: 'var(--on-surface)' }}
              placeholder="Nurture a new idea..."
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              disabled={status !== 'ready'}
            />

            {status === 'streaming' ? (
              <button type="button" onClick={stop} className="p-4 rounded-full transition-all active:scale-95" style={{ background: 'var(--error)', color: 'white' }}>
                <span className="material-symbols-outlined filled">stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || status !== 'ready'}
                className="p-4 rounded-full shadow-lg transition-all active:scale-95 disabled:opacity-30"
                style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
              >
                <span className="material-symbols-outlined filled">send</span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
