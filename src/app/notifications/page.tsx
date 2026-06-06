'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Sun, Mail, Sprout, BookOpen, FileText, Link2, Leaf, GraduationCap, BarChart2, Trophy, Settings, ExternalLink } from 'lucide-react'
import DetailHero, { DetailHeroBtn } from '@/components/ui/v2/detail-hero'
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

type ToneKey = 'green' | 'amber' | 'blue' | 'violet'

interface TypeConfig {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  tone: ToneKey
  label: string
}

const typeConfig: Record<string, TypeConfig> = {
  morning_spark:          { Icon: Sun,           tone: 'amber',  label: 'Morning Spark' },
  daily_briefing:         { Icon: BookOpen,       tone: 'green',  label: 'Daily Briefing' },
  reflection:             { Icon: Leaf,           tone: 'green',  label: 'Evening Reflection' },
  weekly_eval:            { Icon: BarChart2,      tone: 'green',  label: 'Weekly Eval' },
  challenge:              { Icon: Trophy,         tone: 'green',  label: 'Challenge' },
  academic_digest:        { Icon: GraduationCap,  tone: 'blue',   label: 'Research Digest' },
  academic_digest_evening:{ Icon: GraduationCap,  tone: 'blue',   label: 'Research Digest' },
  solution_design:        { Icon: FileText,       tone: 'violet', label: 'Strategy Paper' },
}

const TONE_STYLES: Record<ToneKey, { bg: string; fg: string }> = {
  green:  { bg: 'var(--green-tint)',           fg: 'var(--green-700)' },
  amber:  { bg: 'rgba(201,138,27,0.12)',        fg: '#b87a00' },
  blue:   { bg: 'rgba(59,130,246,0.10)',        fg: '#2563eb' },
  violet: { bg: 'rgba(139,92,246,0.10)',        fg: '#7c3aed' },
}

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

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

function isNew(ts: number | string): boolean {
  const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts
  return Date.now() - ms < 86400000
}

function getConfig(n: StoredNotification): TypeConfig {
  const type = n.briefing?.type || ''
  return typeConfig[type]
    || (type.startsWith('solution_design') ? typeConfig.solution_design : null)
    || { Icon: Bell, tone: 'green', label: 'Notification' }
}

function NotifRow({ n, last, onOpen, onDismiss }: {
  n: StoredNotification
  last: boolean
  onOpen: () => void
  onDismiss: (e: React.MouseEvent) => void
}) {
  const cfg = getConfig(n)
  const tone = TONE_STYLES[cfg.tone]
  const IconCmp = cfg.Icon

  return (
    <button
      onClick={onOpen}
      className="tap"
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
        background: n.read ? 'transparent' : 'rgba(34,197,94,0.055)',
        display: 'flex', gap: 13, alignItems: 'flex-start',
        padding: '14px 15px',
        borderBottom: last ? 'none' : '1px solid var(--hairline)',
      }}
    >
      <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: tone.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconCmp size={19} color={tone.fg} strokeWidth={1.75} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ui" style={{ fontSize: 13.5, fontWeight: n.read ? 600 : 700, color: 'var(--ink)', lineHeight: 1.3 }}>
          {n.title}
        </div>
        {n.body && (
          <div className="body-text" style={{
            fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          } as React.CSSProperties}>
            {n.body.replace(/\*\*|__|\*|_|#{1,6}\s|`/g, '')}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
          <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{cfg.label}</span>
          <span style={{ width: 3, height: 3, borderRadius: 99, background: 'var(--ink-3)', opacity: 0.4 }} />
          <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{timeAgo(n.timestamp)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {!n.read && (
          <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--green)', marginTop: 5 }} />
        )}
        <button
          onClick={onDismiss}
          className="tap"
          style={{ width: 26, height: 26, borderRadius: 8, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: 0.4 }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 2L11 11M11 2L2 11" stroke="var(--ink)" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </button>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="caps" style={{ fontSize: 10, color: 'var(--ink-3)', margin: '20px 2px 8px', letterSpacing: '0.08em' }}>
      {children}
    </div>
  )
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<StoredNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SparkNotification | null>(null)
  const [authToken, setAuthToken] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
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
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    if (n.briefing) {
      setSelected(n.briefing)
    } else if (n.prompt) {
      router.push(`/chat?prompt=${encodeURIComponent(n.prompt)}`)
    }
  }

  const handleDismiss = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setNotifications(prev => prev.filter(x => x.id !== id))
    try {
      await fetch(`/api/push/notifications/${id}`, {
        method: 'DELETE',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      })
    } catch {}
  }

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(x => ({ ...x, read: true })))
    try {
      await fetch('/api/push/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ action: 'mark_all_read' }),
      })
    } catch {}
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

  const unreadCount = notifications.filter(n => !n.read).length
  const today = DAY_NAMES[new Date().getDay()]
  const eyebrow = unreadCount > 0 ? `${today} · ${unreadCount} new` : today

  const filtered = filter === 'unread' ? notifications.filter(n => !n.read) : notifications
  const newGroup = filtered.filter(n => !n.read || isNew(n.timestamp))
  const earlierGroup = filter === 'all' ? filtered.filter(n => n.read && !isNew(n.timestamp)) : []

  return (
    <div style={{ height: '100dvh', overflowY: 'auto', background: 'var(--bg)' }}>
      <DetailHero
        eyebrow={eyebrow}
        title="Notifications"
        onClose={() => router.back()}
        right={<DetailHeroBtn name="check" onClick={handleMarkAllRead} />}
      >
        {/* Segmented filter */}
        <div style={{ marginTop: 18 }}>
          <div style={{
            display: 'inline-flex', borderRadius: 12,
            background: 'rgba(255,255,255,0.10)', padding: 3,
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
            {(['all', 'unread'] as const).map(key => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className="tap ui"
                style={{
                  border: 'none', borderRadius: 9, padding: '7px 20px',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  background: filter === key ? 'rgba(255,255,255,0.92)' : 'transparent',
                  color: filter === key ? 'var(--forest-1)' : 'rgba(255,255,255,0.72)',
                  transition: 'all 0.15s ease',
                }}
              >
                {key === 'all' ? 'All' : 'Unread'}
                {key === 'unread' && unreadCount > 0 && (
                  <span style={{ marginLeft: 6, background: 'var(--green)', color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: 10.5 }}>
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </DetailHero>

      <div style={{ padding: '0 18px 140px', marginTop: -2 }}>
        {/* Loading skeleton */}
        {loading && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse" style={{ height: 72, borderRadius: 16, background: 'var(--surface-sunk)' }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 64, textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={28} color="var(--green-700)" strokeWidth={1.5} />
            </div>
            <div>
              <p className="ui" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 5 }}>
                {filter === 'unread' ? 'All caught up' : 'No notifications yet'}
              </p>
              <p className="body-text" style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
                {filter === 'unread' ? 'No unread notifications.' : 'Your morning sparks and briefings will appear here.'}
              </p>
            </div>
          </div>
        )}

        {/* New group */}
        {!loading && newGroup.length > 0 && (
          <>
            <SectionHeader>New</SectionHeader>
            <div className="card" style={{ borderRadius: 18, overflow: 'hidden', padding: 0 }}>
              {newGroup.map((n, i) => (
                <NotifRow
                  key={n.id}
                  n={n}
                  last={i === newGroup.length - 1}
                  onOpen={() => handleOpen(n)}
                  onDismiss={(e) => handleDismiss(e, n.id)}
                />
              ))}
            </div>
          </>
        )}

        {/* Earlier group */}
        {!loading && earlierGroup.length > 0 && (
          <>
            <SectionHeader>Earlier</SectionHeader>
            <div className="card" style={{ borderRadius: 18, overflow: 'hidden', padding: 0 }}>
              {earlierGroup.map((n, i) => (
                <NotifRow
                  key={n.id}
                  n={n}
                  last={i === earlierGroup.length - 1}
                  onOpen={() => handleOpen(n)}
                  onDismiss={(e) => handleDismiss(e, n.id)}
                />
              ))}
            </div>
          </>
        )}

        {/* Research Paper Agent */}
        {!loading && (
          <div style={{ marginTop: 28 }}>
            <SectionHeader>Tools</SectionHeader>
            <div className="card" style={{ borderRadius: 18, overflow: 'hidden', padding: 0 }}>
              {/* Agent card */}
              <div style={{ padding: '15px 16px', borderBottom: '1px solid var(--hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(139,92,246,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={17} color="#7c3aed" strokeWidth={1.75} />
                  </span>
                  <div>
                    <div className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Research Paper Agent</div>
                    <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Write a strategy paper on any topic</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={agentTopic}
                    onChange={e => setAgentTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRunAgent()}
                    placeholder="e.g. Context graph system for NemoCore"
                    style={{
                      flex: 1, borderRadius: 10, background: 'var(--surface-sunk)', border: '1px solid var(--hairline)',
                      padding: '9px 13px', fontFamily: 'var(--body)', fontSize: 13, color: 'var(--ink)',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleRunAgent}
                    disabled={agentRunning || !agentTopic.trim()}
                    className="tap"
                    style={{ borderRadius: 10, background: 'var(--green)', border: 'none', padding: '0 16px', fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: (agentRunning || !agentTopic.trim()) ? 0.4 : 1 }}
                  >
                    {agentRunning ? '…' : 'Run'}
                  </button>
                </div>
                {agentMsg && (
                  <p className="body-text" style={{ fontSize: 11.5, color: 'var(--green-700)', marginTop: 8 }}>{agentMsg}</p>
                )}
              </div>

              {/* Explanation Agent */}
              <a
                href="/explain"
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', textDecoration: 'none' }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(59,130,246,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <GraduationCap size={17} color="#2563eb" strokeWidth={1.75} />
                </span>
                <div style={{ flex: 1 }}>
                  <div className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Explanation Agent</div>
                  <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Deep-dive tutoring Q&amp;A · exports as PDF</div>
                </div>
                <ExternalLink size={15} color="var(--ink-3)" strokeWidth={1.75} />
              </a>
            </div>
          </div>
        )}

        {/* Settings button */}
        <button
          className="tap ui"
          onClick={() => router.push('/settings')}
          style={{
            width: '100%', marginTop: 18, padding: 14, border: 'none',
            background: 'transparent', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer',
          }}
        >
          <Settings size={15} color="var(--ink-2)" strokeWidth={1.75} />
          Notification settings
        </button>
      </div>

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
