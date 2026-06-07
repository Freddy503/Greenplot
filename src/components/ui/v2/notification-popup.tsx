'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, ChevronRight, Leaf, Sun, Mail, Sprout } from 'lucide-react'

interface RealNotif {
  id?: string
  title?: string
  body?: string
  created_at?: string
  read?: boolean
  type?: string
}

const TONE_STYLES = {
  green: { bg: 'var(--green-tint)', fg: 'var(--green-700)' },
  amber: { bg: 'rgba(201,138,27,0.12)', fg: 'var(--amber)' },
}

function iconForType(type = ''): { Icon: typeof Leaf; tone: 'green' | 'amber' } {
  if (type.includes('spark') || type.includes('morning')) return { Icon: Sun, tone: 'amber' }
  if (type.includes('briefing') || type.includes('digest')) return { Icon: Mail, tone: 'amber' }
  if (type.includes('seed') || type.includes('enrich')) return { Icon: Sprout, tone: 'green' }
  return { Icon: Leaf, tone: 'green' }
}

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(mins, 0)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function NotifRow({ n, onClick }: { n: RealNotif; onClick: () => void }) {
  const { Icon, tone } = iconForType(n.type || n.title || '')
  const style = TONE_STYLES[tone]
  const unread = !n.read
  return (
    <button
      onClick={onClick}
      className="tap"
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
        background: unread ? 'rgba(34,197,94,0.055)' : 'transparent',
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: '11px 14px',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: style.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={style.fg} strokeWidth={1.75} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ui" style={{ fontSize: 13, fontWeight: unread ? 700 : 600, color: 'var(--ink)', lineHeight: 1.3 }}>
          {n.title || 'Notification'}
        </div>
        <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
          {n.body || ''}
        </div>
        <div className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 5 }}>{timeAgo(n.created_at)}</div>
      </div>
      {unread && <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--green)', flexShrink: 0, marginTop: 5 }} />}
    </button>
  )
}

interface NotificationPopupProps {
  onClose: () => void
  unreadCount?: number
}

export default function NotificationPopup({ onClose, unreadCount = 0 }: NotificationPopupProps) {
  const router = useRouter()
  const [notifs, setNotifs] = useState<RealNotif[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') : null
    fetch('/api/push/notifications/all', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.notifications) setNotifs(data.notifications.slice(0, 20))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(8,22,14,0.34)', backdropFilter: 'blur(1.5px)', WebkitBackdropFilter: 'blur(1.5px)' } as React.CSSProperties}
      />
      {/* Tail */}
      <div style={{
        position: 'absolute', top: 84, right: 24,
        width: 16, height: 16,
        background: 'rgba(255,255,255,0.92)',
        transform: 'rotate(45deg)',
        borderRadius: 3,
        boxShadow: '0 0 0 0.5px rgba(255,255,255,0.6)',
        zIndex: 1,
      }} />
      {/* Panel */}
      <div
        className="glass rise"
        style={{ position: 'absolute', top: 90, left: 14, right: 14, borderRadius: 22, overflow: 'hidden', background: 'rgba(255,255,255,0.92)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={17} color="var(--green-700)" strokeWidth={1.75} />
            <span className="ui" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Notifications</span>
            {unreadCount > 0 && (
              <span className="ui" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--green-700)', background: 'var(--green-tint)', borderRadius: 99, padding: '2px 8px' }}>
                {unreadCount} new
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="tap ui"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--green-700)' }}
          >
            Mark read
          </button>
        </div>

        {/* Rows — scrollable */}
        <div style={{ borderTop: '1px solid var(--hairline)', maxHeight: 320, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '20px 14px', textAlign: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: 99, border: '2px solid var(--green-tint)', borderTopColor: 'var(--green)', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            </div>
          ) : notifs.length === 0 ? (
            <p className="body-text" style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--ink-3)', fontStyle: 'italic' }}>
              No notifications yet — check back after your morning spark!
            </p>
          ) : (
            notifs.map((n, i) => (
              <NotifRow key={n.id || i} n={n} onClick={() => { onClose(); router.push('/notifications') }} />
            ))
          )}
        </div>

        {/* See all button */}
        <button
          onClick={() => { onClose(); router.push('/notifications') }}
          className="tap ui"
          style={{
            width: '100%', padding: '12px', border: 'none',
            borderTop: '1px solid var(--hairline)',
            background: 'rgba(255,255,255,0.5)',
            cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--green-700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          See all notifications
          <ChevronRight size={15} color="var(--green-700)" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
