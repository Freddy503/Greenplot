'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'

export interface SparkSection {
  title?: string
  icon?: string
  color?: string
  content: string | string[]
  sources?: Array<{ title: string; url: string }>
}

export interface SparkNotification {
  type: 'morning_spark' | 'daily_briefing' | 'reflection' | 'weekly_eval' | 'challenge' | 'academic_digest'
  title: string
  subtitle?: string
  sections: SparkSection[]
  prompt?: string // for chat context
}

interface SparkCardProps {
  notification: SparkNotification
  onChatAboutThis: (content: string) => void
  onDismiss: () => void
  token: string
}

const typeConfig = {
  morning_spark: { icon: 'light_mode', label: 'Morning Spark', bgColor: 'from-amber-500/20' },
  daily_briefing: { icon: 'newspaper', label: 'Daily Briefing', bgColor: 'from-blue-500/20' },
  reflection: { icon: 'psychology', label: 'Evening Reflection', bgColor: 'from-purple-500/20' },
  weekly_eval: { icon: 'assessment', label: 'Weekly Eval', bgColor: 'from-green-500/20' },
  challenge: { icon: 'emoji_events', label: 'Biweekly Challenge', bgColor: 'from-red-500/20' },
  academic_digest: { icon: 'school', label: 'Research Digest', bgColor: 'from-indigo-500/20' },
}

export function SparkCard({ notification, onChatAboutThis, onDismiss, token }: SparkCardProps) {
  const [addingToGarden, setAddingToGarden] = useState(false)
  const config = typeConfig[notification.type]

  // DEBUG: Log what SparkCard is receiving
  console.log('🎨 SparkCard rendered with:', {
    type: notification.type,
    title: notification.title,
    subtitle: notification.subtitle,
    sectionsCount: notification.sections.length,
    sections: notification.sections.map(s => ({
      title: s.title,
      contentType: typeof s.content,
      contentLength: typeof s.content === 'string' ? s.content.length : s.content.length,
      hasSources: !!(s.sources?.length)
    })),
    fullNotification: notification
  })

  const handleAddToGarden = async () => {
    setAddingToGarden(true)
    try {
      const allText = notification.sections
        .map(s => `${s.title ? s.title + '\n' : ''}${typeof s.content === 'string' ? s.content : s.content.join('\n')}`)
        .join('\n\n')
        .slice(0, 4000) // stay under ThoughtCreate 5000 char limit

      // Read token fresh in case prop was empty at render time
      const freshToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : '')

      const res = await fetch('/api/seeds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
        },
        body: JSON.stringify({ content: `${notification.title}\n\n${allText}`.slice(0, 4000), source: notification.type.slice(0, 100) }),
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

  const combinedContent = notification.sections
    .map(s => typeof s.content === 'string' ? s.content : s.content.join('\n'))
    .join('\n\n')

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onDismiss}
        className="fixed inset-0 bg-black/20 z-[75] animate-in fade-in duration-300"
      />
      {/* Card - Full height bottom sheet on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-[80] flex items-end justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl bg-surface-container rounded-t-3xl border-t border-x border-outline-variant/15 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 h-[90vh] md:h-auto md:max-h-[80vh] md:mx-3 md:mb-24 md:rounded-3xl flex flex-col">
        {/* Header - Sticky */}
        <div className={`bg-gradient-to-r ${config.bgColor} to-transparent relative overflow-hidden sticky top-0 z-10`}>
          <div className="flex items-center gap-3 px-6 py-5">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 rounded-full blur-xl opacity-30 bg-primary scale-150" />
              <span
                className="material-symbols-outlined relative text-primary text-2xl"
                style={{ fontVariationSettings: '"FILL" 1' }}
              >
                {config.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{config.label}</p>
              <p className="text-lg font-semibold text-on-surface">{notification.title}</p>
              {notification.subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{notification.subtitle}</p>}
            </div>
            <button
              onClick={onDismiss}
              className="flex-shrink-0 p-1.5 rounded-full hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant/60 text-lg">close</span>
            </button>
          </div>
        </div>

        {/* Sections - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {notification.sections.map((section, idx) => (
            <div key={idx} className="space-y-3">
              {section.title && (
                <div className="flex items-center gap-2">
                  {section.icon && (
                    <span className={`material-symbols-outlined text-lg ${section.color || 'text-primary'}`}
                      style={{ fontVariationSettings: '"FILL" 1' }}>
                      {section.icon}
                    </span>
                  )}
                  <h3 className="font-semibold text-on-surface">{section.title}</h3>
                </div>
              )}
              <div className="text-sm text-on-surface-variant leading-relaxed space-y-2 prose prose-sm prose-invert max-w-none [&>*]:text-on-surface-variant [&_strong]:text-on-surface [&_a]:text-primary [&_ul]:pl-4 [&_ol]:pl-4">
                {typeof section.content === 'string' ? (
                  <ReactMarkdown>{section.content}</ReactMarkdown>
                ) : (
                  section.content.map((line, i) => (
                    <ReactMarkdown key={i}>{line}</ReactMarkdown>
                  ))
                )}
              </div>
              {section.sources && section.sources.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-outline-variant/10">
                  {section.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:text-primary/80 underline"
                    >
                      {src.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions - Sticky Bottom */}
        <div className="sticky bottom-0 flex items-center gap-2 px-6 pb-6 pt-4 border-t border-outline-variant/10 bg-surface-container">
          <Button
            onClick={() => onChatAboutThis(combinedContent)}
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
    </>
  )
}
