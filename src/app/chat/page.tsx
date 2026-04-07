'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PromptBox } from '@/components/ui/chatgpt-prompt-input'
import { VoiceOverlay } from '@/components/ui/voice-overlay'
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
import { ActivitySummary } from '@/components/activity-summary'
import { ConversationSidebar, type ConversationMeta } from '@/components/ai-elements/conversation-sidebar'
import { SparkCard, type SparkNotification } from '@/components/ai-elements/spark-card'

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
  // Prevent double-firing the push notification prompt
  const [pushPromptHandled, setPushPromptHandled] = useState(false)
  // Voice transcript queue — holds text if chat is streaming when transcription completes
  const pendingTranscriptRef = useRef<string | null>(null)
  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [conversations, setConversations] = useState<ConversationMeta[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string>('')
  // SparkCard — shown when a push notification is clicked
  const [sparkNotification, setSparkNotification] = useState<SparkNotification | null>(null)
  // Track if we've already fetched suggestions on mount
  const suggestionsInitializedRef = useRef(false)

  const fetchSuggestions = useCallback((token: string) => {
    console.log('[suggestions] Fetching...')
    fetch('/api/garden/prompt-suggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ count: 4 }),
      signal: AbortSignal.timeout(5000),
    })
      .then(r => {
        if (!r.ok) {
          console.warn('[suggestions] API returned status:', r.status)
          return null
        }
        return r.json()
      })
      .then(data => {
        if (!data) {
          console.warn('[suggestions] No data returned')
          return
        }
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          console.log('[suggestions] ✓ Loaded', data.suggestions.length, 'suggestions:', data.suggestions)
          setDynamicSuggestions(data.suggestions)
        } else {
          console.warn('[suggestions] API returned empty or invalid suggestions:', data)
        }
      })
      .catch(err => {
        console.error('[suggestions] Fetch failed:', err.message)
        // Keep fallback suggestions
      })
  }, [])

  useEffect(() => {
    try {
      const token = localStorage.getItem('greenplot_token') || ''
      setAuthToken(token)
      // Only fetch suggestions ONCE after app is restored and we have a token
      if (restored && token && !suggestionsInitializedRef.current) {
        console.log('[suggestions] Initializing (restored=', restored, ', initialized=', suggestionsInitializedRef.current, ')')
        suggestionsInitializedRef.current = true
        fetchSuggestions(token)
      }
    } catch (err) {
      console.error('[suggestions] Init error:', err)
    }
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
      const msg = String(err)
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('not authenticated')) {
        toast.error('Session expired — please log in again', {
          action: { label: 'Log in', onClick: () => { window.location.href = '/login' } },
        })
      }
    },
  })

  // ── Conversation helpers ──────────────────────────────
  const genId = () => `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const loadConvMessages = (id: string) => {
    try {
      const raw = localStorage.getItem(`greenplot_conv_${id}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return []
  }

  const saveConvMessages = (id: string, msgs: any[]) => {
    try {
      localStorage.setItem(`greenplot_conv_${id}`, JSON.stringify(msgs.slice(-50)))
    } catch {}
  }

  const saveConvIndex = (convs: ConversationMeta[]) => {
    try {
      localStorage.setItem('greenplot_conversations', JSON.stringify(convs))
    } catch {}
  }

  // Restore messages from localStorage — survives refresh, logout, tab close
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    if (restored) return
    setRestored(true)
    try {
      // Load conversations index
      const indexRaw = localStorage.getItem('greenplot_conversations')
      let convs: ConversationMeta[] = []
      let activeId = ''

      if (indexRaw) {
        const parsed = JSON.parse(indexRaw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          convs = parsed
          activeId = localStorage.getItem('greenplot_active_conv') || parsed[0].id
        }
      }

      // Migrate from old single-conversation storage
      if (convs.length === 0) {
        const legacy = localStorage.getItem('greenplot_chat_messages')
        const legacyId = genId()
        const legacyMsgs = legacy ? (() => { try { return JSON.parse(legacy) } catch { return [] } })() : []
        if (legacyMsgs.length > 0) {
          const firstUserMsg = legacyMsgs.find((m: any) => m.role === 'user')
          const title = firstUserMsg?.parts?.[0]?.text?.slice(0, 40) || 'Previous chat'
          convs = [{ id: legacyId, title, updatedAt: new Date().toISOString() }]
          saveConvMessages(legacyId, legacyMsgs)
        }
        activeId = legacyId
      }

      // Ensure there's always at least one conversation
      if (convs.length === 0) {
        const newId = genId()
        convs = [{ id: newId, title: 'New chat', updatedAt: new Date().toISOString() }]
        activeId = newId
      }

      setConversations(convs)
      setActiveConversationId(activeId)
      saveConvIndex(convs)
      localStorage.setItem('greenplot_active_conv', activeId)

      // Load messages for active conversation
      const msgs = loadConvMessages(activeId)
      if (msgs.length > 0) {
        setMessages(msgs)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored])

  // Show SparkCard from push notification click (?spark_prompt=...) — initial page load
  useEffect(() => {
    if (pushPromptHandled || !restored) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const sparkPrompt = params.get('spark_prompt')
    if (!sparkPrompt) return
    // Clear the query params immediately so refresh doesn't re-fire
    window.history.replaceState({}, '', '/chat')
    setPushPromptHandled(true)
    setSparkNotification({
      title: params.get('spark_title') || 'Morning Spark',
      body: params.get('spark_body') || sparkPrompt,
      prompt: sparkPrompt,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, pushPromptHandled])

  // Handle PUSH_SPARK messages from service worker (app already open)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SPARK') {
        setSparkNotification({
          title: event.data.title || 'Morning Spark',
          body: event.data.body || event.data.prompt || '',
          prompt: event.data.prompt || '',
        })
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  // Poll for push notifications every 60 seconds
  useEffect(() => {
    const interval = setInterval(pollNotifications, 60000)
    pollNotifications() // check immediately
    return () => clearInterval(interval)
  }, [])

  // Persist messages to the active conversation whenever they change
  useEffect(() => {
    if (!restored || !activeConversationId) return
    if (messages.length > 0) {
      saveConvMessages(activeConversationId, messages)
      // Update conversation title from first user message and bump updatedAt
      const firstUser = messages.find(m => m.role === 'user')
      const title = (firstUser?.parts?.find((p: any) => p.type === 'text') as any)?.text?.slice(0, 40) || 'New chat'
      setConversations(prev => {
        const updated = prev.map(c =>
          c.id === activeConversationId ? { ...c, title, updatedAt: new Date().toISOString() } : c
        )
        saveConvIndex(updated)
        return updated
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, restored, activeConversationId])

  // ── Conversation management ───────────────────────
  const handleNewChat = () => {
    const newId = genId()
    const newConv: ConversationMeta = { id: newId, title: 'New chat', updatedAt: new Date().toISOString() }
    setConversations(prev => {
      const updated = [newConv, ...prev]
      saveConvIndex(updated)
      return updated
    })
    setActiveConversationId(newId)
    localStorage.setItem('greenplot_active_conv', newId)
    setMessages([])
    // Refresh suggestions based on latest seeds
    suggestionsInitializedRef.current = false // Allow fetch on new chat
    const token = localStorage.getItem('greenplot_token') || ''
    fetchSuggestions(token)
  }

  const handleSelectConversation = (id: string) => {
    if (id === activeConversationId) return
    setActiveConversationId(id)
    localStorage.setItem('greenplot_active_conv', id)
    const msgs = loadConvMessages(id)
    setMessages(msgs)
  }

  // ── Garden Enrichment ──────────────────────────────
  // API decides intelligently whether to enrich based on:
  // 1. Intent classification (is this a substantive question?)
  // 2. Relevance gate (do garden results actually match?)

  // ── SparkCard handler ─────────────────────────────
  const handleSparkChat = useCallback((content: string) => {
    setSparkNotification(null)
    // Inject the pre-generated spark as an assistant message — instant, no AI wait
    setMessages([{
      id: genId(),
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: content }],
      createdAt: new Date(),
    }] as any)
  }, [setMessages])

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
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      } else {
        // Chat is streaming — queue the transcript; it will be drained when ready
        pendingTranscriptRef.current = text
        toast('🎙️ Voice memo queued — will send when response finishes')
      }
    },
    [status, sendMessage, enrichWithGarden]
  )

  // Drain pending voice transcript as soon as chat becomes ready
  useEffect(() => {
    if (status !== 'ready') return
    const queued = pendingTranscriptRef.current
    if (!queued) return
    pendingTranscriptRef.current = null
    enrichWithGarden(`🎙️ Voice memo: ${queued}`).then(enriched => {
      sendMessage({ text: enriched })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

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

  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false)

  const isStreaming = status === 'submitted' || status === 'streaming'

  return (
    <div className="flex flex-col h-dvh bg-background">
      <Header onMenuClick={() => setSidebarOpen(true)} />

      {/* ── Conversation Sidebar ─────────────────────────── */}
      <ConversationSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
      />

      {/* ── Messages ─────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden" style={{ paddingTop: 'var(--header-height)' }}>
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState>
                <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto w-full">
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
                    <h2 className="text-xl font-extrabold tracking-tight mb-1.5 text-on-surface">
                      Start a conversation
                    </h2>
                    <p className="text-sm font-medium leading-relaxed text-on-surface-variant">
                      Ask questions, capture ideas, or search the web. Your AI second brain is ready to grow with you.
                    </p>
                  </div>

                  {/* Suggestion chips */}
                  <ActivitySummary token={authToken} />
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
                            className="user-bubble bg-surface-container-high text-on-surface px-5 py-3 shadow-sm"
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
                  <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
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
                  <span className="text-xs font-semibold uppercase tracking-wide text-tertiary">
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
                  <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
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

      {/* ── Input area ───────────────────────────────── */}
      <div
        className="shrink-0 px-4 pt-4 bg-gradient-to-t from-background via-background/90 to-transparent relative"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.5rem)' }}
      >
        {/* Recording indicator */}
        {voiceState === 'recording' && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-error/10 text-error text-xs font-semibold px-4 py-2 rounded-full animate-in fade-in slide-in-from-bottom-2">
            <span className="w-2 h-2 bg-error rounded-full animate-pulse" />
            Recording {Math.floor(voiceDuration / 60)}:{String(voiceDuration % 60).padStart(2, '0')}
          </div>
        )}
        {voiceState === 'processing' && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-secondary/10 text-secondary text-xs font-semibold px-4 py-2 rounded-full animate-in fade-in slide-in-from-bottom-2">
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
            onOpenVoice={() => setVoiceOverlayOpen(true)}
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

      <BottomNav />

      {/* ── Spark Card — shown when push notification is clicked ── */}
      {sparkNotification && (
        <SparkCard
          notification={sparkNotification}
          onChatAboutThis={handleSparkChat}
          onDismiss={() => setSparkNotification(null)}
          token={authToken}
        />
      )}

      {/* ── Voice overlay (Siri-style) ────────────────── */}
      <VoiceOverlay
        isOpen={voiceOverlayOpen}
        onClose={() => setVoiceOverlayOpen(false)}
        onTranscription={async (text) => {
          setVoiceOverlayOpen(false)
          if (status === 'ready') {
            const enrichedText = await enrichWithGarden(`🎙️ Voice memo: ${text}`)
            sendMessage({ text: enrichedText })
          }
        }}
        onError={(msg) => {
          toast.error(`🎙️ ${msg}`)
        }}
        authToken={authToken}
      />
    </div>
  )
}
