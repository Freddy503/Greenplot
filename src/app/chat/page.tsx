'use client'

import type { UIMessage } from 'ai'
import { useState, useRef, useEffect } from 'react'

const API = 'https://atomic-probability-ago-mistress.trycloudflare.com'

interface ToolCall {
  name: string
  status: 'running' | 'done'
  input?: Record<string, unknown>
  output?: string
}

interface Source {
  title: string
  url: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: ToolCall[]
  sources: Source[]
}

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
      toolCalls: [],
      sources: [],
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      sources: [],
    }

    const allMsgs = [...messages, userMsg]
    setMessages([...allMsgs, assistantMsg])
    setInput('')
    setStreaming(true)

    const apiMessages = allMsgs.map((m) => ({
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
        body: JSON.stringify({ messages: apiMessages }),
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

              case 'tool_call': {
                const toolInput = typeof event.input === 'string'
                  ? JSON.parse(event.input)
                  : event.input
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantMsg.id) return m
                    // Avoid duplicates
                    if (m.toolCalls.some(t => t.name === event.name && t.status === 'running')) return m
                    return {
                      ...m,
                      toolCalls: [
                        ...m.toolCalls,
                        { name: event.name, status: 'running' as const, input: toolInput },
                      ],
                    }
                  })
                )
                break
              }

              case 'tool_result': {
                const resultStr = typeof event.result === 'string'
                  ? event.result
                  : JSON.stringify(event.result)
                let parsed: { status?: string; results?: Source[]; url?: string } = {}
                try { parsed = JSON.parse(resultStr) } catch {}

                // Extract sources from web search results
                const newSources: Source[] = []
                if (parsed.results && Array.isArray(parsed.results)) {
                  for (const r of parsed.results) {
                    if (r.url) {
                      newSources.push({ title: r.title || r.url, url: r.url })
                    }
                  }
                }

                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantMsg.id) return m
                    return {
                      ...m,
                      toolCalls: m.toolCalls.map((t) =>
                        t.status === 'running'
                          ? { ...t, status: 'done' as const, output: resultStr }
                          : t
                      ),
                      sources: [...m.sources, ...newSources],
                    }
                  })
                )
                break
              }

              case 'error':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + `\n\n⚠️ ${event.text}` }
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

  const toolIcons: Record<string, string> = {
    web_search: 'search',
    search_seeds: 'psychology',
    create_seed: 'add_circle',
    list_recent_seeds: 'history',
    get_daily_briefing: 'wb_sunny',
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--background)' }}>
      {/* Header */}
      <header
        className="fixed top-0 w-full z-50 flex items-center px-6 py-4 border-b backdrop-blur-xl"
        style={{ background: 'rgba(1,18,11,0.8)', borderColor: 'var(--outline-variant)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center rounded-full" style={{ background: 'var(--primary)' }}>
            <span className="font-bold text-lg" style={{ color: 'var(--on-primary)' }}>S</span>
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--on-surface)' }}>Seedify</h1>
            {nickname && <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>@{nickname}</span>}
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="pt-20 pb-40 px-4 md:max-w-4xl md:mx-auto w-full flex-1">
        <div className="flex flex-col gap-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: 'rgba(105,246,184,0.1)' }}>
                <span className="material-symbols-outlined text-4xl" style={{ color: 'var(--primary)' }}>local_florist</span>
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--on-surface)' }}>Plant your first seed</h2>
              <p className="max-w-md text-sm" style={{ color: 'var(--on-surface-variant)' }}>
                Ask questions, search the web, or capture ideas. Your AI second brain is ready.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[85%] rounded-2xl px-6 py-4"
                style={
                  msg.role === 'user'
                    ? { background: 'var(--surface-container-high)', color: 'var(--on-surface)' }
                    : { background: 'var(--surface-container)', color: 'var(--on-surface)', border: '1px solid var(--outline-variant)' }
                }
              >
                {/* Text content */}
                {msg.content && (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}

                {/* Tool calls */}
                {msg.toolCalls.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.toolCalls.map((tool, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-xs px-4 py-3 rounded-xl"
                        style={{ background: 'var(--surface-container-highest)' }}
                      >
                        <span
                          className="material-symbols-outlined text-base"
                          style={{ color: tool.status === 'running' ? 'var(--secondary)' : 'var(--primary)' }}
                        >
                          {toolIcons[tool.name] || 'build'}
                        </span>
                        <div className="flex-1">
                          <span className="font-medium" style={{ color: 'var(--on-surface)' }}>
                            {tool.name.replace(/_/g, ' ')}
                          </span>
                          {String((tool.input as Record<string, unknown>)?.query ?? '') && (
                            <span className="ml-2" style={{ color: 'var(--on-surface-variant)' }}>
                              "{String((tool.input as Record<string, unknown>).query)}"
                            </span>
                          )}
                        </div>
                        {tool.status === 'running' ? (
                          <span className="material-symbols-outlined text-sm animate-spin" style={{ color: 'var(--secondary)' }}>
                            progress_activity
                          </span>
                        ) : (
                          <span className="material-symbols-outlined text-sm" style={{ color: 'var(--primary)' }}>
                            check_circle
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Sources */}
                {msg.sources.length > 0 && (
                  <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid var(--outline-variant)' }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--on-surface-variant)' }}>
                      Sources
                    </p>
                    {msg.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs group"
                        style={{ color: 'var(--primary)' }}
                      >
                        <span className="material-symbols-outlined text-sm">link</span>
                        <span className="group-hover:underline truncate">{src.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {streaming && messages.length > 0 && !messages[messages.length - 1].content && !messages[messages.length - 1].toolCalls.length && (
            <div className="flex items-center gap-2 px-4">
              <span className="material-symbols-outlined text-sm animate-pulse" style={{ color: 'var(--primary)' }}>local_florist</span>
              <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>Thinking...</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div className="fixed bottom-0 left-0 w-full px-4 pb-6 pt-8 z-40" style={{ background: 'linear-gradient(to top, var(--background) 60%, transparent)' }}>
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage() }}
            className="rounded-2xl p-2 flex items-center gap-2 shadow-2xl"
            style={{ background: 'var(--surface-container-highest)', border: '1px solid var(--outline-variant)' }}
          >
            <textarea
              className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-3 resize-none max-h-32 text-[15px]"
              style={{ color: 'var(--on-surface)' }}
              placeholder="Ask anything..."
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
              }}
              disabled={streaming}
            />
            <button
              type="submit"
              disabled={!input.trim() || streaming}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
              style={{ background: 'var(--primary)', color: 'var(--on-primary)' }}
            >
              <span className="material-symbols-outlined filled text-lg">send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
