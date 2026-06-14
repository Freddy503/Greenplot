'use client'

// SparkSheet — the opened briefing, redesigned (Greenplot Redesign · surfaces-e).
// Forest-headed bottom sheet with tone-colored sections, bullet cards, source
// chips and sticky actions. Exported as `SparkCard` so existing call sites
// (chat, notifications) keep working unchanged.

import { useState } from 'react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import {
  Sun, BookOpen, Leaf, GraduationCap, FileText, BarChart2, Trophy, Bell,
  X, MessageCircle, Sprout, Share2, Sparkles, Lightbulb, Target, CalendarDays,
  Link2, Globe, type LucideIcon,
} from 'lucide-react'

export interface SparkSection {
  title?: string
  icon?: string
  color?: string
  content: string | string[]
  sources?: Array<{ title: string; url: string }>
}

export interface SparkNotification {
  type: string
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
  when?: string // e.g. "2h ago" — shown next to the type label
}

type ToneKey = 'green' | 'amber' | 'blue' | 'violet'

const TONES: Record<ToneKey, { bg: string; fg: string; heroIcon: string }> = {
  green: { bg: 'var(--green-tint)', fg: 'var(--green-700)', heroIcon: 'rgba(180,240,205,0.95)' },
  amber: { bg: 'rgba(201,138,27,0.12)', fg: '#b87a00', heroIcon: '#ffd989' },
  blue: { bg: 'rgba(59,130,246,0.10)', fg: '#2563eb', heroIcon: '#bcd7ff' },
  violet: { bg: 'rgba(139,92,246,0.10)', fg: '#7c3aed', heroIcon: '#d8c8ff' },
}

const TYPE_CONFIG: Record<string, { Icon: LucideIcon; tone: ToneKey; label: string }> = {
  morning_spark: { Icon: Sun, tone: 'amber', label: 'Today’s Thread' },
  daily_briefing: { Icon: BookOpen, tone: 'green', label: 'Daily Briefing' },
  reflection: { Icon: Leaf, tone: 'green', label: 'Loose Threads' },
  garden_story: { Icon: BookOpen, tone: 'green', label: 'Garden Story' },
  weekly_eval: { Icon: BarChart2, tone: 'green', label: 'Weekly Eval' },
  challenge: { Icon: Trophy, tone: 'green', label: 'Challenge' },
  academic_digest: { Icon: GraduationCap, tone: 'blue', label: 'Research Digest' },
  academic_digest_evening: { Icon: GraduationCap, tone: 'blue', label: 'Research Digest' },
  solution_design: { Icon: FileText, tone: 'violet', label: 'Strategy Paper' },
}
const DEFAULT_TYPE = { Icon: Bell, tone: 'green' as ToneKey, label: 'Notification' }

export function sparkTypeConfig(type: string | undefined) {
  const t = type?.startsWith('solution_design') ? 'solution_design' : type || ''
  return TYPE_CONFIG[t] || DEFAULT_TYPE
}

// Briefing payloads carry Material icon names — map the common ones to lucide
const SECTION_ICONS: Record<string, LucideIcon> = {
  lightbulb: Lightbulb, eco: Leaf, leaf: Leaf, sparkles: Sparkles, auto_awesome: Sparkles,
  target: Target, track_changes: Target, event: CalendarDays, calendar: CalendarDays,
  calendar_today: CalendarDays, link: Link2, description: FileText, file: FileText,
  school: GraduationCap, wb_sunny: Sun, light_mode: Sun, sun: Sun, book: BookOpen,
  menu_book: BookOpen, psychology: Leaf, assessment: BarChart2, emoji_events: Trophy,
}

export function SparkCard({ notification, onChatAboutThis, onDismiss, token, when }: SparkCardProps) {
  const [addingToGarden, setAddingToGarden] = useState(false)
  const [sharing, setSharing] = useState(false)
  const cfg = sparkTypeConfig(notification.type)
  const tone = TONES[cfg.tone]
  const HeroIcon = cfg.Icon

  const handleShare = async () => {
    setSharing(true)
    const text = notification.sections
      .map(s => `${s.title ? '## ' + s.title + '\n' : ''}${typeof s.content === 'string' ? s.content : s.content.join('\n')}`)
      .join('\n\n')
    const shareText = `${notification.title}\n\n${text}`.slice(0, 20000)
    try {
      if (navigator.share) {
        await navigator.share({ title: notification.title, text: shareText })
      } else {
        await navigator.clipboard.writeText(shareText)
        toast.success('Copied to clipboard')
      }
    } catch {
      // user cancelled share
    }
    setSharing(false)
  }

  const handleAddToGarden = async () => {
    setAddingToGarden(true)
    try {
      const allText = notification.sections
        .map(s => `${s.title ? s.title + '\n' : ''}${typeof s.content === 'string' ? s.content : s.content.join('\n')}`)
        .join('\n\n')
        .slice(0, 4000) // stay under ThoughtCreate 5000 char limit

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

  const allSources = notification.sections.flatMap(s => s.sources || [])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      {/* Backdrop */}
      <div
        onClick={onDismiss}
        style={{ position: 'absolute', inset: 0, background: 'rgba(8,22,14,0.42)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      />

      {/* Sheet */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <div
          className="spark-sheetup"
          style={{
            pointerEvents: 'auto', width: '100%', maxWidth: 640, maxHeight: '88dvh',
            display: 'flex', flexDirection: 'column', background: 'var(--bg)',
            borderRadius: '26px 26px 0 0', overflow: 'hidden',
            boxShadow: '0 -18px 60px -12px rgba(8,20,12,0.55)',
          }}
        >
          {/* Forest header */}
          <div className="hero-forest" style={{ borderRadius: '26px 26px 0 0', paddingTop: 10, paddingBottom: 18, flexShrink: 0 }}>
            <div style={{ position: 'relative', zIndex: 2, padding: '0 18px' }}>
              <div style={{ width: 36, height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.28)', margin: '0 auto 14px' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span className="glass-dark" style={{ width: 42, height: 42, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <HeroIcon size={21} color={tone.heroIcon} strokeWidth={1.75} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className="caps" style={{ fontSize: 10, color: 'rgba(180,240,205,0.85)', whiteSpace: 'nowrap' }}>{cfg.label}</span>
                    {when && <span className="body-text" style={{ fontSize: 10.5, color: 'rgba(233,250,239,0.55)', whiteSpace: 'nowrap', flexShrink: 0 }}>{when}</span>}
                  </div>
                  <h2 className="serif" style={{ fontSize: 24, lineHeight: 1.1, color: '#fff', letterSpacing: '-0.01em', marginTop: 4 }}>{notification.title}</h2>
                  {notification.subtitle && (
                    <div className="body-text" style={{ fontSize: 12, color: 'rgba(233,250,239,0.65)', marginTop: 4 }}>{notification.subtitle}</div>
                  )}
                </div>
                <button onClick={onDismiss} className="glass-dark tap" style={{ width: 32, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <X size={16} color="rgba(255,255,255,0.9)" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 20px' }}>
            {notification.sections.map((s, si) => {
              const SectionIcon = SECTION_ICONS[(s.icon || '').toLowerCase()] || Sparkles
              return (
                <div key={si} style={{ marginBottom: si === notification.sections.length - 1 ? 0 : 20 }}>
                  {s.title && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      <SectionIcon size={15} color={tone.fg} strokeWidth={1.75} />
                      <span className="caps" style={{ fontSize: 10, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{s.title}</span>
                    </div>
                  )}
                  {typeof s.content === 'string' ? (
                    <div className="spark-md">
                      <ReactMarkdown>{s.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="card" style={{ borderRadius: 14, overflow: 'hidden', padding: 0 }}>
                      {s.content.map((t, bi) => (
                        <div key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 13px', borderBottom: bi === s.content.length - 1 ? 'none' : '1px solid var(--hairline)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: 99, background: tone.fg, opacity: 0.7, flexShrink: 0, marginTop: 6 }} />
                          <div className="spark-md spark-md-bullet">
                            <ReactMarkdown>{t}</ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {allSources.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
                {allSources.map((src, i) => (
                  <a
                    key={`${src.url}-${i}`} href={src.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 99, padding: '6px 11px', textDecoration: 'none', maxWidth: '100%' }}
                  >
                    <Globe size={12} color="var(--ink-3)" strokeWidth={1.75} />
                    <span className="ui" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.title}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Sticky actions */}
          <div style={{
            flexShrink: 0, display: 'flex', gap: 8,
            padding: '12px 16px calc(16px + env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--hairline)',
            background: 'rgba(250,249,246,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}>
            <button
              onClick={() => onChatAboutThis(combinedContent)}
              className="tap"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--green)', border: 'none', borderRadius: 14, padding: '13px 14px', cursor: 'pointer', boxShadow: '0 8px 20px -8px rgba(34,197,94,0.7)' }}
            >
              <MessageCircle size={17} color="#fff" strokeWidth={2} />
              <span className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>Chat about this</span>
            </button>
            <button
              onClick={handleAddToGarden} disabled={addingToGarden}
              className="tap"
              style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 14, padding: '13px 15px', cursor: 'pointer', opacity: addingToGarden ? 0.5 : 1 }}
            >
              <Sprout size={17} color="var(--green-700)" strokeWidth={2} />
              <span className="ui" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>{addingToGarden ? '…' : 'Garden'}</span>
            </button>
            <button
              onClick={handleShare} disabled={sharing} title="Share or copy"
              className="tap"
              style={{ width: 46, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: sharing ? 0.5 : 1 }}
            >
              <Share2 size={17} color="var(--ink-2)" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes sparkSheetUp { from { transform: translateY(60%); opacity: 0.4; } to { transform: translateY(0); opacity: 1; } }
        .spark-sheetup { animation: sparkSheetUp .38s cubic-bezier(.16,1,.3,1) both; }
        .spark-md { font-family: var(--body); font-size: 14px; line-height: 1.65; color: var(--ink-2); }
        .spark-md p { margin: 0 0 10px; }
        .spark-md p:last-child { margin-bottom: 0; }
        .spark-md strong { color: var(--ink); font-weight: 600; }
        .spark-md a { color: var(--green-700); font-weight: 500; }
        .spark-md ul, .spark-md ol { padding-left: 18px; margin: 0 0 10px; }
        .spark-md li { margin-bottom: 4px; }
        .spark-md code { background: var(--surface-sunk); border-radius: 4px; padding: 1px 5px; font-size: 12.5px; }
        .spark-md-bullet { font-family: var(--ui); font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.45; }
        .spark-md-bullet p { margin: 0; }
      ` }} />
    </div>
  )
}
