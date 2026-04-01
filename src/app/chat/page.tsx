'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect, useState } from 'react'

// Layout
import Header from '@/components/layout/header'

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

export default function ChatPage() {
  const [authToken, setAuthToken] = useState('')
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
    <div className="flex flex-col h-dvh" style={{ background: 'var(--background)' }}>
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
                      style={{ background: 'var(--primary)', transform: 'scale(1.8)' }}
                    />
                    <span
                      className="material-symbols-outlined relative"
                      style={{ fontSize: 56, color: 'var(--primary)', fontVariationSettings: '"FILL" 1' }}
                    >
                      forest
                    </span>
                  </div>

                  {/* Title */}
                  <div className="text-center">
                    <h2
                      className="text-xl font-bold mb-1.5"
                      style={{ color: 'var(--on-surface)' }}
                    >
                      Start a conversation
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
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
                          background: 'var(--surface-container)',
                          borderColor: 'var(--border)',
                          color: 'var(--on-surface-variant)',
                        }}
                      />
                    ))}
                  </Suggestions>
                </div>
              </ConversationEmptyState>
            ) : (
              messages.map((message) => {
                const sourceParts = message.parts.filter((p) => p.type === 'source-url')

                return (
                  <div key={message.id}>
                    {/* Sources (shown above assistant messages) */}
                    {message.role === 'assistant' && sourceParts.length > 0 && (
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

                    <Message from={message.role}>
                      <MessageContent>
                        {message.parts.map((part, i) => {
                          // Text parts
                          if (part.type === 'text') {
                            return (
                              <MessageResponse key={`${message.id}-text-${i}`}>
                                {part.text}
                              </MessageResponse>
                            )
                          }

                          // Reasoning parts (chain of thought)
                          if (part.type === 'reasoning') {
                            return (
                              <div key={`${message.id}-reason-${i}`} className="mb-2">
                                <details className="group">
                                  <summary
                                    className="flex items-center gap-2 cursor-pointer text-xs font-medium select-none"
                                    style={{ color: 'var(--muted-foreground)' }}
                                  >
                                    <span
                                      className="material-symbols-outlined text-sm transition-transform group-open:rotate-90"
                                      style={{ fontVariationSettings: '"FILL" 1' }}
                                    >
                                      chevron_right
                                    </span>
                                    Thought process
                                  </summary>
                                  <div
                                    className="mt-2 ml-6 text-xs leading-relaxed whitespace-pre-wrap rounded-lg p-3"
                                    style={{
                                      background: 'var(--surface-container)',
                                      color: 'var(--muted-foreground)',
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
                      </MessageContent>
                    </Message>
                  </div>
                )
              })
            )}

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
                <div className="flex items-center gap-2 px-2 py-1">
                  <Shimmer className="text-sm" style={{ color: 'var(--primary)' }}>
                    Thinking...
                  </Shimmer>
                </div>
              )}

            {/* Error state */}
            {status === 'error' && (
              <div
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                style={{
                  background: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
                  color: 'var(--destructive)',
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

      {/* ── Input ────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4 pb-6 pt-4"
        style={{
          background: 'linear-gradient(to top, var(--background) 60%, transparent)',
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
    </div>
  )
}
