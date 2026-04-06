'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export interface SparkNotification {
  title: string
  body: string     // content from the push notification
  prompt: string   // original prompt field from the cron job payload
}

interface SparkCardProps {
  notification: SparkNotification
  onChatAboutThis: (content: string) => void
  onDismiss: () => void
  token: string
}

export function SparkCard({ notification, onChatAboutThis, onDismiss, token }: SparkCardProps) {
  const [addingToGarden, setAddingToGarden] = useState(false)

  const content = notification.body || notification.prompt

  const handleAddToGarden = async () => {
    setAddingToGarden(true)
    try {
      const res = await fetch('/api/seeds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content, source: 'morning_spark' }),
      })
      if (res.ok) {
        toast.success('Added to Garden!')
        onDismiss()
      } else {
        toast.error('Failed to add to garden')
      }
    } catch {
      toast.error('Failed to add to garden')
    }
    setAddingToGarden(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] flex items-end justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg mx-3 mb-24 bg-surface-container rounded-3xl border border-outline-variant/15 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <div className="relative flex-shrink-0">
            <div className="absolute inset-0 rounded-full blur-xl opacity-30 bg-primary scale-150" />
            <span
              className="material-symbols-outlined relative text-primary text-2xl"
              style={{ fontVariationSettings: '"FILL" 1' }}
            >
              forest
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Morning Spark</p>
            <p className="text-sm font-semibold text-on-surface truncate">{notification.title}</p>
          </div>
          <button
            onClick={onDismiss}
            className="flex-shrink-0 p-1.5 rounded-full hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-on-surface-variant/60 text-lg">close</span>
          </button>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-outline-variant/10" />

        {/* Content */}
        <div className="px-5 py-4">
          <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-5">{content}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 pb-5">
          <Button
            onClick={() => onChatAboutThis(content)}
            className="flex-1 rounded-2xl bg-primary text-on-primary hover:bg-primary/90 font-bold text-sm h-10"
          >
            <span className="material-symbols-outlined text-base mr-1.5">chat</span>
            Chat about this
          </Button>
          <Button
            onClick={handleAddToGarden}
            disabled={addingToGarden}
            variant="outline"
            className="rounded-2xl border-outline-variant/20 text-on-surface-variant text-sm h-10 px-4"
          >
            {addingToGarden ? (
              <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-base mr-1.5">eco</span>
                Garden
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
