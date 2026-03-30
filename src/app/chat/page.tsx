'use client'

import { useState, useRef, useEffect } from 'react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools?: { name: string; status: string; output?: string }[]
  sources?: { title: string; url: string }[]
}

const API = 'https://atomic-probability-ago-mistress.trycloudflare.com'

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [nickname, setNickname] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNickname(localStorage.getItem('seedify_nickname') || '')
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
    }
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      tools: [],
      sources: [],
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const token = localStorage.getItem('seedify_token')
      const res = await fetch(`${API}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: allMessages }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Backend ${res.status}: ${text}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)

            switch (event.type) {
              case 'content':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + event.text }
                      : m
                  )
                )
                break

              case 'tool_call':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          tools: [
                            ...(m.tools || []),
                            { name: event.name, status: 'running' },
                          ],
                        }
                      : m
                  )
                )
                break

              case 'tool_result':
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantMsg.id) return m
                    const tools = (m.tools || []).map((t) =>
                      t.name === event.name || t.status === 'running'
                        ? { ...t, status: 'done', output: event.result }
                        : t
                    )
                    return { ...m, tools }
                  })
                )
                break

              case 'source':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          sources: [
                            ...(m.sources || []),
                            { title: event.title || event.url, url: event.url },
                          ],
                        }
                      : m
                  )
                )
                break

              case 'error':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + `\n\n⚠️ Error: ${event.text}` }
                      : m
                  )
                )
                break
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `Connection error: ${(err as Error).message}` }
            : m
        )
      )
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header
        className="fixed top-0 w-full z-50 flex items-center px-6 py-4 border-b backdrop-blur-xl"
        style={{ background: 'rgba(1,18,11,0.8)', borderColor: 'var(--outline-variant)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center rounded-full"
            style={{ background: 'var(--primary)' }}
          >
            <span className="font-bold text-lg" style={{ color: 'var(--on-primary)' }}>S</span>
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--on-surface)' }}>Seedify</h1>
            {nickname && (
              <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                @{nickname}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="pt-20 pb-40 px-4 md:max-w-4xl md:mx-auto w-full flex-1">
        <div className="flex flex-col gap-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                style={{ background: 'rgba(105,246,184,0.1)' }}
              >
                <span className="material-symbols-outlined text-4xl" style={{ color: 'var(--primary)' }}>
                  local_florist
                </span>
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--on-surface)' }}>
                Plant your first seed
              </h2>
              <p className="max-w-md text-sm" style={{ color: 'var(--on-surface-variant)' }}>
                Share a thought, ask a question, or request a web search. Your garden starts here.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-6 py-4 ${
                  msg.role === 'user' ? '' : 'shadow-sm'
                }`}
                style={
                  msg.role === 'user'
                    ? {
                        background: 'var(--surface-container-high)',
                        color: 'var(--on-surface)',
                      }
                    : {
                        background: 'var(--surface-container)',
                        color: 'var(--on-surface)',
                        border: '1px solid var(--outline-variant)',
                      }
                }
              >
                {/* Content */}
                {msg.content && (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>
                )}

                {/* Tool calls */}
                {msg.tools && msg.tools.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.tools.map((tool, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                        style={{ background: 'var(--surface-container-highest)' }}
                      >
                        {tool.status === 'running' ? (
                          <span className="material-symbols-outlined text-sm animate-spin">
                            progress_activity
                          </span>
                        ) : (
                          <span
                            className="material-symbols-outlined text-sm"
                            style={{ color: 'var(--primary)' }}
                          >
                            check_circle
                          </span>
                        )}
                        <span style={{ color: 'var(--on-surface-variant)' }}>
                          {tool.name.replace(/_/g, ' ')}
                          {tool.status === 'running' ? '...' : ' ✓'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sources */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p
                      className="text-xs font-medium mb-1"
                      style={{ color: 'var(--on-surface-variant)' }}
                    >
                      Sources:
                    </p>
                    {msg.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs underline truncate"
                        style={{ color: 'var(--primary)' }}
                      >
                        {src.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {streaming && messages.length > 0 && !messages[messages.length - 1].content && (
            <div className="flex items-center gap-2 px-4">
              <span
                className="material-symbols-outlined text-sm animate-pulse"
                style={{ color: 'var(--primary)' }}
              >
                local_florist
              </span>
              <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                Thinking...
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div
        className="fixed bottom-0 left-0 w-full px-4 pb-6 pt-8 z-40"
        style={{ background: 'linear-gradient(to top, var(--background) 60%, transparent)' }}
      >
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              sendMessage()
            }}
            className="rounded-2xl p-2 flex items-center gap-2 shadow-2xl"
            style={{
              background: 'var(--surface-container-highest)',
              border: '1px solid var(--outline-variant)',
            }}
          >
            <textarea
              className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-3 resize-none max-h-32 text-[15px]"
              style={{ color: 'var(--on-surface)' }}
              placeholder="Nurture a new idea..."
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              disabled={streaming}
            />

            {streaming ? (
              <button
                type="button"
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'var(--error)', color: 'white' }}
              >
                <span className="material-symbols-outlined filled text-lg">stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
                style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
              >
                <span className="material-symbols-outlined filled text-lg">send</span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
// cache bust 1774904051
