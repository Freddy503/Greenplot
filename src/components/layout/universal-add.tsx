'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

type DetectedType = 'link' | 'seed' | 'unknown'

function detectContentType(text: string): DetectedType {
  const trimmed = text.trim()
  // URL detection
  if (/^https?:\/\//.test(trimmed) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
    return 'link'
  }
  // Long text = seed
  if (trimmed.length > 50) {
    return 'seed'
  }
  return 'unknown'
}

function getTypeInfo(type: DetectedType) {
  switch (type) {
    case 'link':
      return { icon: 'link', label: 'Link', color: 'text-blue-400', bg: 'bg-blue-500/10', action: 'Add to Sources' }
    case 'seed':
      return { icon: 'eco', label: 'Seed', color: 'text-primary', bg: 'bg-primary/10', action: 'Plant in Garden' }
    default:
      return { icon: 'add', label: 'Content', color: 'text-on-surface-variant', bg: 'bg-surface-container-high', action: 'Add' }
  }
}

export default function UniversalAdd() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const detectedType = detectContentType(text)
  const typeInfo = getTypeInfo(detectedType)

  const handleAdd = async () => {
    if (!text.trim()) return
    setAdding(true)

    const token = localStorage.getItem('greenplot_token')
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }

    try {
      if (detectedType === 'link') {
        // Add to Hub
        let url = text.trim()
        if (!url.startsWith('http')) url = `https://${url}`
        const res = await fetch('/api/links', { method: 'POST', headers, body: JSON.stringify({ url }) })
        if (res.ok) {
          const data = await res.json()
          toast.success(`📎 Link added: ${data.title || url}`)
        }
      } else {
        // Add as seed to garden
        const res = await fetch('/api/seeds', {
          method: 'POST',
          headers,
          body: JSON.stringify({ text: text.trim(), title: text.trim().split('\n')[0].slice(0, 60) }),
        })
        if (res.ok) {
          toast.success('🌱 Seed planted in garden')
        }
      }
    } catch {
      toast.error('Failed to add. Try again.')
    }

    setText('')
    setOpen(false)
    setAdding(false)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    // Auto-detect on paste
    const pasted = e.clipboardData.getData('text')
    if (pasted) {
      setTimeout(() => {
        // Type detection will update via state change
      }, 0)
    }
  }

  return (
    <>
      {/* Floating Add Button — sits above the PromptBox on mobile, bottom-right on desktop */}
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 z-40 w-12 h-12 rounded-full bg-primary text-on-primary shadow-lg shadow-primary/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform md:bottom-8 md:right-6 md:w-14 md:h-14"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12rem)' }}
        title="Add to garden"
      >
        <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: '"FILL" 1' }}>
          add
        </span>
      </button>

      {/* Universal Add Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md bg-surface-container border-outline-variant/10">
          <DialogHeader>
            <DialogTitle className="text-on-surface font-extrabold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: '"FILL" 1' }}>add_circle</span>
              Add to Garden
            </DialogTitle>
            <DialogDescription className="text-on-surface-variant">
              Paste a URL, idea, or note. We'll figure out where it goes.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <textarea
              ref={textareaRef}
              placeholder="Paste a URL, type an idea, or jot down a note..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd() }}
              className="w-full h-32 px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30 transition-colors resize-none"
              autoFocus
            />

            {/* Type Detection Hint */}
            {text.trim() && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${typeInfo.bg}`}>
                <span className={`material-symbols-outlined text-sm ${typeInfo.color}`} style={{ fontVariationSettings: '"FILL" 1' }}>
                  {typeInfo.icon}
                </span>
                <span className={`text-xs font-bold ${typeInfo.color}`}>
                  Detected: {typeInfo.label}
                </span>
                <span className="text-[10px] text-on-surface-variant/50 ml-auto">
                  {detectedType === 'link' ? '→ Sources tab' : detectedType === 'seed' ? '→ Garden tab' : ''}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!text.trim() || adding}
              className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold"
            >
              {adding ? (
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg mr-1" style={{ fontVariationSettings: '"FILL" 1' }}>{typeInfo.icon}</span>
                  {typeInfo.action}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
