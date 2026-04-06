'use client'

import { useEffect, useRef } from 'react'

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

export function ConversationSidebar({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNewChat,
}: ConversationSidebarProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 left-0 bottom-0 z-[60] w-72 bg-surface-container flex flex-col border-r border-outline-variant/10 shadow-2xl
          transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}
            >
              forest
            </span>
            <span className="text-sm font-bold text-on-surface">Chats</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>close</span>
          </button>
        </div>

        {/* New Chat button */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <button
            onClick={() => { onNewChat(); onClose() }}
            className="w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-primary/10 hover:bg-primary/20 transition-colors text-primary font-semibold text-sm"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit_square</span>
            New Chat
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4">
          {conversations.length === 0 && (
            <p className="text-xs text-on-surface-variant/40 italic px-2 py-4 text-center">No conversations yet</p>
          )}
          {conversations.map((conv) => {
            const isActive = conv.id === activeId
            return (
              <button
                key={conv.id}
                onClick={() => { onSelect(conv.id); onClose() }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors group
                  ${isActive
                    ? 'bg-primary/15 text-primary'
                    : 'hover:bg-surface-container-high text-on-surface'}`}
              >
                <p className={`text-xs font-semibold truncate ${isActive ? 'text-primary' : 'text-on-surface'}`}>
                  {conv.title}
                </p>
                <p className="text-[10px] text-on-surface-variant/50 mt-0.5">
                  {timeLabel(conv.updatedAt)}
                </p>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
