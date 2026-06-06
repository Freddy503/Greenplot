'use client'

import { useRouter } from 'next/navigation'
import { Bell, ChevronRight, Leaf, Sun, Mail, Sprout } from 'lucide-react'

interface PopupNotif {
  icon: 'leaf' | 'sun' | 'mail' | 'sprout'
  tone: 'green' | 'amber'
  title: string
  sub: string
  time: string
  unread: boolean
}

const PREVIEW_NOTIFS: PopupNotif[] = [
  { icon: 'leaf', tone: 'green', title: 'Your seed bloomed', sub: 'Emergence in complex systems finished enriching — 4 new connections found.', time: '2m ago', unread: true },
  { icon: 'sun', tone: 'amber', title: 'Morning Idea Spark', sub: "Today's pattern: attention as a renewable resource. Tap to read.", time: '7:00', unread: true },
  { icon: 'sprout', tone: 'green', title: 'Garden enriched a seed', sub: 'The Second Brain method linked to 2 new sources.', time: '9:02', unread: true },
]

const TONE_STYLES = {
  green: { bg: 'var(--green-tint)', fg: 'var(--green-700)' },
  amber: { bg: 'rgba(201,138,27,0.12)', fg: 'var(--amber)' },
}

const ICONS = {
  leaf: Leaf,
  sun: Sun,
  mail: Mail,
  sprout: Sprout,
}

function NotifRowCompact({ n, onClick }: { n: PopupNotif; onClick: () => void }) {
  const tone = TONE_STYLES[n.tone]
  const IconCmp = ICONS[n.icon]
  return (
    <button
      onClick={onClick}
      className="tap"
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
        background: n.unread ? 'rgba(34,197,94,0.055)' : 'transparent',
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: '11px 14px',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: tone.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconCmp size={17} color={tone.fg} strokeWidth={1.75} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ui" style={{ fontSize: 13, fontWeight: n.unread ? 700 : 600, color: 'var(--ink)', lineHeight: 1.3 }}>{n.title}</div>
        <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{n.sub}</div>
        <div className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 5 }}>{n.time}</div>
      </div>
      {n.unread && <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--green)', flexShrink: 0, marginTop: 5 }} />}
    </button>
  )
}

interface NotificationPopupProps {
  onClose: () => void
  unreadCount?: number
}

export default function NotificationPopup({ onClose, unreadCount = 4 }: NotificationPopupProps) {
  const router = useRouter()

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

        {/* Rows */}
        <div style={{ borderTop: '1px solid var(--hairline)' }}>
          {PREVIEW_NOTIFS.map((n, i) => (
            <NotifRowCompact
              key={i}
              n={n}
              onClick={() => { onClose(); router.push('/notifications') }}
            />
          ))}
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
