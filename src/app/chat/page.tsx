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
import { THINKING_MODES, getMode, type ThinkingMode } from '@/lib/thinking-modes'
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

// Garden graph
import { FullScreenGraph } from '@/components/seeds/full-screen-graph'

// Icons
import { Plus, ChevronRight, Leaf, Globe, Share2, FileText } from 'lucide-react'

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
        <svg width="16" height="16" viewBox="0 0 16 16" fill={rating === 'up' ? 'var(--green-700)' : 'none'} stroke={rating === 'up' ? 'var(--green-700)' : 'var(--ink-3)'} strokeWidth="1.5"><path d="M2 10V14h2.5L8 14l5-4.5V8h-3V2.5C10 1.5 9 1 8.5 1.5L5 6v4H2Z"/></svg>
      </button>
      <button
        onClick={() => handleRate('down')}
        className="p-1 rounded-full transition-colors hover:bg-surface-container active:scale-90"
        aria-label="Thumbs down"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill={rating === 'down' ? 'var(--red)' : 'none'} stroke={rating === 'down' ? 'var(--red)' : 'var(--ink-3)'} strokeWidth="1.5"><path d="M14 6V2h-2.5L8 2l-5 4.5V8h3v5.5C6 14.5 7 15 7.5 14.5L11 10V6h3Z"/></svg>
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
  // Backend session_id per conversation (for persistent chat history)
  const sessionIdRef = useRef<string>('')
  // Inline garden visualization from tool call
  const [gardenVizData, setGardenVizData] = useState<{ nodes: any[]; links: any[]; stats: any } | null>(null)
  // SparkCard — shown when a push notification is clicked
  const [sparkNotification, setSparkNotification] = useState<SparkNotification | null>(null)
  // Track if we've already fetched suggestions on mount
  const suggestionsInitializedRef = useRef(false)

  // ── Thinking-partner modes (GStack personas via _system_override) ──
  const [selectedMode, setSelectedMode] = useState<ThinkingMode | undefined>(undefined)
  const activeModeRef = useRef<ThinkingMode | undefined>(undefined)
  useEffect(() => { activeModeRef.current = selectedMode }, [selectedMode])
  // Ref to the composer textarea — used to pre-fill from "Develop into a spec"
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const modeInitRef = useRef(false)

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
      headers: () => {
        const t = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
        return { Authorization: t ? `Bearer ${t}` : '' }
      },
      body: () => ({
        _auth_token: typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : '',
        // Include backend session_id so conversations persist across page loads
        session_id: sessionIdRef.current || '',
        // Active thinking-partner persona (empty string = default assistant)
        _system_override: activeModeRef.current?.systemPrompt || '',
      }),
    }),
    experimental_throttle: 50,
    onError: (err) => {
      console.error('[chat] useChat error:', err)
      const msg = String(err)
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('not authenticated') || msg.toLowerCase().includes('could not validate')) {
        localStorage.removeItem('greenplot_token')
        localStorage.removeItem('greenplot_tenant')
        localStorage.removeItem('greenplot_nickname')
        window.location.href = '/login'
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

      // Restore backend session_id for active conversation
      sessionIdRef.current = localStorage.getItem(`greenplot_session_${activeId}`) || ''

      // Load messages for active conversation
      const msgs = loadConvMessages(activeId)
      if (msgs.length > 0) {
        // Re-attach source-url parts — AI SDK setMessages may strip them during reconstruction
        let mergedMsgs = msgs
        try {
          const sourcesRaw = localStorage.getItem(`greenplot_sources_${activeId}`)
          if (sourcesRaw) {
            const sourcesMap: Record<string, any[]> = JSON.parse(sourcesRaw)
            mergedMsgs = msgs.map((m: any) => {
              const saved = sourcesMap[m.id]
              if (!saved?.length) return m
              const existingUrls = new Set(
                (m.parts as any[]).filter((p: any) => p.type === 'source-url').map((p: any) => p.url)
              )
              const toAdd = saved.filter((p: any) => !existingUrls.has(p.url))
              return toAdd.length > 0 ? { ...m, parts: [...m.parts, ...toAdd] } : m
            })
          }
        } catch {}
        setMessages(mergedMsgs)
      }

      // Merge backend sessions into conversation list (best-effort, async)
      const token = localStorage.getItem('greenplot_token') || ''
      if (token) {
        fetch('/api/sessions', {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        })
          .then(r => r.ok ? r.json() : null)
          .then((sessions: Array<{ id: string; title: string; updated_at: string; message_count: number }> | null) => {
            if (!sessions || !Array.isArray(sessions)) return
            setConversations(prev => {
              // Add backend sessions not already in local list (identified by session_id stored in localStorage)
              const localSessionIds = new Set(
                prev.map(c => localStorage.getItem(`greenplot_session_${c.id}`)).filter(Boolean)
              )
              const newFromBackend = sessions
                .filter(s => !localSessionIds.has(s.id) && s.message_count > 0)
                .map(s => ({
                  id: `backend_${s.id}`,
                  title: s.title || 'Chat session',
                  updatedAt: s.updated_at || new Date().toISOString(),
                  _backendSessionId: s.id,
                }))
              // Store session_id mapping for backend convs
              for (const bc of newFromBackend) {
                localStorage.setItem(`greenplot_session_${bc.id}`, (bc as any)._backendSessionId)
              }
              if (newFromBackend.length === 0) return prev
              const merged = [...prev, ...newFromBackend]
              saveConvIndex(merged.map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })))
              return merged.map(c => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }))
            })
          })
          .catch(() => {/* silent — backend may be unreachable */})
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored])

  // Activate a thinking mode from ?mode= and pre-fill the composer from a seed
  // ("Develop into a spec"). Uses window.location.search (NOT useSearchParams) to
  // avoid a Suspense-boundary requirement at build time.
  useEffect(() => {
    if (!restored || modeInitRef.current) return
    if (typeof window === 'undefined') return
    modeInitRef.current = true

    const params = new URLSearchParams(window.location.search)
    const modeId = params.get('mode')
    const mode = getMode(modeId)
    if (mode) setSelectedMode(mode)

    // Pre-fill from a seed handed off by the seed detail sheet
    const prefillRaw = localStorage.getItem('greenplot_spec_prefill')
    if (prefillRaw) {
      localStorage.removeItem('greenplot_spec_prefill')
      try {
        const prefill = JSON.parse(prefillRaw)
        if (!mode) setSelectedMode(getMode('spec'))
        const text = `I want to spec out this idea:\n\n${prefill.title ? prefill.title + '\n\n' : ''}${prefill.content || ''}`.trim()
        // Defer until the PromptBox has mounted, then inject + sync internal state
        setTimeout(() => {
          const ta = promptRef.current
          if (ta) {
            ta.value = text
            ta.dispatchEvent(new Event('input', { bubbles: true }))
            ta.focus()
          }
        }, 120)
      } catch {}
    }

    // Strip ?mode= so a refresh doesn't re-trigger, preserving any other params
    if (modeId) {
      params.delete('mode')
      const qs = params.toString()
      window.history.replaceState({}, '', '/chat' + (qs ? `?${qs}` : ''))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored])

  // Save the latest assistant message as a PRD (spec mode). localStorage is the
  // guaranteed path; the backend write is best-effort (routes via /thoughts).
  const handleSaveAsPRD = useCallback((text: string) => {
    if (!text.trim()) return
    const firstLine = text.split('\n').map(l => l.replace(/^#+\s*/, '').trim()).find(Boolean) || 'Untitled spec'
    const title = firstLine.slice(0, 80)
    try {
      const raw = localStorage.getItem('greenplot_prds')
      const list = raw ? JSON.parse(raw) : []
      const entry = { id: `local_${Date.now()}`, title, content: text, createdAt: new Date().toISOString(), source: 'spec_mode' }
      localStorage.setItem('greenplot_prds', JSON.stringify([entry, ...(Array.isArray(list) ? list : [])].slice(0, 100)))
    } catch {}
    // Best-effort backend persistence
    const token = localStorage.getItem('greenplot_token')
    fetch('/api/seeds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ content: text.slice(0, 8000), source: 'spec_mode', seed_type: 'spec', metadata: { tags: ['prd', 'spec'] } }),
    }).catch(() => {})
    toast.success('Saved as PRD — view it in Studio', {
      action: { label: 'Studio', onClick: () => { window.location.href = '/studio' } },
    })
  }, [])

  // Show SparkCard from push notification click (?spark_prompt=...) — initial page load
  useEffect(() => {
    if (pushPromptHandled || !restored) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const sparkPrompt = params.get('spark_prompt')
    const sparkTitle = params.get('spark_title')
    if (!sparkPrompt || !sparkTitle) return

    // Clear the query params immediately so refresh doesn't re-fire
    window.history.replaceState({}, '', '/chat')
    setPushPromptHandled(true)

    // Check if service worker stored a briefing in window
    const storedBriefing = (window as any).__SPARK_BRIEFING
    if (storedBriefing) {
      console.log('[PUSH_SPARK] Using briefing stored by SW:', storedBriefing)
      setSparkNotification(storedBriefing as SparkNotification)
      // Clean up after using
      delete (window as any).__SPARK_BRIEFING
      return
    }

    // Fallback: create basic notification from URL params only
    console.log('[PUSH_SPARK] Using URL param fallback (no briefing stored)')
    const sparkBody = params.get('spark_body') || sparkPrompt
    setSparkNotification({
      type: 'morning_spark',
      title: sparkTitle || 'Briefing',
      sections: sparkBody
        ? [{
          title: '',
          icon: 'lightbulb',
          color: 'text-primary',
          content: sparkBody,
        }]
        : [],
      prompt: sparkPrompt,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, pushPromptHandled])

  // Handle PUSH_SPARK messages from service worker (app already open)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SPARK') {
        // If full briefing structure is available, use it directly
        if (event.data.briefing) {
          // Store in window for URL param handler to find
          (window as any).__SPARK_BRIEFING = event.data.briefing
          console.log('[PUSH_SPARK] Setting SparkCard with full briefing')
          setSparkNotification(event.data.briefing as SparkNotification)
        } else {
          console.log('[PUSH_SPARK] No briefing in SW message, using fallback')
          // Fallback to creating a basic notification from title/body
          setSparkNotification({
            type: 'morning_spark',
            title: event.data.title || 'Briefing',
            sections: event.data.body || event.data.prompt
              ? [{
                title: '',
                icon: 'lightbulb',
                color: 'text-primary',
                content: event.data.body || event.data.prompt || '',
              }]
              : [],
            prompt: event.data.prompt,
          })
        }
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
  }, [])

  // Poll for push notifications every 60 seconds
  useEffect(() => {
    const handleBriefing = (briefing: SparkNotification) => {
      console.log('[poll] New briefing:', briefing.type, '—', briefing.sections.length, 'sections')
      setSparkNotification(briefing)
    }
    const interval = setInterval(() => pollNotifications(handleBriefing), 60000)
    pollNotifications(handleBriefing) // check immediately
    return () => clearInterval(interval)
  }, [])

  // Persist messages to the active conversation whenever they change
  useEffect(() => {
    if (!restored || !activeConversationId) return
    if (messages.length > 0) {
      saveConvMessages(activeConversationId, messages)
      // Save source-url parts separately — AI SDK setMessages may strip them on restore
      const sourcesMap: Record<string, any[]> = {}
      for (const msg of messages) {
        const srcs = (msg.parts as any[]).filter((p: any) => p.type === 'source-url')
        if (srcs.length > 0) sourcesMap[msg.id] = srcs
      }
      try {
        localStorage.setItem(`greenplot_sources_${activeConversationId}`, JSON.stringify(sourcesMap))
      } catch {}
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
    // Restore backend session_id for this conversation
    sessionIdRef.current = localStorage.getItem(`greenplot_session_${id}`) || ''
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

  // Day name for hero eyebrow
  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()

  return (
    <div style={{ background: 'var(--bg)', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Compact dark header for chat — not a full tall hero */}
      <div style={{ background: 'var(--forest-1)', position: 'sticky', top: 0, zIndex: 40, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
          {/* Brand mark */}
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #22c55e, #15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2C7 2 3 5 3 8.5C3 10.43 4.84 12 7 12C9.16 12 11 10.43 11 8.5C11 5 7 2 7 2Z" fill="#fff" opacity="0.9"/><path d="M7 2L7 12" stroke="#fff" strokeWidth="0.8" opacity="0.4"/></svg>
            </div>
            <div>
              <div className="caps" style={{ fontSize: 9, color: 'rgba(180,240,205,0.7)' }}>{dayName} · LIVING LABORATORY</div>
              {selectedMode && (
                <div className="ui" style={{ fontSize: 11, fontWeight: 600, color: '#7ef0a8' }}>{selectedMode.label} mode</div>
              )}
            </div>
          </button>
          {/* Mode chip */}
          {selectedMode && (
            <button onClick={() => setSelectedMode(undefined)} className="glass-dark tap" style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 9999, padding: '5px 10px', border: 'none', cursor: 'pointer' }}>
              <span className="ui" style={{ fontSize: 11, fontWeight: 600, color: '#7ef0a8' }}>{selectedMode.label}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="rgba(126,240,168,0.7)" strokeWidth="1.5"/></svg>
            </button>
          )}
          <button onClick={handleNewChat} className="glass-dark tap" style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="rgba(180,240,205,0.85)" strokeWidth="1.75" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

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
      <main className="flex-1 min-h-0 overflow-hidden" style={{ paddingTop: 0 }}>
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState>
                <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto w-full">
                  {/* Brand icon */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 99, filter: 'blur(20px)', opacity: 0.3, background: 'var(--green)', transform: 'scale(1.8)' }} />
                    <div style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(160deg,#34d97a,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      <Leaf size={30} color="#06281a" strokeWidth={1.75} />
                    </div>
                  </div>

                  {/* Title */}
                  <div style={{ textAlign: 'center' }}>
                    <h2 className="serif" style={{ fontSize: 26, color: 'var(--ink)', marginBottom: 8 }}>
                      Start a conversation
                    </h2>
                    <p className="body-text" style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 280, margin: '0 auto' }}>
                      Ask questions, capture ideas, or search the web. Your thinking partner is ready.
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
                const allSourceParts = message.parts.filter((p) => p.type === 'source-url')
                // Intercept sentinel sources: session_id and visualization data
                const sourceParts = allSourceParts.filter((p) => {
                  const sp = p as { url: string; title?: string; sourceId?: string }
                  if (sp.title?.startsWith('__session__:')) {
                    // Extract and persist session_id for this conversation
                    const sid = sp.title.replace('__session__:', '')
                    if (sid && sid !== sessionIdRef.current) {
                      sessionIdRef.current = sid
                      if (activeConversationId) {
                        localStorage.setItem(`greenplot_session_${activeConversationId}`, sid)
                      }
                    }
                    return false // Don't render
                  }
                  if (sp.title?.startsWith('__visualization__:')) {
                    // Extract visualization data — rendered inline below
                    try {
                      const vizJson = sp.title.replace('__visualization__:', '')
                      const viz = JSON.parse(vizJson)
                      if (viz.nodes && !gardenVizData) {
                        setGardenVizData(viz)
                      }
                    } catch {}
                    return false // Don't render as a clickable source
                  }
                  if (sp.title?.startsWith('__spec__:')) {
                    // Spec sentinel — filtered out; write_spec card is rendered via tool output
                    return false
                  }
                  return true
                })
                const isUser = message.role === 'user'
                const isLastAssistant = !isUser && msgIdx === messages.length - 1

                if (!msgTimesRef.current[message.id]) {
                  msgTimesRef.current[message.id] = formatTime()
                }
                const timeStr = msgTimesRef.current[message.id]

                return (
                  <div key={message.id}>
                    {/* ── User message ─────────────────────────── */}
                    {isUser ? (
                      <div className="flex flex-col items-end gap-2 pl-12 mb-8">
                        <Message from="user">
                          <MessageContent
                            className="user-bubble px-5 py-3 shadow-sm"
                            style={{ background: 'var(--green-tint)', color: 'var(--green-deep)', borderRadius: '18px 18px 5px 18px', fontFamily: 'var(--body)', fontSize: 15 } as React.CSSProperties}
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
                        </div>
                      </div>
                    ) : (
                      /* ── Assistant message ────────────────────── */
                      <div style={{ display: 'flex', gap: 10, marginBottom: 24, paddingRight: 8 }} className="rise">
                        {/* Green gradient leaf avatar */}
                        <div style={{
                          width: 30, height: 30, borderRadius: 10, flexShrink: 0, marginTop: 2,
                          background: 'linear-gradient(160deg,#34d97a,#15803d)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Leaf size={16} color="#06281a" strokeWidth={1.75} />
                        </div>
                        {/* Content column */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                        {/* "Searched your garden" chip — shown when garden seeds were used */}
                        {lastGardenSeeds.length > 0 && msgIdx === messages.length - 1 && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--green-tint)', borderRadius: 9999, padding: '5px 10px' }}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5C6 1.5 3 4 3 6.5C3 7.88 4.34 9 6 9C7.66 9 9 7.88 9 6.5C9 4 6 1.5 6 1.5Z" fill="var(--green-700)"/></svg>
                              <span className="ui" style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-700)' }}>Searched your garden · {lastGardenSeeds.length} seed{lastGardenSeeds.length !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        )}
                        <Message from="assistant">
                          <MessageContent
                            className="assistant-bubble px-5 py-4"
                            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 18, boxShadow: '0 1px 2px rgba(20,19,12,0.03)' } as React.CSSProperties}
                          >
                            <div>
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
                                        <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium select-none" style={{ color: 'var(--ink-3)' }}>
                                          <ChevronRight size={14} color="var(--ink-3)" strokeWidth={1.75} className="transition-transform group-open:rotate-90" />
                                          Thought process
                                        </summary>
                                        <div className="mt-2 ml-5 text-xs leading-relaxed whitespace-pre-wrap rounded-2xl p-3" style={{ background: 'var(--surface-sunk)', color: 'var(--ink-2)' }}>
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

                                  // Check if this is a garden visualization tool output
                                  const isVizTool = tp.type === 'tool-visualize_garden' ||
                                    (tp.input && (tp.input as any).limit !== undefined && tp.type?.includes('visualize'))
                                  let vizOutput: { nodes: any[]; links: any[]; stats: any } | null = null
                                  if (tp.output) {
                                    try {
                                      const parsed = typeof tp.output === 'string' ? JSON.parse(tp.output) : tp.output
                                      if (parsed.type === 'garden_visualization' && parsed.status === 'ok') {
                                        vizOutput = { nodes: parsed.nodes, links: parsed.links, stats: parsed.stats }
                                      }
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
                                          {(() => {
                                            // Parse tool output for rich rendering
                                            let parsedOutput: any = null
                                            try {
                                              parsedOutput = tp.output != null
                                                ? (typeof tp.output === 'string' ? JSON.parse(tp.output) : tp.output)
                                                : null
                                            } catch {}

                                            if (vizOutput) {
                                              return (
                                                <div className="mt-2 p-4 rounded-2xl" style={{ background: 'var(--surface-sunk)', border: '1px solid var(--hairline)' }}>
                                                  <div className="flex items-center gap-2 mb-3">
                                                    <Share2 size={17} color="var(--green-700)" strokeWidth={1.75} />
                                                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Garden Knowledge Graph</p>
                                                  </div>
                                                  <div className="grid grid-cols-3 gap-3 mb-3">
                                                    <div className="text-center p-2 rounded-xl bg-surface-container">
                                                      <p className="text-xl font-bold text-primary">{vizOutput.stats.total_seeds}</p>
                                                      <p className="text-[10px] text-on-surface-variant">Seeds</p>
                                                    </div>
                                                    <div className="text-center p-2 rounded-xl bg-surface-container">
                                                      <p className="text-xl font-bold text-primary">{vizOutput.links.length}</p>
                                                      <p className="text-[10px] text-on-surface-variant">Connections</p>
                                                    </div>
                                                    <div className="text-center p-2 rounded-xl bg-surface-container">
                                                      <p className="text-xl font-bold text-primary">{vizOutput.stats.domains?.length || 0}</p>
                                                      <p className="text-[10px] text-on-surface-variant">Domains</p>
                                                    </div>
                                                  </div>
                                                  {vizOutput.stats.domains && vizOutput.stats.domains.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                                      {vizOutput.stats.domains.map(([domain, count]: [string, number]) => (
                                                        <span key={domain} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                                          {domain || 'General'} · {count}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  )}
                                                  <button
                                                    onClick={() => setGardenVizData(vizOutput)}
                                                    className="tap"
                                                    style={{ width: '100%', background: 'var(--green-tint)', border: 'none', borderRadius: 10, padding: '8px', fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--green-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                                                  >
                                                    <Share2 size={14} color="var(--green-700)" strokeWidth={1.75} />
                                                    Open Interactive Graph
                                                  </button>
                                                </div>
                                              )
                                            }

                                            // Image generated by generate_image tool
                                            if (parsedOutput?.type === 'image_generated' && parsedOutput?.url) {
                                              return (
                                                <div className="mt-2 rounded-2xl overflow-hidden border border-outline-variant/10">
                                                  <img
                                                    src={parsedOutput.url}
                                                    alt={parsedOutput.prompt || 'Generated image'}
                                                    className="w-full h-auto"
                                                    loading="lazy"
                                                  />
                                                  <div className="px-4 py-2 flex items-center gap-2" style={{ background: 'var(--surface-sunk)' }}>
                                                    <p className="text-[10px] truncate flex-1" style={{ color: 'var(--ink-3)' }}>{parsedOutput.prompt}</p>
                                                    <a href={parsedOutput.url} target="_blank" rel="noopener noreferrer" className="text-[10px]" style={{ color: 'var(--green-700)', fontWeight: 600 }}>Open</a>
                                                  </div>
                                                </div>
                                              )
                                            }

                                            // write_spec — PRD saved to Studio & Library
                                            if (tp.type === 'write_spec' && parsedOutput?.status === 'ok') {
                                              return (
                                                <div className="mt-2 p-3 rounded-2xl flex items-center gap-3" style={{ background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)' }}>
                                                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <FileText size={19} color="#06281a" strokeWidth={1.75} />
                                                  </div>
                                                  <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p className="ui" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-deep)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parsedOutput.title}</p>
                                                    <p className="body-text" style={{ fontSize: 11.5, color: 'var(--green-700)' }}>PRD saved to Studio & Library</p>
                                                  </div>
                                                  <a href="/studio" className="tap" style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: 'var(--green-700)', textDecoration: 'none', padding: '4px 10px', background: 'rgba(34,197,94,0.15)', borderRadius: 9 }}>
                                                    Open →
                                                  </a>
                                                </div>
                                              )
                                            }

                                            // Wiki article created
                                            if (parsedOutput?.status === 'ok' && parsedOutput?.title && tp.type?.includes('wiki')) {
                                              return (
                                                <div className="mt-2 p-3 rounded-2xl flex items-center gap-3" style={{ background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)' }}>
                                                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <Leaf size={19} color="#06281a" strokeWidth={1.75} />
                                                  </div>
                                                  <div>
                                                    <p className="ui" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-deep)' }}>{parsedOutput.title}</p>
                                                    <p className="body-text" style={{ fontSize: 11.5, color: 'var(--green-700)' }}>Article compiled in Library</p>
                                                  </div>
                                                </div>
                                              )
                                            }

                                            if (tp.output != null || tp.errorText != null) {
                                              return (
                                                <ToolOutput
                                                  output={tp.output != null ? JSON.stringify(tp.output) : undefined}
                                                  errorText={tp.errorText}
                                                />
                                              )
                                            }
                                            return null
                                          })()}
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

                        {/* Web source chips */}
                        {sourceParts.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            {sourceParts.slice(0, 4).map((part, i) => {
                              const p = part as { url: string; title?: string }
                              const isGarden = p.url?.startsWith('/') || p.title?.toLowerCase().includes('seed')
                              return (
                                <a
                                  key={`${message.id}-chip-${i}`}
                                  href={isGarden ? '/garden' : p.url}
                                  target={isGarden ? undefined : '_blank'}
                                  rel="noopener noreferrer"
                                  className="tap"
                                  style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 11, padding: '7px 10px', textDecoration: 'none' }}
                                >
                                  {isGarden
                                    ? <Leaf size={14} color="var(--green-700)" strokeWidth={1.75} />
                                    : <Globe size={14} color="var(--ink-3)" strokeWidth={1.75} />
                                  }
                                  <span className="ui" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {p.title || p.url}
                                  </span>
                                </a>
                              )
                            })}
                          </div>
                        )}

                        {/* Plant this insight → full-width CTA */}
                        {message.parts.some(p => p.type === 'text') && (
                          <button
                            onClick={async () => {
                              const allText = message.parts
                                .filter(p => p.type === 'text')
                                .map(p => (p as any).text || '')
                                .join('\n')
                              if (!allText.trim()) return
                              const token = localStorage.getItem('greenplot_token')
                              try {
                                const res = await fetch('/api/seeds', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                  },
                                  body: JSON.stringify({ content: allText.slice(0, 4000), source: 'chat_message' }),
                                })
                                if (res.ok) toast.success('Planted in Garden 🌱')
                                else toast.error('Failed to plant')
                              } catch { toast.error('Failed to plant') }
                            }}
                            className="tap"
                            style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)', borderRadius: 13, padding: '10px 14px', cursor: 'pointer', width: '100%' }}
                          >
                            <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Plus size={16} color="#fff" strokeWidth={2} />
                            </span>
                            <span style={{ textAlign: 'left' }}>
                              <span className="ui" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--green-deep)' }}>Plant this insight</span>
                              <span className="body-text" style={{ display: 'block', fontSize: 11, color: 'var(--green-700)', opacity: 0.8 }}>Save to your garden as a new seed</span>
                            </span>
                            <ChevronRight size={17} color="var(--green-700)" strokeWidth={1.75} style={{ marginLeft: 'auto' }} />
                          </button>
                        )}

                        {/* Timestamp + rating row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 2 }}>
                          <span className="body-text" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{timeStr}</span>
                          {lastGardenSeeds.length > 0 && msgIdx === messages.length - 1 && (
                            <ThumbsRating messageId={message.id} />
                          )}
                          {/* Save as PRD — spec mode */}
                          {selectedMode?.id === 'spec' && isLastAssistant && message.parts.some(p => p.type === 'text') && (
                            <button
                              onClick={() => {
                                const allText = message.parts
                                  .filter(p => p.type === 'text')
                                  .map(p => (p as any).text || '')
                                  .join('\n')
                                handleSaveAsPRD(allText)
                              }}
                              className="tap"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--green-tint)', border: 'none', borderRadius: 9999, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--ui)', fontSize: 10.5, fontWeight: 700, color: 'var(--green-700)' }}
                            >
                              Save as PRD
                            </button>
                          )}
                        </div>
                        {/* Create Image button — only on reflection responses */}
                        {(() => {
                          const prevUserMsg = msgIdx > 0 ? messages[msgIdx - 1] : null
                          const userText = prevUserMsg?.role === 'user'
                            ? prevUserMsg.parts.filter((p) => p.type === 'text').map((p) => (p as any).text || '').join('')
                            : ''
                          const isLastAss = msgIdx === messages.length - 1
                          const img = generatedImages[message.id]
                          if (!isLastAss || !userText || !isReflection(userText)) return null
                          return (
                            <div style={{ marginTop: 8 }}>
                              {!img && (
                                <CreateImageButton
                                  reflectionText={userText}
                                  authToken={authToken}
                                  onImageGenerated={(url, prompt) => {
                                    setGeneratedImages((prev) => ({ ...prev, [message.id]: { url, prompt } }))
                                  }}
                                />
                              )}
                              {img && (
                                <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--hairline)', maxWidth: 320 }}>
                                  <img src={img.url} alt="Visualization" style={{ width: '100%', height: 'auto', display: 'block' }} loading="lazy" />
                                  <div style={{ padding: '8px 14px', background: 'var(--surface-sunk)' }}>
                                    <p style={{ fontSize: 10, color: 'var(--ink-3)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.prompt}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                        </div>
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
              <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)', borderRadius: 99, padding: '7px 14px' }}>
                  <Globe size={13} color="var(--green-700)" strokeWidth={1.75} />
                  <span className="ui" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--green-700)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {detectedUrls.length === 1 ? 'Link detected — will add to Sources' : `${detectedUrls.length} links detected`}
                  </span>
                </div>
              </div>
            )}

            {/* Garden enrichment indicator */}
            {gardenEnriching && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
                <div className="animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)', borderRadius: 99, padding: '8px 16px' }}>
                  <Leaf size={15} color="var(--green-700)" strokeWidth={1.75} />
                  <span className="ui" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--green-700)', letterSpacing: '0.04em' }}>
                    Enriching from your garden…
                  </span>
                </div>
              </div>
            )}

            {/* Streaming indicator */}
            {isStreaming && !gardenEnriching && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
                <div className="animate-pulse" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-sunk)', border: '1px solid var(--hairline)', borderRadius: 99, padding: '8px 16px' }}>
                  <Leaf size={15} color="var(--ink-3)" strokeWidth={1.75} />
                  <span className="ui" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', letterSpacing: '0.04em' }}>
                    Searching your garden…
                  </span>
                </div>
              </div>
            )}

            {/* Garden sources — compact badge after assistant messages */}
            {!isStreaming && lastGardenSeeds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', marginBottom: 12 }} className="animate-in fade-in">
                <Leaf size={11} color="var(--green-700)" strokeWidth={1.75} style={{ opacity: 0.5 }} />
                <span className="body-text" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 99, background: 'rgba(212,80,62,0.10)', width: 'fit-content' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="rgba(212,80,62,0.9)" strokeWidth="1.5"/>
                  <path d="M8 5v3.5M8 11v.5" stroke="rgba(212,80,62,0.9)" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
                <span className="ui" style={{ fontSize: 12.5, fontWeight: 600, color: 'rgb(180,60,40)' }}>Something went wrong. Try again.</span>
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
        className="shrink-0 px-4 pt-4 relative"
        style={{ background: 'rgba(250,249,246,0.92)', backdropFilter: 'blur(16px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--bottom-nav-height) + 0.5rem)', borderTop: '0.5px solid var(--hairline)' }}
      >
        {/* Recording indicator */}
        {voiceState === 'recording' && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-error/10 text-error text-xs font-semibold px-4 py-2 rounded-full animate-in fade-in slide-in-from-bottom-2">
            <span className="w-2 h-2 bg-error rounded-full animate-pulse" />
            Recording {Math.floor(voiceDuration / 60)}:{String(voiceDuration % 60).padStart(2, '0')}
          </div>
        )}
        {voiceState === 'processing' && (
          <div className="animate-in fade-in slide-in-from-bottom-2" style={{ position: 'absolute', top: -48, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-sunk)', border: '1px solid var(--hairline)', borderRadius: 99, padding: '8px 16px', whiteSpace: 'nowrap' }}>
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="var(--green-700)" strokeWidth="1.5" strokeDasharray="20" strokeDashoffset="10" strokeLinecap="round"/>
            </svg>
            <span className="ui" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>Transcribing…</span>
          </div>
        )}
        {/* Thinking-partner mode chips */}
        <div className="max-w-2xl mx-auto mb-2">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {THINKING_MODES.map((m) => {
              const active = selectedMode?.id === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMode(active ? undefined : m)}
                  className="tap"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    padding: '6px 11px', borderRadius: 9999,
                    fontFamily: 'var(--ui)', fontSize: 11.5, fontWeight: 700,
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: active ? 'var(--green-tint)' : 'var(--surface-sunk)',
                    color: active ? 'var(--green-700)' : 'var(--ink-2)',
                  }}
                  title={m.blurb}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="max-w-2xl mx-auto">
          <PromptBox
            ref={promptRef}
            name="message"
            disabled={isStreaming}
            isDisabled={isStreaming}
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

      {/* ── Garden Graph — shown when visualize_garden tool is called ── */}
      {gardenVizData && (
        <FullScreenGraph
          seeds={gardenVizData.nodes.map((n: any) => ({
            id: n.id,
            title: n.title,
            domain: n.domain || '',
            text: Array.isArray(n.tags) ? n.tags.join(', ') : (n.tags || ''),
          }))}
          open={true}
          onClose={() => setGardenVizData(null)}
        />
      )}

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
