'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Settings, MessageCircle } from 'lucide-react'

export interface ConversationMeta {
  id: string
  title: string
  updatedAt: string
}

interface ConversationSidebarProps {
  open: boolean
  onClose: () => void
  conversations: ConversationMeta[]
  activeId: string
  onSelect: (id: string) => void
  onNewChat: () => void
}

function timeLabel(iso: string): string {
  const now = new Date()
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 1 ? 'Just now' : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function groupConversations(conversations: ConversationMeta[]): Record<string, ConversationMeta[]> {
  const now = new Date()
  const groups: Record<string, ConversationMeta[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    Older: [],
  }
  conversations.forEach(c => {
    const d = new Date(c.updatedAt)
    if (isNaN(d.getTime())) { groups['Older'].push(c); return }
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / 86400000)
    if (days < 1) groups['Today'].push(c)
    else if (days < 2) groups['Yesterday'].push(c)
    else if (days < 7) groups['Previous 7 days'].push(c)
    else groups['Older'].push(c)
  })
  return groups
}

export function ConversationSidebar({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNewChat,
}: ConversationSidebarProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [initial, setInitial] = useState('F')
  const [displayName, setDisplayName] = useState('You')

  useEffect(() => {
    const raw = localStorage.getItem('greenplot_nickname') || localStorage.getItem('greenplot_name') || ''
    if (raw) {
      setInitial(raw.charAt(0).toUpperCase())
      setDisplayName(raw)
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const groups = groupConversations(conversations)
  const groupKeys = ['Today', 'Yesterday', 'Previous 7 days', 'Older']

  return (
    <>
      {/* Scrim */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(6,20,13,0.5)' }}
        />
      )}

      {/* Drawer panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 60, width: 320,
          background: 'var(--bg)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '18px 0 50px -10px rgba(8,20,12,0.5)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {/* Forest header */}
        <div
          className="hero-forest"
          style={{
            borderRadius: '0 26px 0 0',
            paddingTop: 'max(58px, calc(env(safe-area-inset-top, 0px) + 16px))',
            paddingBottom: 16,
            flexShrink: 0,
          }}
        >
          <div style={{ position: 'relative', zIndex: 2, padding: '0 16px' }}>
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="serif" style={{ fontSize: 25, color: '#fff', whiteSpace: 'nowrap' }}>Your chats</span>
              <button
                onClick={onClose}
                className="glass-dark tap"
                style={{ width: 34, height: 34, borderRadius: 11, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                  <path d="M3.5 3.5L13.5 13.5M13.5 3.5L3.5 13.5" stroke="rgba(255,255,255,0.9)" strokeWidth="1.75" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Search bar */}
            <div
              className="glass-dark"
              style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 9, borderRadius: 13, padding: '9px 12px' }}
            >
              <Search size={16} color="rgba(255,255,255,0.6)" strokeWidth={1.75} />
              <span className="body-text" style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Search conversations</span>
            </div>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px 12px' }}>
          {/* New conversation button */}
          <button
            onClick={() => { onNewChat(); onClose() }}
            className="tap"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)',
              borderRadius: 14, padding: '11px 13px', cursor: 'pointer', marginBottom: 6,
            }}
          >
            <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Plus size={17} color="#fff" strokeWidth={2} />
            </span>
            <span className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--green-deep)' }}>New conversation</span>
          </button>

          {/* Grouped conversations */}
          {conversations.length === 0 ? (
            <p className="body-text" style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', padding: '24px 0', fontStyle: 'italic' }}>
              No conversations yet
            </p>
          ) : (
            groupKeys.map(group => {
              const items = groups[group]
              if (!items?.length) return null
              return (
                <div key={group}>
                  <div className="caps" style={{ fontSize: 10, color: 'var(--ink-3)', margin: '16px 6px 7px' }}>{group}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {items.map(c => {
                      const isActive = c.id === activeId
                      return (
                        <button
                          key={c.id}
                          onClick={() => { onSelect(c.id); onClose() }}
                          className="tap"
                          style={{
                            width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
                            background: isActive ? 'var(--surface)' : 'transparent',
                            boxShadow: isActive ? '0 1px 2px rgba(20,19,12,0.05), inset 0 0 0 1px var(--hairline)' : 'none',
                            borderRadius: 12, padding: '9px 11px',
                            display: 'flex', gap: 10, alignItems: 'flex-start',
                          }}
                        >
                          <MessageCircle
                            size={16}
                            color={isActive ? 'var(--green-700)' : 'var(--ink-3)'}
                            strokeWidth={isActive ? 2 : 1.75}
                            style={{ marginTop: 2, flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="ui" style={{
                              fontSize: 13, fontWeight: isActive ? 700 : 600,
                              color: isActive ? 'var(--green-deep)' : 'var(--ink)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {c.title}
                            </div>
                            <div className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
                              {timeLabel(c.updatedAt)}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer profile */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid var(--hairline)',
          padding: '11px 14px',
          display: 'flex', alignItems: 'center', gap: 11,
          background: 'var(--surface)',
          paddingBottom: 'calc(11px + env(safe-area-inset-bottom, 0px))',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11, flexShrink: 0,
            background: 'linear-gradient(160deg,#34d97a,#16a34a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 16, color: '#06281a',
          }}>
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
              {displayName}
            </div>
            <div className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {conversations.length} conversations
            </div>
          </div>
          <button
            className="tap"
            onClick={() => { window.location.href = '/settings' }}
            style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'var(--surface-sunk)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Settings size={17} color="var(--ink-2)" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slidein { from { transform: translateX(-100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  )
}
