'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import { SparkCard, type SparkNotification } from '@/components/ai-elements/spark-card'

interface StoredNotification {
  id: string
  title: string
  body: string
  url: string
  prompt?: string
  timestamp: number | string
  read: boolean
  briefing?: SparkNotification
}

const typeConfig: Record<string, { icon: string; color: string; label: string }> = {
  morning_spark: { icon: 'light_mode', color: 'text-amber-400', label: 'Morning Spark' },
  daily_briefing: { icon: 'newspaper', color: 'text-blue-400', label: 'Daily Briefing' },
  reflection: { icon: 'psychology', color: 'text-purple-400', label: 'Evening Reflection' },
  weekly_eval: { icon: 'assessment', color: 'text-green-400', label: 'Weekly Eval' },
  challenge: { icon: 'emoji_events', color: 'text-red-400', label: 'Challenge' },
  academic_digest: { icon: 'school', color: 'text-indigo-400', label: 'Research Digest' },
  academic_digest_evening: { icon: 'school', color: 'text-indigo-400', label: 'Research Digest' },
  solution_design: { icon: 'description', color: 'text-violet-400', label: 'Strategy Paper' },
}

function timeAgo(ts: number | string): string {
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<StoredNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SparkNotification | null>(null)
  const [authToken, setAuthToken] = useState('')
  const [agentTopic, setAgentTopic] = useState('')
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentMsg, setAgentMsg] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('greenplot_token') || ''
    setAuthToken(token)

    fetch('/api/push/notifications/all', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : { notifications: [] })
      .then(d => setNotifications(d.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleOpen = (n: StoredNotification) => {
    if (n.briefing) {
      setSelected(n.briefing)
    } else {
      // Plain notification with no briefing — open chat with its prompt
      if (n.prompt) {
        router.push(`/chat?prompt=${encodeURIComponent(n.prompt)}`)
      }
    }
  }

  const handleChatAbout = (content: string) => {
    setSelected(null)
    router.push(`/chat?prompt=${encodeURIComponent(content.slice(0, 300))}`)
  }

  const handleRunAgent = async () => {
    if (!agentTopic.trim() || agentRunning) return
    setAgentRunning(true)
    setAgentMsg('')
    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ topic: agentTopic.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setAgentMsg(data.message || 'Agent started — check back in a few minutes.')
        setAgentTopic('')
      } else {
        setAgentMsg(data.error || 'Failed to start agent.')
      }
    } catch {
      setAgentMsg('Could not reach the server.')
    } finally {
      setAgentRunning(false)
    }
  }

  return (
    <div className="h-dvh flex flex-col bg-background">
      <Header />
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 'var(--header-height)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
      >
        <section className="px-4 py-4">
          <div className="flex items-center gap-2 mb-6">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontVariationSettings: '"FILL" 1', fontSize: '22px' }}
            >
              notifications
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">Inbox</h1>
          </div>

          {/* Research Paper Agent */}
          <div className="mb-6 rounded-2xl bg-surface-container border border-outline-variant/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-violet-400 text-lg" style={{ fontVariationSettings: '"FILL" 1' }}>description</span>
              <p className="text-sm font-bold text-on-surface">Research Paper Agent</p>
            </div>
            <p className="text-xs text-on-surface-variant/70 mb-3">Ask the agent to write a strategy &amp; implementation paper on any topic. Delivered to your Inbox when ready.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={agentTopic}
                onChange={e => setAgentTopic(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRunAgent()}
                placeholder="e.g. Context graph system for NemoCore"
                className="flex-1 rounded-xl bg-surface-container-high border border-outline-variant/20 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={handleRunAgent}
                disabled={agentRunning || !agentTopic.trim()}
                className="rounded-xl bg-primary text-on-primary px-4 py-2 text-sm font-bold disabled:opacity-40 active:scale-95 transition-transform"
              >
                {agentRunning ? '...' : 'Run'}
              </button>
            </div>
            {agentMsg && (
              <p className="text-xs text-primary/80 mt-2">{agentMsg}</p>
            )}
          </div>

          {/* Explanation Agent */}
          <div className="mb-6 rounded-2xl bg-surface-container border border-outline-variant/10 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-indigo-400 text-lg" style={{ fontVariationSettings: '"FILL" 1' }}>school</span>
              <p className="text-sm font-bold text-on-surface">Explanation Agent</p>
            </div>
            <p className="text-xs text-on-surface-variant/70 mb-3">Deep-dive into any topic with a tutoring-mode Q&A. Exports as a PDF when you're done.</p>
            <a
              href="/explain"
              className="flex items-center justify-center gap-2 rounded-xl bg-surface-container-high border border-outline-variant/20 px-4 py-2 text-sm font-bold text-on-surface hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors active:scale-[0.98]"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
              Open Explanation Agent
            </a>
          </div>

          {loading && (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 rounded-2xl bg-surface-container animate-pulse" />
              ))}
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="flex flex-col items-center gap-4 mt-16 text-center">
              <span
                className="material-symbols-outlined text-on-surface-variant/30"
                style={{ fontSize: 56, fontVariationSettings: '"FILL" 1' }}
              >
                notifications_none
              </span>
              <p className="text-on-surface-variant font-medium">No notifications yet</p>
              <p className="text-sm text-on-surface-variant/60">Your morning sparks and briefings will appear here.</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {notifications.map((n) => {
              const briefingType = n.briefing?.type || 'daily_briefing'
              const cfg = typeConfig[briefingType]
                || (briefingType.startsWith('solution_design') ? typeConfig.solution_design : null)
                || { icon: 'notifications', color: 'text-primary', label: 'Notification' }
              const sectionCount = n.briefing?.sections?.length || 0

              return (
                <button
                  key={n.id}
                  onClick={() => handleOpen(n)}
                  className="w-full text-left rounded-2xl bg-surface-container border border-outline-variant/10 p-4 hover:bg-surface-container-high active:scale-[0.99] transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <span
                        className={`material-symbols-outlined ${cfg.color}`}
                        style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}
                      >
                        {cfg.icon}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">
                          {cfg.label}
                        </p>
                        <p className="text-[10px] text-on-surface-variant/40 flex-shrink-0">
                          {timeAgo(n.timestamp)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-on-surface leading-snug">{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-on-surface-variant/70 mt-0.5 line-clamp-2">{n.body.replace(/\*\*|__|\*|_|#{1,6}\s|`/g, '')}</p>
                      )}
                      {sectionCount > 0 && (
                        <p className="text-[10px] text-primary/60 mt-1.5 font-medium">
                          {sectionCount} section{sectionCount !== 1 ? 's' : ''} · Tap to read
                        </p>
                      )}
                    </div>

                    {!n.read && (
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </main>

      <BottomNav />

      {selected && (
        <SparkCard
          notification={selected}
          onChatAboutThis={handleChatAbout}
          onDismiss={() => setSelected(null)}
          token={authToken}
        />
      )}
    </div>
  )
}
