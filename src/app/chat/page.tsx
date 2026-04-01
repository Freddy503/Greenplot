'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useState } from 'react'

// Layout
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'

// AI Elements
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'
import { SubagentStatus, type SubagentData } from '@/components/ai-elements/subagent'
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from '@/components/ai-elements/sources'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  Suggestions,
  Suggestion,
} from '@/components/ai-elements/suggestion'

// Icons
import { PaperclipIcon, GlobeIcon } from 'lucide-react'

// ── Suggestions for empty state ───────────────────────

const STARTER_SUGGESTIONS = [
  'What can you help me with?',
  'Tell me about vector search',
  'How does the enrichment pipeline work?',
  'Plant a seed about AI trends',
]

// ── Message timestamp ─────────────────────────────────
function formatTime() {
  const now = new Date()
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Action buttons below AI response (from Stitch) ────
function AssistantActionButtons() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full">
      {/* Create image */}
      <button
        className="flex items-center justify-center gap-2 p-4 rounded-full transition-all active:scale-95 group"
        style={{
          background: '#232623',
          border: '1px solid rgba(63,73,67,0.10)',
          color: '#e1e3df',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#2e312e')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#232623')}
      >
        <span className="material-symbols-outlined text-lg" style={{ color: '#ffb84d', fontSize: '18px' }}>image</span>
        <span className="text-xs font-bold uppercase tracking-wider">Create image</span>
      </button>

      {/* Explore */}
      <button
        className="flex items-center justify-center gap-2 p-4 rounded-full transition-all active:scale-95 group"
        style={{
          background: '#232623',
          border: '1px solid rgba(63,73,67,0.10)',
          color: '#e1e3df',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#2e312e')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#232623')}
      >
        <span className="material-symbols-outlined text-lg" style={{ color: '#10B981', fontSize: '18px' }}>explore</span>
        <span className="text-xs font-bold uppercase tracking-wider">Explore</span>
      </button>

      {/* Add to seed */}
      <button
        className="flex items-center justify-center gap-2 p-4 rounded-full transition-all active:scale-95 relative"
        style={{
          background: '#232623',
          border: '1px solid rgba(254,166,25,0.30)',
          color: '#e1e3df',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#2e312e')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#232623')}
      >
        <span className="material-symbols-outlined text-lg" style={{ color: '#ffb84d', fontSize: '18px' }}>eco</span>
        <div className="flex flex-col items-start leading-none">
          <span className="text-xs font-bold uppercase tracking-wider">Add to seed</span>
          <span className="text-[8px] font-medium mt-0.5" style={{ color: '#ffb84d', opacity: 0.8 }}>Sync to memory</span>
        </div>
      </button>

      {/* To board */}
      <button
        className="flex items-center justify-center gap-2 p-4 rounded-full transition-all active:scale-95"
        style={{
          background: '#232623',
          border: '1px solid rgba(63,73,67,0.10)',
          color: '#e1e3df',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#2e312e')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#232623')}
      >
        <span className="material-symbols-outlined text-lg" style={{ color: '#9fb8aa', fontSize: '18px' }}>dashboard_customize</span>
        <span className="text-xs font-bold uppercase tracking-wider">To board</span>
      </button>

      {/* Rate */}
      <div
        className="col-span-2 md:col-span-1 flex items-center justify-between px-6 py-2 rounded-full"
        style={{
          background: '#1a1c1a',
          border: '1px solid rgba(16,185,129,0.10)',
        }}
      >
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'rgba(159,184,170,0.40)' }}>Rate</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <span
              key={star}
              className="material-symbols-outlined cursor-pointer hover:scale-110 transition-transform"
              style={{
                fontSize: '14px',
                color: star <= 4 ? '#10B981' : 'rgba(16,185,129,0.40)',
                fontVariationSettings: star <= 4 ? '"FILL" 1' : '"FILL" 0',
              }}
            >
              star
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [authToken, setAuthToken] = useState('')
  const [msgTimes] = useState<Record<string, string>>({})
  useEffect(() => {
    try {
      setAuthToken(localStorage.getItem('greenplot_token') || '')
    } catch {}
  }, [])

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({
        _auth_token: authToken,
      }),
    }),
    experimental_throttle: 50,
    onError: (err) => {
      console.error('[chat] useChat error:', err)
    },
  })

  // Clear stale messages on mount
  useEffect(() => {
    setMessages([])
  }, [])

  const handleSubmit = (msg: PromptInputMessage) => {
    if (!msg.text?.trim() || status !== 'ready') return
    sendMessage({ text: msg.text })
  }

  const handleSuggestion = (suggestion: string) => {
    if (status !== 'ready') return
    sendMessage({ text: suggestion })
  }

  const isStreaming = status === 'submitted' || status === 'streaming'

  return (
    <div className="flex flex-col h-dvh" style={{ background: '#111412' }}>
      <Header />

      {/* ── Messages ─────────────────────────────────────── */}
      <main className="pt-14 flex-1 min-h-0 overflow-hidden">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState>
                <div className="flex flex-col items-center gap-6 max-w-lg mx-auto">
                  {/* Brand icon */}
                  <div className="relative">
                    <div
                      className="absolute inset-0 rounded-full blur-2xl opacity-30"
                      style={{ background: '#10B981', transform: 'scale(1.8)' }}
                    />
                    <span
                      className="material-symbols-outlined relative"
                      style={{ fontSize: 56, color: '#10B981', fontVariationSettings: '"FILL" 1' }}
                    >
                      forest
                    </span>
                  </div>

                  {/* Title */}
                  <div className="text-center">
                    <h2
                      className="text-xl font-extrabold tracking-tight mb-1.5"
                      style={{ color: '#e1e3df' }}
                    >
                      Start a conversation
                    </h2>
                    <p className="text-sm font-medium leading-relaxed" style={{ color: '#9fb8aa' }}>
                      Ask questions, capture ideas, or search the web. Your AI second brain is ready to grow with you.
                    </p>
                  </div>

                  {/* Suggestion chips */}
                  <Suggestions>
                    {STARTER_SUGGESTIONS.map((s) => (
                      <Suggestion
                        key={s}
                        suggestion={s}
                        onClick={handleSuggestion}
                        style={{
                          background: '#1f211f',
                          borderColor: 'rgba(63,73,67,0.15)',
                          color: '#9fb8aa',
                          borderRadius: '9999px',
                        }}
                      />
                    ))}
                  </Suggestions>
                </div>
              </ConversationEmptyState>
            ) : (
              messages.map((message, msgIdx) => {
                const sourceParts = message.parts.filter((p) => p.type === 'source-url')
                const isUser = message.role === 'user'
                const isLastAssistant = !isUser && msgIdx === messages.length - 1
                // Get or create a stable timestamp per message
                if (!msgTimes[message.id]) {
                  msgTimes[message.id] = formatTime()
                }
                const timeStr = msgTimes[message.id]

                return (
                  <div key={message.id}>
                    {/* Sources (shown above assistant messages) */}
                    {!isUser && sourceParts.length > 0 && (
                      <Sources className="mb-2">
                        <SourcesTrigger count={sourceParts.length} />
                        <SourcesContent>
                          {sourceParts.map((part, i) => {
                            const p = part as { url: string; title?: string }
                            return (
                              <Source
                                key={`${message.id}-src-${i}`}
                                href={p.url}
                                title={p.title || p.url}
                              />
                            )
                          })}
                        </SourcesContent>
                      </Sources>
                    )}

                    {/* ── User message ─────────────────────────── */}
                    {isUser ? (
                      <div className="flex flex-col items-end gap-2 pl-12 mb-8">
                        <Message from="user">
                          <MessageContent
                            className="user-bubble"
                            style={{
                              background: '#232623',
                              color: '#e1e3df',
                              padding: '1rem 1.5rem',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                            }}
                          >
                            {message.parts.map((part, i) => {
                              if (part.type === 'text') {
                                return (
                                  <MessageResponse key={`${message.id}-text-${i}`}>
                                    {part.text}
                                  </MessageResponse>
                                )
                              }
                              return null
                            })}
                          </MessageContent>
                        </Message>
                        {/* Timestamp */}
                        <div className="flex items-center gap-2 pr-2">
                          <span className="text-[10px]" style={{ color: 'rgba(159,184,170,0.60)' }}>{timeStr}</span>
                          <span
                            className="material-symbols-outlined text-sm"
                            style={{ fontSize: '14px', color: 'rgba(16,185,129,0.60)' }}
                          >
                            person
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* ── Assistant message ────────────────────── */
                      <div className="flex flex-col items-start gap-4 pr-12 mb-8">
                        <Message from="assistant">
                          <MessageContent
                            className="assistant-bubble relative overflow-hidden"
                            style={{
                              background: '#10B981',
                              color: '#003825',
                              padding: '1.5rem 2rem',
                              boxShadow: '0 20px 40px rgba(16,185,129,0.10)',
                            }}
                          >
                            {/* Decorative bg icon */}
                            <div
                              className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none"
                              aria-hidden
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '64px', color: '#003825' }}>
                                psychology
                              </span>
                            </div>
                            <div className="relative z-10">
                              {message.parts.map((part, i) => {
                                // Text parts
                                if (part.type === 'text') {
                                  return (
                                    <div key={`${message.id}-text-${i}`} style={{ color: '#003825' }}>
                                      <MessageResponse>
                                        {part.text}
                                      </MessageResponse>
                                    </div>
                                  )
                                }

                                // Reasoning parts (chain of thought)
                                if (part.type === 'reasoning') {
                                  return (
                                    <div key={`${message.id}-reason-${i}`} className="mb-2">
                                      <details className="group">
                                        <summary
                                          className="flex items-center gap-2 cursor-pointer text-xs font-medium select-none"
                                          style={{ color: 'rgba(0,56,37,0.70)' }}
                                        >
                                          <span
                                            className="material-symbols-outlined text-sm transition-transform group-open:rotate-90"
                                            style={{ fontVariationSettings: '"FILL" 1', fontSize: '16px' }}
                                          >
                                            chevron_right
                                          </span>
                                          Thought process
                                        </summary>
                                        <div
                                          className="mt-2 ml-6 text-xs leading-relaxed whitespace-pre-wrap rounded-2xl p-3"
                                          style={{
                                            background: 'rgba(0,56,37,0.12)',
                                            color: 'rgba(0,56,37,0.80)',
                                          }}
                                        >
                                          {(part as any).text}
                                        </div>
                                      </details>
                                    </div>
                                  )
                                }

                                // Tool parts
                                if (part.type.startsWith('tool-')) {
                                  const tp = part as any
                                  const isSubagent = tp.type.includes('spawn_subagent')
                                  let subagentData: SubagentData | null = null

                                  if (isSubagent && tp.output) {
                                    try {
                                      subagentData = typeof tp.output === 'string'
                                        ? JSON.parse(tp.output)
                                        : tp.output
                                    } catch {}
                                  }

                                  return (
                                    <div key={`${message.id}-tool-${i}`} className="mt-3">
                                      {isSubagent && subagentData && (
                                        <SubagentStatus data={subagentData} className="mb-2" />
                                      )}
                                      <Tool>
                                        <ToolHeader
                                          type={tp.type}
                                          state={tp.state}
                                          title={isSubagent ? 'spawn_subagent' : undefined}
                                        />
                                        <ToolContent>
                                          {tp.input != null && (
                                            <ToolInput input={tp.input} />
                                          )}
                                          {(tp.output != null || tp.errorText != null) && (
                                            <ToolOutput
                                              output={tp.output != null ? JSON.stringify(tp.output) : undefined}
                                              errorText={tp.errorText}
                                            />
                                          )}
                                        </ToolContent>
                                      </Tool>
                                    </div>
                                  )
                                }

                                return null
                              })}
                            </div>
                          </MessageContent>
                        </Message>

                        {/* Timestamp + action buttons */}
                        <div className="flex flex-col gap-4 w-full">
                          <div className="flex items-center gap-3 pl-2">
                            <span
                              className="material-symbols-outlined text-sm"
                              style={{ fontSize: '14px', color: '#10B981', fontVariationSettings: '"FILL" 1' }}
                            >
                              psychology
                            </span>
                            <span className="text-[10px]" style={{ color: 'rgba(159,184,170,0.60)' }}>{timeStr}</span>
                          </div>

                          {/* Action buttons (Stitch bento) — only show on last assistant message */}
                          {isLastAssistant && !isStreaming && (
                            <AssistantActionButtons />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}

            {/* Stitch: Amber pulsing status indicator */}
            {isStreaming && (
              <div className="flex justify-center my-4">
                <div
                  className="flex items-center gap-3 px-6 py-3 rounded-full animate-pulse w-fit"
                  style={{
                    background: 'rgba(254,166,25,0.10)',
                    border: '1px solid rgba(254,166,25,0.20)',
                  }}
                >
                  <span
                    className="material-symbols-outlined text-sm"
                    style={{ color: '#ffb84d', fontSize: '16px' }}
                  >
                    local_florist
                  </span>
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: '#ffb84d' }}
                  >
                    🔍 Searching your garden…
                  </span>
                </div>
              </div>
            )}

            {/* Thinking indicator (fallback) */}
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
                <div className="flex items-center gap-2 px-2 py-1">
                  <Shimmer className="text-sm text-primary">
                    Thinking...
                  </Shimmer>
                </div>
              )}

            {/* Error state */}
            {status === 'error' && (
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm"
                style={{
                  background: 'rgba(255,180,171,0.10)',
                  color: '#ffb4ab',
                }}
              >
                <span className="material-symbols-outlined text-sm">error</span>
                Something went wrong. Try again.
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </main>

      {/* ── Input area (Stitch pattern) ───────────────── */}
      <div
        className="shrink-0 px-4 pb-24 md:pb-6 pt-10"
        style={{
          background: 'linear-gradient(to top, #111412 60%, rgba(17,20,18,0.90) 80%, transparent)',
        }}
      >
        <div className="max-w-4xl mx-auto">
          <PromptInput onSubmit={handleSubmit} globalDrop multiple>
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Nurture a new idea..."
                disabled={isStreaming}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputButton
                  tooltip={{ content: 'Attach files' }}
                  variant="ghost"
                >
                  <PaperclipIcon size={16} />
                </PromptInputButton>
                <PromptInputButton
                  tooltip={{ content: 'Search the web' }}
                  variant="ghost"
                >
                  <GlobeIcon size={16} />
                </PromptInputButton>
              </PromptInputTools>
              <PromptInputSubmit
                status={isStreaming ? 'streaming' : 'ready'}
                disabled={isStreaming}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
