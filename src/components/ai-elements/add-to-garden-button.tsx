'use client'

import { useState, useCallback } from 'react'
import { GardenHarvestSheet } from './garden-harvest-sheet'
import { toast } from 'sonner'

interface Message {
  role: string
  parts: Array<{ type: string; text?: string }>
}

interface AddToGardenButtonProps {
  messages: Message[]
  authToken: string
}

interface Insight {
  title: string
  content: string
  selected: boolean
}

export function AddToGardenButton({ messages, authToken }: AddToGardenButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleOpen = useCallback(async () => {
    setSheetOpen(true)
    setLoading(true)
    setError('')
    setInsights([])

    try {
      // Build conversation text from messages
      const conversationText = messages
        .map((m) => {
          const text = m.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.text || '')
            .join('')
          return `${m.role === 'user' ? 'User' : 'Assistant'}: ${text}`
        })
        .filter((t) => t.length > 10)
        .join('\n\n')
        .slice(0, 8000)

      const res = await fetch('/api/chat/extract-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ conversation: conversationText }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Extraction failed' }))
        throw new Error(err.detail || `Failed (${res.status})`)
      }

      const data = await res.json()
      setInsights(
        (data.insights || []).map((i: { title: string; content: string }) => ({
          ...i,
          selected: true,
        }))
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [messages, authToken])

  const handleSave = useCallback(
    async (selected: Insight[]) => {
      setSaving(true)
      try {
        const res = await fetch('/api/seeds', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({
            seeds: selected.map((s) => ({
              title: s.title,
              content: s.content,
              source: 'chat_harvest',
            })),
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: 'Save failed' }))
          throw new Error(err.detail || 'Failed to save seeds')
        }

        const data = await res.json()
        const count = data.created || selected.length
        toast.success(`${count} seed${count !== 1 ? 's' : ''} planted in your garden 🌱`)
        setSheetOpen(false)
        setDismissed(true)
      } catch (err) {
        toast.error(`Failed to save: ${(err as Error).message}`)
      } finally {
        setSaving(false)
      }
    },
    [authToken]
  )

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all
          bg-primary/8 text-primary border border-primary/15
          hover:bg-primary/15 hover:border-primary/30 active:scale-95"
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}
        >
          eco
        </span>
        Add to Garden
      </button>

      {sheetOpen && (
        <GardenHarvestSheet
          insights={insights}
          loading={loading}
          error={error}
          saving={saving}
          onSave={handleSave}
          onClose={() => {
            setSheetOpen(false)
            setDismissed(true)
          }}
        />
      )}
    </>
  )
}
