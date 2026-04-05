'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PromptBox } from '@/components/ui/chatgpt-prompt-input'
import { toast } from 'sonner'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

// Hooks
import { useVoiceRecorder } from '@/hooks/use-voice-recorder'
import { pollNotifications } from '@/hooks/use-push-notifications'

// Reflection detection & image generation
import { isReflection } from '@/lib/reflection-detect'
import { CreateImageButton } from '@/components/ai-elements/create-image-button'
import { AddToGardenButton } from '@/components/ai-elements/add-to-garden-button'

// Layout
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import { VoiceRecordingOverlay } from '@/components/voice/voice-recording-overlay'
import { ActivitySummary } from '@/components/activity-summary'

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

const FALLBACK_SUGGESTIONS = [
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

// ── Thumbs Rating ─────────────────────────────────────
type Rating = 'up' | 'down' | null

function ThumbsRating({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<Rating>(() => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(`greenplot_rating_${messageId}`)
    return stored === 'up' || stored === 'down' ? stored : null
  })

  const handleRate = (value: 'up' | 'down') => {
    setRating((prev) => {
      const next = prev === value ? null : value
      if (next) {
        localStorage.setItem(`greenplot_rating_${messageId}`, next)
        toast(next === 'up' ? '👍 Rated positively' : '👎 Rated negatively')
      } else {
        localStorage.removeItem(`greenplot_rating_${messageId}`)
      }
      return next
    })
  }

  return (
    <div className="flex items-center gap-2 pl-2">
      <button
        onClick={() => handleRate('up')}
        className="p-1 rounded-full transition-colors hover:bg-surface-container active:scale-90"
        aria-label="Thumbs up"
      >
        <span
          className={`material-symbols-outlined text-[18px] transition-colors ${rating === 'up' ? 'text-primary' : 'text-on-surface-variant/60'}`}
          style={{ fontVariationSettings: rating === 'up' ? '"FILL" 1' : '"FILL" 0' }}
        >
          thumb_up
        </span>
      </button>
      <button
        onClick={() => handleRate('down')}
        className="p-1 rounded-full transition-colors hover:bg-surface-container active:scale-90"
        aria-label="Thumbs down"
      >
        <span
          className={`material-symbols-outlined text-[18px] transition-colors ${rating === 'down' ? 'text-error' : 'text-on-surface-variant/60'}`}
          style={{ fontVariationSettings: rating === 'down' ? '"FILL" 1' : '"FILL" 0' }}
        >
          thumb_down
        </span>
      </button>
    </div>
  )
}

export default function ChatPage() {
  const [authToken, setAuthToken] = useState('')
  const msgTimesRef = useRef<Record<string, string>>({})
  const [gardenEnriching, setGardenEnriching] = useState(false)
  const [detectedUrls, setDetectedUrls] = useState<string[]>([])
  const [lastGardenSeeds, setLastGardenSeeds] = useState<Array<{title: string; domain: string}>>([])
  // Track generated images keyed by the message ID they relate to
  const [generatedImages, setGeneratedImages] = useState<Record<string, { url: string; prompt: string }>>({})
  // Dynamic suggestions from garden
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS)

  // Fetch garden-based suggestions on every mount (every login/page load)
  useEffect(() => {
    const fetchSuggestions = async () => {
      const token = localStorage.getItem('greenplot_token') || ''
      setAuthToken(token)

      try {
        // Get seeds from garden to generate contextual suggestions
        const res = await fetch('/api/garden/prompt-suggestions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ count: 4 }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.suggestions?.length > 0) {
            setDynamicSuggestions(data.suggestions)
            return
          }
        }
      } catch {}

      // Fallback if API fails or no suggestions
      setDynamicSuggestions(FALLBACK_SUGGESTIONS)
    }

    fetchSuggestions()
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

  // Restore messages from localStorage — survives refresh, logout, tab close
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    if (restored) return
    setRestored(true)
    // Only restore if the chat is currently empty
    if (messages.length > 0) return
    try {
      const saved = localStorage.getItem('greenplot_chat_messages')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed)
        }
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored])

  // Poll for push notifications every 60 seconds
  useEffect(() => {
    const interval = setInterval(pollNotifications, 60000)
    pollNotifications() // check immediately
    return () => clearInterval(interval)
  }, [])

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (!restored) return
    if (messages.length > 0) {
      try {
        // Cap at 50 messages to prevent localStorage quota exceeded
        const toStore = messages.slice(-50)
        localStorage.setItem('greenplot_chat_messages', JSON.stringify(toStore))
      } catch {
        // If still too large, try clearing new data
        try {
          localStorage.removeItem('greenplot_chat_messages')
          localStorage.setItem('greenplot_chat_messages', JSON.stringify(messages.slice(-20)))
        } catch {}
      }
    }
  }, [messages, restored])

  // ── Garden Enrichment ──────────────────────────────
  // API decides intelligently whether to enrich based on:
  // 1. Intent classification (is this a substantive question?)
  // 2. Relevance gate (do garden results actually match?)

  const enrichWithGarden = useCallback(async (text: string): Promise<string> => {
    try {
      setGardenEnriching(true)

      // Read token fresh at call time (not from closure)
      const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''

      // ── URL Detection: auto-create Sources links ──────────
      const urlRegex = /https?:\/\/[^\s<>\]\)"']+/g
      const urls = text.match(urlRegex) || []
      let linkContext = ''

      if (urls.length > 0) {
        // Fetch existing links to detect duplicates
        let existingLinks: any[] = []
        try {
          const existingRes = await fetch('/api/links', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
          if (existingRes.ok) {
            const existingData = await existingRes.json()
            existingLinks = existingData.links || []
          }
        } catch {}

        // Create links in background, don't block chat
        const linkPromises = urls.slice(0, 3).map(async (url) => {
          // Check if this URL already exists in Sources
          const existing = existingLinks.find((l: any) => l.url === url)
          if (existing) {
            toast(`🔗 Already in your Sources: ${existing.title || existing.url}`, {
              description: 'Want me to expand on it?',
            })
            // Still return the existing link's summary for context
            return existing
          }

          try {
            const res = await fetch('/api/links', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ url }),
            })
            if (res.ok) {
              const data = await res.json()
              return data
            }
          } catch {}
          return null
        })

        const linkResults = await Promise.all(linkPromises)
        const created = linkResults.filter(Boolean)

        if (created.length > 0) {
          // Show toast notification
          const titles = created.map(l => l?.title || l?.url).join(', ')
          toast.success(`📎 Link${created.length > 1 ? 's' : ''} added to Sources: ${titles.slice(0, 80)}`)

          // Build link context for the AI
          linkContext = created
            .filter(l => l?.summary)
            .map(l => `\n[Linked content: ${l.title}]\n${l.summary}`)
            .join('\n')
        }
      }

      // ── Garden + Memory search ────────────────────────
      const [gardenRes, memoryRes] = await Promise.allSettled([
        fetch('/api/seeds/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ query: text, limit: 3 }),
        }).then(r => r.ok ? r.json() : null),
        fetch('/api/seeds/memory', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: text, user_id: token || 'default' }),
        }).then(r => r.ok ? r.json() : null),
      ])

      const gardenData = gardenRes.status === 'fulfilled' ? gardenRes.value : null
      const memoryData = memoryRes.status === 'fulfilled' ? memoryRes.value : null

      const seeds = gardenData?.seeds || []
      setLastGardenSeeds(seeds.length > 0 ? seeds.slice(0, 3) : [])

      // Build combined context
      const parts: string[] = []
      if (linkContext) {
        parts.push(linkContext)
      }
      if (gardenData?.enriched && gardenData?.context) {
        parts.push(gardenData.context)
      }
      if (memoryData?.context) {
        parts.push(memoryData.context)
      }

      if (parts.length > 0) {
        return `${text}\n\n${parts.join("\n")}`
      }
      return text
    } catch {
      return text
    } finally {
      setGardenEnriching(false)
    }
  }, [])

  const handleSaveLastResponse = useCallback(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.parts.some(p => p.type === 'text'))
    if (!lastAssistant) {
      toast.error('No assistant response to save')
      return
    }
    const textPart = lastAssistant.parts.find(p => p.type === 'text' && 'text' in p)
    if (!textPart || !('text' in textPart)) {
      toast.error('No text content to save')
      return
    }
    const token = localStorage.getItem('greenplot_token')
    fetch('/api/seeds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        text: textPart.text.slice(0, 500),
        title: textPart.text.split('\n')[0].slice(0, 60),
        source: 'chat_save',
      }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(() => toast.success('Saved to garden 🌱'))
      .catch(() => toast.error('Failed to save'))
  }, [messages])

  const handleSubmit = useCallback(async (msg: PromptInputMessage) => {
    if (!msg.text?.trim() || status !== 'ready') return

    // Intercept /save command
    if (/^\/save\b/i.test(msg.text.trim())) {
      handleSaveLastResponse()
      return
    }

    const enrichedText = await enrichWithGarden(msg.text.trim())
    sendMessage({ text: enrichedText })
  }, [status, sendMessage, enrichWithGarden, handleSaveLastResponse])

  const handleSuggestion = useCallback(async (suggestion: string) => {
    if (status !== 'ready') return
    const enrichedText = await enrichWithGarden(suggestion)
    sendMessage({ text: enrichedText })
  }, [status, sendMessage, enrichWithGarden])

  // ── Voice Memo ────────────────────────────────────────

  const handleTranscription = useCallback(
    async (text: string) => {
      if (status === 'ready') {
        const enrichedText = await enrichWithGarden(`🎙️ Voice memo: ${text}`)
        sendMessage({ text: enrichedText })
      }
    },
    [status, sendMessage, enrichWithGarden]
  )

  const handleVoiceError = useCallback((msg: string) => {
    toast.error(`🎙️ ${msg}`)
    console.error('[voice-error]', msg)
  }, [])

  const {
    state: voiceState,
    duration: voiceDuration,
    toggleRecording,
  } = useVoiceRecorder({
    onTranscription: handleTranscription,
    onError: handleVoiceError,
    authToken,
  })

  const isStreaming = status === 'submitted' || status === 'streaming'

  return (
    <div className="flex flex-col h-dvh bg-background">
      <Header />

      {/* ── Messages ─────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden" style={{ paddingTop: "max(3.5rem, env(safe-area-inset-top, 0px))", paddingBottom: "max(4.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))" }}>
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState>
                <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto">
                  {/* Brand icon */}
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-2xl opacity-30 bg-primary scale-[1.8]" />
                    <span
                      className="material-symbols-outlined relative text-primary"
                      style={{ fontSize: 56, fontVariationSettings: '"FILL" 1' }}
                    >
                      forest
                    </span>
                  </div>

                  {/* Title */}
                  <div className="text-center">
                    <h2 className="text-xl font-extrabnew tracking-tight mb-1.5 text-on-surface">
                      Start a conversation
                    </h2>
                    <p className="text-sm font-medium leading-relaxed text-on-surface-variant">
                      Ask questions, capture ideas, or search the web. Your AI second brain is ready to grow with you.
                    </p>
                  </div>

                  {/* Activity Summary for empty state */}
                  <ActivitySummary token={authToken} />
                </div>
              </ConversationEmptyState>
            ) : (
              <>
                {/* Activity Summary - shows at top when there are messages */}
                <ActivitySummary token={authToken} />
                
                {messages.map((message, msgIdx) => {
                const sourceParts = message.parts.filter((p) => p.type === 'source-url')
                const isUser = message.role === 'user'
                const isLastAssistant = !isUser && msgIdx === messages.length - 1

                if (!msgTimesRef.current[message.id]) {
                  msgTimesRef.current[message.id] = formatTime()
                }
                const timeStr = msgTimesRef.current[message.id]

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
                            className="user-bubble bg-primary/10 text-primary-dark px-5 py-3 shadow-sm border border-primary/15"
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
                        <div className="flex items-center gap-2 pr-2">
                          <span className="text-[10px] text-on-surface-variant/60">{timeStr}</span>
                          <span
                            className="material-symbols-outlined text-primary/60"
                            style={{ fontSize: '14px' }}
                          >
                            person
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* ── Assistant message ────────────────────── */
                      <div className="flex flex-col items-start gap-3 pr-12 mb-8">
                        <Message from="assistant">
                          <MessageContent
                            className="assistant-bubble bg-surface-container-high text-on-surface px-6 py-5 border border-outline-variant/10 relative overflow-hidden"
                          >
                            {/* Decorative bg icon */}
                            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none" aria-hidden>
                              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '64px' }}>
                                psychology
                              </span>
                            </div>

                            <div className="relative z-10">
                              {message.parts.map((part, i) => {
                                if (part.type === 'text') {
                                  return (
                                    <div key={`${message.id}-text-${i}`} className="text-on-surface-variant">
                                      <MessageResponse>{part.text}</MessageResponse>
                                    </div>
                                  )
                                }

                                if (part.type === 'reasoning') {
                                  return (
                                    <div key={`${message.id}-reason-${i}`} className="mb-2">
                                      <details className="group">
                                        <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium select-none text-on-surface-variant/70">
                                          <span
                                            className="material-symbols-outlined text-sm transition-transform group-open:rotate-90 text-on-surface-variant/70"
                                            style={{ fontVariationSettings: '"FILL" 1', fontSize: '16px' }}
                                          >
                                            chevron_right
                                          </span>
                                          Thought process
                                        </summary>
                                        <div className="mt-2 ml-6 text-xs leading-relaxed whitespace-pre-wrap rounded-2xl p-3 bg-surface-container/50 text-on-surface-variant/80">
                                          {(part as any).text}
                                        </div>
                                      </details>
                                    </div>
                                  )
                                }

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
                                          {tp.input != null && <ToolInput input={tp.input} />}
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

                        {/* Timestamp + conditional rating (garden-enriched only) */}
                        <div className="flex items-center gap-3 pl-2">
                          <span
                            className="material-symbols-outlined text-on-surface-variant/40"
                            style={{ fontSize: '14px', fontVariationSettings: '"FILL" 1' }}
                          >
                            psychology
                          </span>
                          <span className="text-[10px] text-on-surface-variant/60">{timeStr}</span>
                          {lastGardenSeeds.length > 0 && msgIdx === messages.length - 1 && (
                            <ThumbsRating messageId={message.id} />
                          )}
                          {/* Save to Garden button */}
                          {message.parts.some(p => p.type === 'text') && (
                            <button
                              onClick={() => {
                                const textPart = message.parts.find(p => p.type === 'text')
                                if (textPart && 'text' in textPart) {
                                  const token = localStorage.getItem('greenplot_token')
                                  fetch('/api/seeds', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                    },
                                    body: JSON.stringify({
                                      text: textPart.text.slice(0, 500),
                                      title: textPart.text.split('\n')[0].slice(0, 60),
                                    }),
                                  })
                                  toast.success('Saved to garden 🌱')
                                }
                              }}
                              className="p-1 rounded-full hover:bg-primary/10 text-on-surface-variant/40 hover:text-primary transition-colors"
                              title="Save to Garden"
                            >
                              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0' }}>eco</span>
                            </button>
                          )}
                        </div>

                        {/* Create Image button — only on reflection responses */}
                        {(() => {
                          // Find the preceding user message
                          const prevUserMsg = msgIdx > 0 ? messages[msgIdx - 1] : null
                          const userText = prevUserMsg?.role === 'user'
                            ? prevUserMsg.parts
                                .filter((p) => p.type === 'text')
                                .map((p) => (p as any).text || '')
                                .join('')
                            : ''
                          const isLastAssistant = msgIdx === messages.length - 1
                          const img = generatedImages[message.id]

                          if (!isLastAssistant || !userText || !isReflection(userText)) return null

                          return (
                            <div className="mt-2 pl-2 space-y-3">
                              {!img && (
                                <CreateImageButton
                                  reflectionText={userText}
                                  authToken={authToken}
                                  onImageGenerated={(url, prompt) => {
                                    setGeneratedImages((prev) => ({
                                      ...prev,
                                      [message.id]: { url, prompt },
                                    }))
                                  }}
                                />
                              )}
                              {img && (
                                <div className="rounded-2xl overflow-hidden border border-outline-variant/10 max-w-sm">
                                  <img
                                    src={img.url}
                                    alt="Visualization of your idea"
                                    className="w-full h-auto"
                                    loading="lazy"
                                  />
                                  <div className="px-4 py-2 bg-surface-container/50">
                                    <p className="text-[10px] text-on-surface-variant/50 truncate">
                                      {img.prompt}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })
            }

            {/* Add to Garden button — appears after substantive conversations */}
            {!isStreaming && messages.length >= 6 && (() => {
              // Check if any tool was used in the conversation
              const hasToolUse = messages.some((m) =>
                m.role === 'assistant' && m.parts.some((p) => p.type.startsWith('tool-'))
              )
              // Or if the conversation is long enough
              const totalText = messages.reduce((acc, m) => {
                return acc + m.parts
                  .filter((p) => p.type === 'text')
                  .map((p) => (p as any).text || '')
                  .join('').length
              }, 0)

              if (!hasToolUse && totalText < 800) return null

              return (
                <div className="flex justify-center my-4 animate-in fade-in">
                  <AddToGardenButton
                    messages={messages.map((m) => ({
                      role: m.role,
                      parts: m.parts as Array<{ type: string; text?: string }>,
                    }))}
                    authToken={authToken}
                  />
                </div>
              )
            })()}

            {/* URL detection + Link capture indicator */}
            {detectedUrls.length > 0 && !gardenEnriching && (
              <div className="flex justify-center my-3">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/15">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 1' }}>link</span>
                  <span className="text-[10px] font-bnew uppercase tracking-wide text-primary">
                    {detectedUrls.length === 1 ? 'Link detected — will add to Sources' : `${detectedUrls.length} links detected`}
                  </span>
                </div>
              </div>
            )}

            {/* Garden enrichment indicator */}
            {gardenEnriching && (
              <div className="flex justify-center my-4">
                <div className="flex items-center gap-3 px-6 py-3 rounded-full animate-pulse w-fit bg-tertiary-container/10 border border-tertiary-container/20">
                  <span className="material-symbols-outlined text-tertiary" style={{ fontSize: '16px' }}>
                    park
                  </span>
                  <span className="text-xs font-semibnew uppercase tracking-wide text-tertiary">
                    🌱 Enriching from your garden…
                  </span>
                </div>
              </div>
            )}

            {/* Streaming indicator */}
            {isStreaming && !gardenEnriching && (
              <div className="flex justify-center my-4">
                <div className="flex items-center gap-3 px-6 py-3 rounded-full animate-pulse w-fit bg-secondary/10 border border-secondary/20">
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: '16px' }}>
                    local_florist
                  </span>
                  <span className="text-xs font-semibnew uppercase tracking-wide text-secondary">
                    🔍 Searching your garden…
                  </span>
                </div>
              </div>
            )}

            {/* Garden sources — compact badge after assistant messages */}
            {!isStreaming && lastGardenSeeds.length > 0 && (
              <div className="flex items-center gap-2 px-2 mb-3 animate-in fade-in">
                <span className="material-symbols-outlined text-primary/40" style={{ fontSize: '12px', fontVariationSettings: '"FILL" 1' }}>park</span>
                <span className="text-[10px] text-on-surface-variant/40">
                  Enriched by: {lastGardenSeeds.map(s => s.title).join(', ')}
                </span>
              </div>
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
                  <Shimmer className="text-sm text-primary">Thinking...</Shimmer>
                </div>
              )}

            {/* Error state */}
            {status === 'error' && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm bg-error/10 text-error">
                <span className="material-symbols-outlined text-sm">error</span>
                Something went wrong. Try again.
              </div>
            )}
              </>
            )}
          </ConversationContent>

          <ConversationScrollButton />
        </Conversation>
      </main>

      {/* ── Suggestions below messages ─────────────── */}
      <div className="max-w-2xl mx-auto w-full px-4 pb-1">
        <Suggestions>
          {dynamicSuggestions.map((s) => (
            <Suggestion
              key={s}
              suggestion={s}
              onClick={handleSuggestion}
              className="rounded-2xl bg-surface-container border-outline-variant/15 text-on-surface-variant"
            />
          ))}
        </Suggestions>
      </div>

      {/* ── Input area ───────────────────────────────── */}
      <div className="shrink-0 px-4 pb-36 md:pb-8 pt-10 bg-gradient-to-t from-background via-background/90 to-transparent relative z-40">
        {/* Recording indicator */}
        {voiceState === 'recording' && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-error/10 text-error text-xs font-semibnew px-4 py-2 rounded-full animate-in fade-in slide-in-from-bottom-2">
            <span className="w-2 h-2 bg-error rounded-full animate-pulse" />
            Recording {Math.floor(voiceDuration / 60)}:{String(voiceDuration % 60).padStart(2, '0')}
          </div>
        )}
        {voiceState === 'processing' && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-secondary/10 text-secondary text-xs font-semibnew px-4 py-2 rounded-full animate-in fade-in slide-in-from-bottom-2">
            <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            Transcribing…
          </div>
        )}
        <div className="max-w-2xl mx-auto">
          <PromptBox
            name="message"
            disabled={isStreaming}
            isRecording={voiceState === 'recording'}
            isProcessingVoice={voiceState === 'processing'}
            recordingDuration={voiceDuration}
            onToggleVoice={toggleRecording}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              const text = e.target.value
              const urlRegex = /https?:\/\/[^\s<>\]\)"']+/g
              const urls = text.match(urlRegex) || []
              setDetectedUrls(urls)
            }}
            onSubmit={async (text: string) => {
              if (text?.trim() && status === 'ready') {
                const enrichedText = await enrichWithGarden(text.trim())
                sendMessage({ text: enrichedText })
              }
            }}
          />
        </div>
      </div>

      {/* Voice recording overlay */}
      <VoiceRecordingOverlay
        isRecording={voiceState === 'recording'}
        isProcessing={voiceState === 'processing'}
        duration={voiceDuration}
        onCancel={toggleRecording}
        onStop={toggleRecording}
      />

      <BottomNav />
    </div>
  )
}
