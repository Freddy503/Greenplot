'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useState, useRef, useEffect } from 'react'

interface Source {
  title: string
  url: string
}

export default function ChatPage() {
  const [nickname, setNickname] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({
        _auth_token: localStorage.getItem('seedify_token') || '',
      }),
    }),
    experimental_throttle: 50,
  })

  const [input, setInput] = useState('')

  useEffect(() => {
    setNickname(localStorage.getItem('seedify_nickname') || '')
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || status !== 'ready') return
    sendMessage({ text: input })
    setInput('')
  }

  const isStreaming = status === 'submitted' || status === 'streaming'

  // ── helpers ──────────────────────────────────────────────

  const toolIcons: Record<string, string> = {
    web_search: 'search',
    search_seeds: 'psychology',
    create_seed: 'add_circle',
    list_recent_seeds: 'history',
    get_daily_briefing: 'wb_sunny',
  }

  /** Collect sources from a message (source-url parts + .sources fallback) */
  const getSources = (msg: UIMessage): Source[] => {
    const found = new Map<string, Source>()

    // 1. Extract from message parts (source-url)
    for (const part of msg.parts) {
      if (part.type === 'source-url') {
        const p = part as { url: string; title?: string; sourceId?: string }
        const url = p.url || p.sourceId || ''
        if (url && !found.has(url)) {
          found.set(url, {
            title:
              p.title && p.title !== 'link'
                ? p.title
                : (() => {
                    try {
                      return new URL(url).hostname
                    } catch {
                      return url
                    }
                  })(),
            url,
          })
        }
      }
    }

    // 2. Fallback: top-level sources field (SDK may populate this)
    const raw = (msg as unknown as { sources?: Array<{ url: string; title?: string }> }).sources
    if (raw && Array.isArray(raw)) {
      for (const s of raw) {
        if (s.url && !found.has(s.url)) {
          found.set(s.url, {
            title:
              s.title || (() => {
                try {
                  return new URL(s.url).hostname
                } catch {
                  return s.url
                }
              })(),
            url: s.url,
          })
        }
      }
    }

    return Array.from(found.values())
  }

  /** Extract the query from a tool part's input */
  const getToolQuery = (input: unknown): string => {
    if (!input || typeof input !== 'object') return ''
    const q = (input as Record<string, unknown>).query
    return typeof q === 'string' ? q : ''
  }

  // ── render ──────────────────────────────────────────────

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
            <span className="font-bold text-lg" style={{ color: 'var(--on-primary)' }}>
              S
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--on-surface)' }}>
              Seedify
            </h1>
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
                <span
                  className="material-symbols-outlined text-4xl"
                  style={{ color: 'var(--primary)' }}
                >
                  local_florist
                </span>
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--on-surface)' }}>
                Plant your first seed
              </h2>
              <p className="max-w-md text-sm" style={{ color: 'var(--on-surface-variant)' }}>
                Ask questions, search the web, or capture ideas. Your AI second brain is ready.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const sources = getSources(msg)

            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] rounded-2xl px-6 py-4"
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
                  {/* Render message parts */}
                  {msg.parts.map((part, i) => {
                    // Text part
                    if (part.type === 'text') {
                      return (
                        <p
                          key={`${msg.id}-text-${i}`}
                          className="text-[15px] leading-relaxed whitespace-pre-wrap"
                        >
                          {part.text}
                        </p>
                      )
                    }

                    // Tool parts (match tool-*)
                    if (part.type.startsWith('tool-')) {
                      const toolName = part.type.replace('tool-', '')
                      const iconName = toolIcons[toolName] || 'build'

                      // Tool parts have state, input, output, errorText
                      const toolPart = part as {
                        state: string
                        input?: unknown
                        output?: unknown
                        errorText?: string
                      }
                      const query = getToolQuery(toolPart.input)

                      const isRunning =
                        toolPart.state === 'input-streaming' ||
                        toolPart.state === 'input-available'
                      const isError = toolPart.state === 'output-error'

                      return (
                        <div
                          key={`${msg.id}-tool-${i}`}
                          className="flex items-center gap-3 text-xs px-4 py-3 rounded-xl mt-3"
                          style={{ background: 'var(--surface-container-highest)' }}
                        >
                          <span
                            className="material-symbols-outlined text-base"
                            style={{
                              color: isRunning
                                ? 'var(--secondary)'
                                : isError
                                  ? 'var(--error)'
                                  : 'var(--primary)',
                            }}
                          >
                            {iconName}
                          </span>
                          <div className="flex-1">
                            <span
                              className="font-medium"
                              style={{ color: 'var(--on-surface)' }}
                            >
                              {toolName.replace(/_/g, ' ')}
                            </span>
                            {query && (
                              <span
                                className="ml-2"
                                style={{ color: 'var(--on-surface-variant)' }}
                              >
                                &ldquo;{query}&rdquo;
                              </span>
                            )}
                          </div>
                          {isRunning ? (
                            <span
                              className="material-symbols-outlined text-sm animate-spin"
                              style={{ color: 'var(--secondary)' }}
                            >
                              progress_activity
                            </span>
                          ) : isError ? (
                            <span
                              className="material-symbols-outlined text-sm"
                              style={{ color: 'var(--error)' }}
                            >
                              error
                            </span>
                          ) : (
                            <span
                              className="material-symbols-outlined text-sm"
                              style={{ color: 'var(--primary)' }}
                            >
                              check_circle
                            </span>
                          )}
                        </div>
                      )
                    }

                    return null
                  })}

                  {/* Empty assistant + tool calls → placeholder text */}
                  {msg.role === 'assistant' &&
                    !msg.parts.some((p) => p.type === 'text') &&
                    msg.parts.some((p) => p.type.startsWith('tool-')) &&
                    !isStreaming && (
                      <p
                        className="text-[13px] italic"
                        style={{ color: 'var(--on-surface-variant)' }}
                      >
                        Search complete. Tap a source to read more.
                      </p>
                    )}

                  {/* Sources */}
                  {sources.length > 0 && (
                    <div
                      className="mt-4 pt-3 space-y-2"
                      style={{ borderTop: '1px solid var(--outline-variant)' }}
                    >
                      <p
                        className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--on-surface-variant)' }}
                      >
                        Sources
                      </p>
                      {sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs group"
                          style={{ color: 'var(--primary)' }}
                        >
                          <span className="material-symbols-outlined text-sm">link</span>
                          <span className="group-hover:underline truncate">
                            {src.title}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Thinking indicator */}
          {isStreaming &&
            messages.length > 0 &&
            (() => {
              const last = messages[messages.length - 1]
              return (
                last.role === 'assistant' &&
                !last.parts.some((p) => p.type === 'text') &&
                !last.parts.some((p) => p.type.startsWith('tool-'))
              )
            })() && (
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

          {/* Error state */}
          {status === 'error' && (
            <div className="flex items-center gap-2 px-4">
              <span
                className="material-symbols-outlined text-sm"
                style={{ color: 'var(--error)' }}
              >
                error
              </span>
              <span className="text-xs" style={{ color: 'var(--error)' }}>
                Something went wrong. Try again.
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <div
        className="fixed bottom-0 left-0 w-full px-4 pb-6 pt-8 z-40"
        style={{
          background: 'linear-gradient(to top, var(--background) 60%, transparent)',
        }}
      >
        <div className="max-w-4xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl p-2 flex items-center gap-2 shadow-2xl"
            style={{
              background: 'var(--surface-container-highest)',
              border: '1px solid var(--outline-variant)',
            }}
          >
            <textarea
              className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-3 resize-none max-h-32 text-[15px]"
              style={{ color: 'var(--on-surface)' }}
              placeholder="Ask anything..."
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              disabled={isStreaming}
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
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
