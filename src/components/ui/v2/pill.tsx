import React from 'react'

type PillTone = 'neutral' | 'green' | 'soft' | 'amber' | 'ghost'
type PillSize = 'xs' | 'sm'

const TONES: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--surface-sunk)', fg: 'var(--ink-2)' },
  green:   { bg: 'var(--green-tint)',   fg: 'var(--green-700)' },
  soft:    { bg: 'rgba(34,197,94,0.10)', fg: 'var(--green-700)' },
  amber:   { bg: 'rgba(201,138,27,0.12)', fg: 'var(--amber)' },
  ghost:   { bg: 'transparent',          fg: 'var(--ink-3)' },
}

interface PillProps {
  children: React.ReactNode
  tone?: PillTone
  size?: PillSize
}

export default function Pill({ children, tone = 'neutral', size = 'sm' }: PillProps) {
  const t = TONES[tone]
  return (
    <span
      className="ui"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: t.bg, color: t.fg,
        borderRadius: 9999,
        padding: size === 'xs' ? '2px 8px' : '4px 11px',
        fontSize: size === 'xs' ? 10.5 : 11.5,
        fontWeight: 600, letterSpacing: '0.01em', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}
