'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PromptBox } from '@/components/ui/chatgpt-prompt-input'
import { VoiceOverlay } from '@/components/ui/voice-overlay'
import { clearAuth } from '@/lib/api'
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
import { AddToGardenButton } from '@/components/ai-elements/add-to-garden-button'

// Layout
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import { ActivitySummary } from '@/components/activity-summary'
import { ConversationSidebar, type ConversationMeta } from '@/components/ai-elements/conversation-sidebar'
import { SparkCard, type SparkNotification } from '@/components/ai-elements/spark-card'
import { PushArrivalBanner } from '@/components/ai-elements/push-banner'
import { Walkthrough } from '@/components/onboarding/walkthrough'

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

// Garden graph
import { FullScreenGraph } from '@/components/seeds/full-screen-graph'

// Icons
import { Plus, ChevronRight, Leaf, Globe, Share2, FileText, AlignLeft, Sprout, Sparkles, Rocket, MessageSquarePlus } from 'lucide-react'

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

// ── Dynamic suggested actions — the model appends <sugg>Label</sugg> lines ──
const SUGG_RE = /<sugg>([\s\S]*?)<\/sugg>/g

function stripSuggTags(text: string): string {
  return text.replace(SUGG_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function collectSuggTags(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(SUGG_RE)) {
    const t = m[1].trim()
    if (t && t.length <= 60 && !out.includes(t)) out.push(t)
  }
  return out
}

// ── Getting-started card — shown in the first chat right after onboarding ──
const STARTER_ACTIONS = [
  {
    icon: Leaf, title: 'Plant your first thought',
    sub: 'Capture an idea — it gets enriched and connected automatically',
    prompt: "Help me plant my first thought. Ask me what's on my mind, then save it as a seed.",
  },
  {
    icon: Sparkles, title: 'See what Greenplot can do',
    sub: 'A quick tour of seeds, briefings, the wiki and the build loop',
    prompt: 'Give me a quick tour — what can you do for me, in plain words?',
  },
  {
    icon: Rocket, title: 'Develop an idea into a PRD',
    sub: 'From a rough idea to a spec a coding agent can build',
    prompt: 'I have a rough idea I want to develop into a buildable spec. Interrogate me.',
  },
]

// Friendly, human labels for tool calls — [while running, when done].
const TOOL_LABELS: Record<string, [string, string]> = {
  search_seeds: ['Searching your garden', 'Searched your garden'],
  search_seeds_filtered: ['Searching your garden', 'Searched your garden'],
  search_wiki: ['Checking your wiki', 'Checked your wiki'],
  web_search: ['Searching the web', 'Searched the web'],
  search_paper_content: ['Reading your papers', 'Read your papers'],
  read_source: ['Reading a source', 'Read a source'],
  get_seed_detail: ['Opening a seed', 'Opened a seed'],
  list_recent_seeds: ['Browsing your garden', 'Browsed your garden'],
  rate_seed: ['Rating a seed', 'Rated a seed'],
  build_ledger: ['Reviewing what you know', 'Reviewed what you know'],
  write_spec: ['Writing a PRD', 'Wrote a PRD'],
  write_product: ['Defining the product', 'Defined the product'],
  update_seed: ['Updating a seed', 'Updated a seed'],
  create_seed: ['Planting a seed', 'Planted a seed'],
  ingest_paper: ['Ingesting a paper', 'Ingested a paper'],
  visualize_garden: ['Mapping your garden', 'Mapped your garden'],
  generate_image: ['Generating an image', 'Generated an image'],
}

function toolLabels(type: string): [string, string] {
  const key = type.replace(/^tool-/, '')
  if (TOOL_LABELS[key]) return TOOL_LABELS[key]
  const words = key.replace(/_/g, ' ')
  return [`Working: ${words}`, words.charAt(0).toUpperCase() + words.slice(1)]
}

// A quiet, single-line status for tool calls that don't produce a result card —
// replaces the bulky raw "tool chip" so a multi-tool turn stays tidy.
function ToolStatusRow({ type, done, errored }: { type: string; done: boolean; errored: boolean }) {
  const [running, finished] = toolLabels(type)
  return (
    <div className="flex items-center gap-2" style={{ margin: '4px 0', fontFamily: 'var(--ui)', fontSize: 12 }}>
      {errored ? (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#c9881b" strokeWidth="1.3"/><path d="M7 4v3.5M7 9.7v.3" stroke="#c9881b" strokeWidth="1.3" strokeLinecap="round"/></svg>
      ) : done ? (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6.5" fill="var(--green-tint)"/><path d="M4.4 7.2l1.7 1.7 3.5-3.8" stroke="var(--green-700)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="animate-spin"><circle cx="7" cy="7" r="5.5" stroke="var(--green-tint-2)" strokeWidth="1.5"/><path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="var(--green-700)" strokeWidth="1.5" strokeLinecap="round"/></svg>
      )}
      <span style={{ color: errored ? '#c9881b' : 'var(--ink-3)' }}>{(done || errored) ? finished : `${running}…`}</span>
    </div>
  )
}

function StarterCard({ onAction, onDismiss }: { onAction: (prompt: string) => void; onDismiss: () => void }) {
  return (
    <div className="v2-card" style={{ width: '100%', maxWidth: 420, borderRadius: 20, overflow: 'hidden', padding: 0, textAlign: 'left' }}>
      <div className="hero-forest" style={{ padding: '16px 18px 14px', position: 'relative' }}>
        <button onClick={onDismiss} aria-label="Dismiss" className="glass-dark tap" style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 9, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2L10 10M10 2L2 10" stroke="rgba(255,255,255,0.85)" strokeWidth="1.75" strokeLinecap="round"/></svg>
        </button>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="caps" style={{ fontSize: 10, color: 'rgba(180,240,205,0.85)' }}>Your garden is planted</span>
          <h3 className="serif" style={{ fontSize: 24, lineHeight: 1.1, color: '#fff', letterSpacing: '-0.01em', marginTop: 5 }}>Here&rsquo;s how to start</h3>
        </div>
      </div>
      <div>
        {STARTER_ACTIONS.map((a, i) => {
          const IconCmp = a.icon
          return (
            <button
              key={a.title} onClick={() => onAction(a.prompt)} className="tap"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', borderBottom: i === STARTER_ACTIONS.length - 1 ? 'none' : '1px solid var(--hairline)' }}
            >
              <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <IconCmp size={17} color="var(--green-700)" strokeWidth={1.75} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="ui" style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{a.title}</span>
                <span className="body-text" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-3)', marginTop: 1 }}>{a.sub}</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M6 3L11 8L6 13" stroke="var(--ink-3)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const [authToken, setAuthToken] = useState('')
  const msgTimesRef = useRef<Record<string, string>>({})
  const [detectedUrls, setDetectedUrls] = useState<string[]>([])
  const [pdfDragOver, setPdfDragOver] = useState(false)
  const [lastGardenSeeds, setLastGardenSeeds] = useState<Array<{id?: string; title: string; domain: string}>>([])
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
  // Push arrival — banner shown first; tapping it expands into the sheet
  const [sparkBanner, setSparkBanner] = useState<{ briefing: SparkNotification; body?: string } | null>(null)
  // Track if we've already fetched suggestions on mount
  const suggestionsInitializedRef = useRef(false)
  // Getting-started card — set by onboarding, shown in the first chat
  const [showStartCard, setShowStartCard] = useState(false)
  // First-visit walkthrough tour — set by onboarding, shown once
  const [showTour, setShowTour] = useState(false)

  // ── Thinking-partner modes (GStack personas via _system_override) ──
  const [selectedMode, setSelectedMode] = useState<ThinkingMode | undefined>(undefined)
  const activeModeRef = useRef<ThinkingMode | undefined>(undefined)
  // One-shot system override (e.g. "turn this conversation into a PRD") — applied
  // to the next send only, then cleared when the turn completes.
  const oneShotOverrideRef = useRef<string | null>(null)
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
        // Active thinking-partner persona (empty string = default assistant).
        // A one-shot override (e.g. "make a PRD") takes precedence for one turn.
        _system_override: oneShotOverrideRef.current || (activeModeRef.current?.systemPrompt || ''),
      }),
    }),
    experimental_throttle: 50,
    onError: (err) => {
      console.error('[chat] useChat error:', err)
      const msg = String(err)
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('not authenticated') || msg.toLowerCase().includes('could not validate')) {
        clearAuth() // also wipes cached chat state so the next user starts clean
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

  // Convert backend session messages ({role, content:[{kind:'text',text}]}) to
  // the UI's AI-SDK shape ({id, role, parts:[{type:'text',text}]}). Used when a
  // conversation only exists on the server (e.g. after a cache wipe or on a new device).
  const backendToUiMessages = (messages: any[]) =>
    (messages || [])
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({
        id: genId(),
        role: m.role,
        parts: (m.content || [])
          .filter((b: any) => b.kind === 'text' && b.text)
          .map((b: any) => ({ type: 'text' as const, text: b.text })),
        createdAt: new Date(),
      }))
      .filter((m: any) => m.parts.length > 0)

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
    const promptParam = params.get('prompt')
    const mode = getMode(modeId)
    if (mode) setSelectedMode(mode)

    // One flow = one session: a mode/prompt/prefill directive arriving while a
    // conversation is open starts a FRESH chat. Stacked directives in one
    // thread made the agent juggle multiple ledgers and triple-fire
    // finalization tools (3 duplicate products on first live run).
    const hasDirective = !!(modeId || promptParam || localStorage.getItem('greenplot_spec_prefill'))
    if (hasDirective && messages.length > 0) {
      handleNewChat()
    }

    // Pre-fill from ?prompt= (e.g. "Grow into an article", "Enrich" buttons)
    if (promptParam) {
      setTimeout(() => {
        const ta = promptRef.current
        if (ta) {
          ta.value = promptParam
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          ta.focus()
        }
      }, 200)
      params.delete('prompt')
    }

    // Pre-fill from a seed handed off by the seed detail sheet
    const prefillRaw = localStorage.getItem('greenplot_spec_prefill')
    if (prefillRaw) {
      localStorage.removeItem('greenplot_spec_prefill')
      try {
        const prefill = JSON.parse(prefillRaw)
        if (!mode && !prefill.vision) setSelectedMode(getMode('spec'))
        // Vision flow: shape an auto-drafted PRD in tandem (spec: auto-prd-pipeline.md)
        const text = prefill.vision
          ? `Shape the vision of this auto-drafted PRD (seed_id: ${prefill.id}).

Here is the current draft:

${prefill.title}

${prefill.content || ''}`.trim()
          : `I want to spec out this idea:\n\n${prefill.title ? prefill.title + '\n\n' : ''}${prefill.content || ''}`.trim()
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

    // Strip ?mode= and ?prompt= so a refresh doesn't re-trigger
    if (modeId || promptParam) {
      params.delete('mode')
      const qs = params.toString()
      window.history.replaceState({}, '', '/chat' + (qs ? `?${qs}` : ''))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored])

  // ── Turn the current conversation into a PRD (mid-chat, any mode) ──
  // Sends a one-shot "synthesize a PRD now" override so the agent writes a full,
  // structured PRD from the discussion (and updates an existing one if it exists)
  // without dropping into the question-asking Spec protocol.
  const createPrdFromChat = useCallback((instruction?: string) => {
    if (status !== 'ready') { toast('One sec — finishing the current response first'); return }
    oneShotOverrideRef.current = [
      'The user wants to turn the CURRENT conversation into a Product Requirements Document right now.',
      'Do NOT run a discovery protocol or ask questions — work from what has already been discussed, plus at most one quick search_seeds for relevant context.',
      'Synthesize a COMPLETE PRD using EXACTLY this structure:',
      '# [Feature Name] — PRD',
      '## Problem Alignment',
      '### Why Now',
      '### Background & Evidence',
      '## Solution Summary',
      '### Target Users',
      '### Definition of Success',
      '### UX / Design Principles',
      '## Scope & Capabilities',
      '### Key Capabilities',
      '### In-Scope: Detailed User Stories',
      '### Out-of-Scope',
      '## Delivery, Risks & Open Questions',
      '### Release Plan & Milestones',
      '### Constraints & Assumptions',
      '### Open Questions & Risks',
      'Write 3-5 substantive sentences under every heading. State reasonable assumptions for anything not yet covered, tagged "(assumed — verify)"; never present invented metrics as derived.',
      'Then immediately call write_spec with the complete markdown. If write_spec reports that a similar PRD already exists, call update_seed with the seed_id it returns to update that PRD in place (do not create a duplicate). Do not ask whether to save.',
    ].join('\n')
    sendMessage({ text: instruction || 'Turn our conversation so far into a complete PRD and save it to my Studio.' })
    toast('Drafting a PRD from this conversation…')
  }, [status, sendMessage])

  // Clear the one-shot override once the turn finishes
  useEffect(() => {
    if (status === 'ready') oneShotOverrideRef.current = null
  }, [status])

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
      setSparkBanner({ briefing: storedBriefing as SparkNotification, body: params.get('spark_body') || undefined })
      // Clean up after using
      delete (window as any).__SPARK_BRIEFING
      return
    }

    // Fallback: create basic notification from URL params only
    console.log('[PUSH_SPARK] Using URL param fallback (no briefing stored)')
    const sparkBody = params.get('spark_body') || sparkPrompt
    setSparkBanner({
      body: sparkBody,
      briefing: {
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
      },
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
          console.log('[PUSH_SPARK] Showing arrival banner with full briefing')
          setSparkBanner({ briefing: event.data.briefing as SparkNotification, body: event.data.body })
        } else {
          console.log('[PUSH_SPARK] No briefing in SW message, using fallback')
          // Fallback to creating a basic notification from title/body
          setSparkBanner({
            body: event.data.body,
            briefing: {
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
            },
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

  const handleSelectConversation = async (id: string) => {
    if (id === activeConversationId) return
    setActiveConversationId(id)
    localStorage.setItem('greenplot_active_conv', id)
    // Restore backend session_id for this conversation
    const backendSessionId = localStorage.getItem(`greenplot_session_${id}`) || ''
    sessionIdRef.current = backendSessionId
    let msgs = loadConvMessages(id)
    // No local copy but this conversation lives on the server → fetch its messages
    // (covers chats opened on a new device or after a login cache-clear).
    if (msgs.length === 0 && backendSessionId) {
      try {
        const token = localStorage.getItem('greenplot_token') || ''
        const r = await fetch(`/api/sessions/${backendSessionId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(8000),
        })
        if (r.ok) {
          const data = await r.json()
          const ui = backendToUiMessages(data?.messages || [])
          if (ui.length > 0) { msgs = ui; saveConvMessages(id, ui) }
        }
      } catch {}
    }
    setMessages(msgs as any)
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

  // Ground a message in the BACKGROUND — never blocks the send. The backend
  // agent grounds in the garden via its own search tools; this only refreshes
  // the "Grounded in your garden" citation chip and captures pasted links into
  // Sources. Fire-and-forget so sends are instant.
  const groundInBackground = useCallback((text: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
    fetch('/api/seeds/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ query: text, limit: 5 }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const seeds = d?.seeds || []
        setLastGardenSeeds(seeds.length
          ? seeds.slice(0, 5).map((s: any) => ({ id: s.id || s.seed_id, title: s.title || 'Untitled', domain: s.domain || '' }))
          : [])
      })
      .catch(() => {})
    const urls = text.match(/https?:\/\/[^\s<>\]\)"']+/g) || []
    urls.slice(0, 3).forEach(url => {
      fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ url }),
      }).catch(() => {})
    })
  }, [])

  // Same signature as before so call sites are unchanged, but it now returns the
  // user's text immediately and grounds in the background — sends never wait.
  const enrichWithGarden = useCallback(async (text: string): Promise<string> => {
    groundInBackground(text)
    return text
  }, [groundInBackground])

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

    // Intercept /prd or /spec — synthesize a PRD from the conversation.
    // Anything after the command becomes the focus directive.
    const trimmed = msg.text.trim()
    if (/^\/(prd|spec)\b/i.test(trimmed)) {
      const focus = trimmed.replace(/^\/(prd|spec)\b/i, '').trim()
      createPrdFromChat(focus ? `Turn our conversation into a complete PRD, focused on: ${focus}` : undefined)
      return
    }

    const enrichedText = await enrichWithGarden(msg.text.trim())
    sendMessage({ text: enrichedText })
  }, [status, sendMessage, enrichWithGarden, handleSaveLastResponse, createPrdFromChat])

  // ── Add to garden from chat: a PDF or a link (article / paper / YouTube) ──
  // Uploads go direct to the backend (Vercel proxy caps bodies at ~4.5MB).
  const ingestPdfToGarden = useCallback((file: File) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please choose a PDF'); return
    }
    if (file.size > 25 * 1024 * 1024) { toast.error('PDF exceeds the 25 MB limit'); return }
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.greenplot.ink'
    const token = localStorage.getItem('greenplot_token')
    const form = new FormData(); form.append('file', file)
    const tid = toast.loading(`Adding “${file.name}” to your garden…`)
    fetch(`${API_BASE}/api/v1/papers/upload`, {
      method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then(d => toast.success(`📄 Added “${d.title}” — indexing the full text into your garden`, { id: tid }))
      .catch(() => toast.error('Upload failed', { id: tid }))
  }, [])

  const seedFromUrl = useCallback((rawUrl: string) => {
    const url = (rawUrl || '').trim()
    if (!/^https?:\/\//i.test(url)) { toast.error('Enter a valid link (http/https)'); return }
    const token = localStorage.getItem('greenplot_token')
    const yt = /youtu\.?be/i.test(url)
    const tid = toast.loading(`Adding ${yt ? 'this video' : 'this link'} to your garden…`)
    fetch('/api/seeds/from-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ url }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => toast.success(`${yt ? '🎬' : '🔗'} Added to your garden — fetching & indexing now`, { id: tid }))
      .catch(() => toast.error('Could not add that link', { id: tid }))
  }, [])

  const handleSuggestion = useCallback(async (suggestion: string) => {
    if (status !== 'ready') return
    const enrichedText = await enrichWithGarden(suggestion)
    sendMessage({ text: enrichedText })
  }, [status, sendMessage, enrichWithGarden])

  // Getting-started card: onboarding sets the flag; first real message clears it
  useEffect(() => {
    setShowStartCard(localStorage.getItem('greenplot_show_start_card') === '1')
    setShowTour(localStorage.getItem('greenplot_tour_pending') === '1')
  }, [])
  const dismissTour = useCallback(() => {
    localStorage.removeItem('greenplot_tour_pending')
    setShowTour(false)
  }, [])
  useEffect(() => {
    if (messages.length > 0 && showStartCard) {
      localStorage.removeItem('greenplot_show_start_card')
    }
  }, [messages.length, showStartCard])
  const dismissStartCard = useCallback(() => {
    localStorage.removeItem('greenplot_show_start_card')
    setShowStartCard(false)
  }, [])

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
    <div style={{ background: 'var(--bg)', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Compact dark header for chat — not a full tall hero */}
      <div style={{ background: 'var(--forest-1)', position: 'sticky', top: 0, zIndex: 40, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
          {/* Chats switcher — shows the current chat + opens the full list. The
              label makes "where are my chats / how do I switch" discoverable. */}
          <button
            onClick={() => setSidebarOpen(true)}
            title="Browse and switch between your chats"
            aria-label="Open your chats"
            className="glass-dark tap"
            style={{ display: 'flex', alignItems: 'center', gap: 9, borderRadius: 12, border: 'none', cursor: 'pointer', padding: '6px 12px 6px 10px', flex: 1, minWidth: 0 }}
          >
            <AlignLeft size={16} color="rgba(180,240,205,0.9)" strokeWidth={2} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
              <span className="caps" style={{ fontSize: 8, color: 'rgba(180,240,205,0.55)', letterSpacing: '0.1em', lineHeight: 1.1 }}>CHATS</span>
              <span className="ui" style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '46vw', lineHeight: 1.2 }}>
                {(conversations.find(c => c.id === activeConversationId)?.title) || 'New chat'}
              </span>
            </div>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.65 }}><path d="M3 4.5L6 7.5L9 4.5" stroke="rgba(180,240,205,0.9)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>

          {/* Active mode chip */}
          {selectedMode && (
            <button onClick={() => setSelectedMode(undefined)} className="glass-dark tap" title="Exit this mode" style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 9999, padding: '5px 10px', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              <span className="ui" style={{ fontSize: 11, fontWeight: 600, color: '#7ef0a8' }}>{selectedMode.label}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2L8 8M8 2L2 8" stroke="rgba(126,240,168,0.7)" strokeWidth="1.5"/></svg>
            </button>
          )}

          {/* New chat — labeled + accented so it's obvious */}
          <button
            onClick={handleNewChat}
            title="Start a new chat"
            aria-label="Start a new chat"
            className="tap"
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 12, border: 'none', cursor: 'pointer', padding: '7px 13px', flexShrink: 0, background: '#7ef0a8' }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="#06281a" strokeWidth="2.2" strokeLinecap="round"/></svg>
            <span className="ui" style={{ fontSize: 12.5, fontWeight: 800, color: '#06281a' }}>New</span>
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
          <ConversationContent className="max-w-2xl lg:max-w-3xl mx-auto w-full">
            {messages.length === 0 ? (
              <ConversationEmptyState>
                <div className="flex flex-col items-center gap-6 max-w-2xl lg:max-w-3xl mx-auto w-full">
                  {/* Brand icon */}
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 99, filter: 'blur(20px)', opacity: 0.3, background: 'var(--green)', transform: 'scale(1.8)' }} />
                    <div style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(160deg,#34d97a,#15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      <Leaf size={30} color="#06281a" strokeWidth={1.75} />
                    </div>
                  </div>

                  {/* Getting-started card (first chat after onboarding) or title */}
                  {showStartCard ? (
                    <StarterCard onAction={handleSuggestion} onDismiss={dismissStartCard} />
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <h2 className="serif" style={{ fontSize: 26, color: 'var(--ink)', marginBottom: 8 }}>
                        Start a conversation
                      </h2>
                      <p className="body-text" style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 280, margin: '0 auto' }}>
                        Ask questions, capture ideas, or search the web. Your thinking partner is ready.
                      </p>
                    </div>
                  )}

                  {/* Suggestion chips */}
                  <ActivitySummary token={authToken} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 480, padding: '0 16px' }}>
                    {dynamicSuggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSuggestion(s)}
                        className="tap ui"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 38,
                          padding: '8px 15px', border: '1px solid var(--hairline)', borderRadius: 9999,
                          cursor: 'pointer', background: 'var(--surface)', color: 'var(--ink-2)',
                          fontSize: 12.5, fontWeight: 600, textAlign: 'left', transition: 'all .15s',
                          boxShadow: '0 1px 2px rgba(20,19,12,0.03)',
                        }}
                      >
                        <Sparkles size={13} color="var(--green-700)" strokeWidth={2} style={{ flexShrink: 0 }} />
                        {s}
                      </button>
                    ))}
                  </div>
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
                        {/* "Searched your garden" — expandable provenance: the exact
                            seeds that grounded this answer, each linking to the garden */}
                        {lastGardenSeeds.length > 0 && msgIdx === messages.length - 1 && (
                          <details style={{ marginBottom: 8 }}>
                            <summary className="tap" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--green-tint)', borderRadius: 9999, padding: '5px 10px', cursor: 'pointer', listStyle: 'none' }}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5C6 1.5 3 4 3 6.5C3 7.88 4.34 9 6 9C7.66 9 9 7.88 9 6.5C9 4 6 1.5 6 1.5Z" fill="var(--green-700)"/></svg>
                              <span className="ui" style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-700)' }}>Grounded in your garden · {lastGardenSeeds.length} seed{lastGardenSeeds.length !== 1 ? 's' : ''}</span>
                              <ChevronRight size={12} color="var(--green-700)" strokeWidth={2} />
                            </summary>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 2 }}>
                              {lastGardenSeeds.map((s, i) => (
                                s.id ? (
                                  <a key={i} href={`/garden?seed=${s.id}`} className="tap ui" title={s.title} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface-sunk)', border: '1px solid var(--hairline)', borderRadius: 9999, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none', maxWidth: 220, overflow: 'hidden' }}>
                                    <Leaf size={11} color="var(--green-700)" strokeWidth={1.9} />
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                                  </a>
                                ) : (
                                  <span key={i} className="ui" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--surface-sunk)', border: '1px solid var(--hairline)', borderRadius: 9999, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', maxWidth: 220, overflow: 'hidden' }}>
                                    <Leaf size={11} color="var(--green-700)" strokeWidth={1.9} />
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                                  </span>
                                )
                              ))}
                            </div>
                          </details>
                        )}
                        <Message from="assistant">
                          <MessageContent
                            className="assistant-bubble px-5 py-4"
                            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 18, boxShadow: '0 1px 2px rgba(20,19,12,0.03)' } as React.CSSProperties}
                          >
                            <div>
                              {/* Render tools/reasoning first, then the text answer below them */}
                              {[...message.parts].sort((a: any, b: any) => (a.type === 'text' ? 1 : 0) - (b.type === 'text' ? 1 : 0)).map((part, i) => {
                                if (part.type === 'text') {
                                  return (
                                    <div key={`${message.id}-text-${i}`} className="text-on-surface-variant">
                                      <MessageResponse>{stripSuggTags(part.text)}</MessageResponse>
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

                                  const toolDone = tp.output != null && tp.state !== 'output-error'
                                  const toolErrored = tp.state === 'output-error' || tp.errorText != null
                                  const richCard = (() => {
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

                                            // write_spec — PRD saved to Studio & Library (partial = Library compile failed)
                                            if (tp.type === 'write_spec' && (parsedOutput?.status === 'ok' || parsedOutput?.status === 'partial')) {
                                              const libraryFailed = parsedOutput.status === 'partial'
                                              return (
                                                <div className="mt-2 p-3 rounded-2xl flex items-center gap-3" style={{ background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)' }}>
                                                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <FileText size={19} color="#06281a" strokeWidth={1.75} />
                                                  </div>
                                                  <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p className="ui" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-deep)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parsedOutput.title}</p>
                                                    <p className="body-text" style={{ fontSize: 11.5, color: libraryFailed ? 'var(--ink-3)' : 'var(--green-700)' }}>
                                                      {libraryFailed ? 'PRD saved to Studio — Library compile failed, retry from Library' : 'PRD saved to Studio & Library'}
                                                    </p>
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

                                            // Seed created/updated — hyperlink straight to it in the garden
                                            if ((parsedOutput?.status === 'ok' || parsedOutput?.status === 'partial') && parsedOutput?.seed_id && tp.type !== 'write_spec') {
                                              const isUpdate = tp.type === 'update_seed'
                                              const isPaper = tp.type === 'ingest_paper'
                                              return (
                                                <a href={`/garden?seed=${encodeURIComponent(parsedOutput.seed_id)}`} className="mt-2 p-3 rounded-2xl flex items-center gap-3 tap" style={{ background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)', textDecoration: 'none' }}>
                                                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <Leaf size={19} color="#06281a" strokeWidth={1.75} />
                                                  </div>
                                                  <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p className="ui" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-deep)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parsedOutput.title || 'Seed'}</p>
                                                    <p className="body-text" style={{ fontSize: 11.5, color: 'var(--green-700)' }}>
                                                      {isPaper ? 'Paper planted in your garden' : isUpdate ? 'Seed updated' : 'Planted in your garden'}
                                                    </p>
                                                  </div>
                                                  <span className="ui" style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: 'var(--green-700)', padding: '4px 10px', background: 'rgba(34,197,94,0.15)', borderRadius: 9 }}>
                                                    Open →
                                                  </span>
                                                </a>
                                              )
                                            }

                                            // Connections focus card — related seeds as structured chips, not a text blob
                                            if ((tp.type === 'search_seeds' || tp.type === 'search_seeds_filtered') && parsedOutput?.status === 'ok' && Array.isArray(parsedOutput.results) && parsedOutput.results.length > 0) {
                                              const connections = parsedOutput.results.slice(0, 6) as Array<{ title: string; summary?: string; content?: string; domain?: string; tags?: string }>
                                              return (
                                                <div className="mt-2 p-3 rounded-2xl" style={{ background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)' }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                    <span style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                      <Sprout size={15} color="#06281a" strokeWidth={2} />
                                                    </span>
                                                    <span className="ui" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-deep)' }}>
                                                      {connections.length} connection{connections.length === 1 ? '' : 's'} in your garden
                                                    </span>
                                                    <a href="/garden" className="ui" style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 600, color: 'var(--green-700)', textDecoration: 'none' }}>Garden →</a>
                                                  </div>
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    {connections.map((c, ci) => (
                                                      <div key={ci} style={{ background: 'rgba(255,255,255,0.65)', borderRadius: 11, padding: '8px 11px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                                          <span className="ui" style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                                                          {c.domain && (
                                                            <span className="ui" style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--green-700)', background: 'var(--green-tint)', borderRadius: 9999, padding: '2px 7px', flexShrink: 0 }}>
                                                              {String(c.domain).toUpperCase().slice(0, 18)}
                                                            </span>
                                                          )}
                                                        </div>
                                                        {(c.summary || c.content) && (
                                                          <p className="body-text" style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5, marginTop: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                            {c.summary || c.content}
                                                          </p>
                                                        )}
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )
                                            }

                                            return null
                                          })()
                                  return (
                                    <div key={`${message.id}-tool-${i}`} className="mt-2">
                                      {isSubagent && subagentData && (
                                        <SubagentStatus data={subagentData} className="mb-2" />
                                      )}
                                      {richCard || <ToolStatusRow type={tp.type} done={toolDone} errored={toolErrored} />}
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

                        {/* Dynamic suggested actions — model-provided <sugg> chips */}
                        {isLastAssistant && !isStreaming && (() => {
                          const suggs = message.parts
                            .filter(p => p.type === 'text')
                            .flatMap(p => collectSuggTags((p as { text: string }).text))
                            .slice(0, 3)
                          if (suggs.length === 0) return null
                          return (
                            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                              {suggs.map(s => (
                                <button
                                  key={s} onClick={() => handleSuggestion(s)} className="tap ui"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36,
                                    padding: '7px 14px', border: 'none', borderRadius: 9999, cursor: 'pointer',
                                    background: 'var(--green-tint)', color: 'var(--green-700)',
                                    fontSize: 12.5, fontWeight: 600, transition: 'all .15s',
                                  }}
                                >
                                  <Sparkles size={13} color="var(--green-700)" strokeWidth={2} />
                                  {s}
                                </button>
                              ))}
                            </div>
                          )
                        })()}

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
                          {/* Turn this conversation into a PRD — available on any answer */}
                          {isLastAssistant && message.parts.some(p => p.type === 'text') && (
                            <button
                              onClick={() => createPrdFromChat()}
                              className="tap"
                              title="Synthesize a full PRD from this conversation and save it to your Studio"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--green-tint)', border: 'none', borderRadius: 9999, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--ui)', fontSize: 10.5, fontWeight: 700, color: 'var(--green-700)' }}
                            >
                              <FileText size={12} strokeWidth={2} /> Turn into PRD
                            </button>
                          )}
                        </div>
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
            {detectedUrls.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)', borderRadius: 99, padding: '6px 8px 6px 14px' }}>
                  <Globe size={13} color="var(--green-700)" strokeWidth={1.75} />
                  <span className="ui" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--green-700)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    {detectedUrls.length === 1 ? 'Link detected' : `${detectedUrls.length} links detected`}
                  </span>
                  <button
                    onClick={() => seedFromUrl(detectedUrls[0])}
                    className="tap ui"
                    title="Fetch this page (or video transcript) and save it to your garden"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--green)', color: '#06281a', border: 'none', borderRadius: 99, padding: '5px 11px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}
                  >
                    <Sprout size={12} strokeWidth={2.2} /> Add to garden
                  </button>
                </div>
              </div>
            )}

            {/* Streaming indicator */}
            {isStreaming && (
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
        <div className="max-w-2xl lg:max-w-3xl mx-auto mb-2">
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
        <div
          className="max-w-2xl lg:max-w-3xl mx-auto"
          onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setPdfDragOver(true) } }}
          onDragLeave={() => setPdfDragOver(false)}
          onDrop={(e) => { setPdfDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); ingestPdfToGarden(f) } }}
          style={{ position: 'relative', borderRadius: 18, outline: pdfDragOver ? '2px dashed var(--green-700)' : 'none', outlineOffset: 4 }}
        >
          {pdfDragOver && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--green-tint)', borderRadius: 18, pointerEvents: 'none' }}>
              <span className="ui" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--green-700)' }}>Drop a PDF to add it to your garden</span>
            </div>
          )}
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
            onAttachPdf={ingestPdfToGarden}
            onAddLink={seedFromUrl}
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

      {/* Persistent feedback — qualitative signal matters most in early beta */}
      <button
        onClick={async () => {
          const msg = window.prompt('What would make Greenplot better? (bug, idea, anything)')
          if (!msg || !msg.trim()) return
          const token = localStorage.getItem('greenplot_token')
          try {
            await fetch('/api/feedback/feature-request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
              body: JSON.stringify({ message: msg.trim() }),
            })
            toast.success('Thank you — sent to the team 🌱')
          } catch { toast.error('Could not send — try again') }
        }}
        title="Send feedback"
        aria-label="Send feedback"
        className="tap"
        style={{ position: 'fixed', right: 16, bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 45, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 9999, padding: '8px 13px', boxShadow: '0 6px 18px -6px rgba(20,19,12,0.25)', cursor: 'pointer' }}
      >
        <MessageSquarePlus size={15} color="var(--green-700)" strokeWidth={2} />
        <span className="ui" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Feedback</span>
      </button>

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
      {showTour && <Walkthrough onDone={dismissTour} />}

      {sparkBanner && !sparkNotification && (
        <PushArrivalBanner
          notification={sparkBanner.briefing}
          body={sparkBanner.body}
          onOpen={() => { setSparkNotification(sparkBanner.briefing); setSparkBanner(null) }}
          onDismiss={() => setSparkBanner(null)}
        />
      )}

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
