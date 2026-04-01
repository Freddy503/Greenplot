'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useEffect } from 'react'

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

// Icons
import { PaperclipIcon, GlobeIcon } from 'lucide-react'

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({
        _auth_token: localStorage.getItem('seedify_token') || '',
      }),
    }),
    experimental_throttle: 50,
  })

  useEffect(() => {}, []) // no-op — header handles nickname

  const handleSubmit = (msg: PromptInputMessage) => {
    if (!msg.text?.trim() || status !== 'ready') return
    sendMessage({ text: msg.text })
  }

  const isStreaming = status === 'submitted' || status === 'streaming'

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--background)' }}>
      <Header />

      {/* ── Messages ─────────────────────────────────────── */}
      <main className="pt-20 pb-40 px-4 md:max-w-4xl md:mx-auto w-full flex-1">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                icon={
                  <span
                    className="material-symbols-outlined text-5xl"
                    style={{ color: 'var(--primary)' }}
                  >
                    local_florist
                  </span>
                }
                title="Plant your first seed"
                description="Ask questions, search the web, or capture ideas. Your AI second brain is ready."
              />
            ) : (
              messages.map((message) => {
                // Count sources from parts
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

                          // Tool parts
                          if (part.type.startsWith('tool-')) {
                            const tp = part as any
                            return (
                              <Tool key={`${message.id}-tool-${i}`} className="mt-3">
                                <ToolHeader
                                  type={tp.type}
                                  state={tp.state}
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
                  <Shimmer className="text-sm text-primary">
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
        className="fixed bottom-0 left-0 w-full px-4 pb-6 pt-8 z-40"
        style={{
          background: 'linear-gradient(to top, var(--background) 60%, transparent)',
        }}
      >
        <div className="max-w-4xl mx-auto">
          <PromptInput onSubmit={handleSubmit} globalDrop multiple>
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Ask anything..."
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
