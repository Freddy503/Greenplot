'use client'

import { LucideIcon } from 'lucide-react'

interface SegmentedItem {
  key: string
  label: string
  Icon?: LucideIcon
}

interface SegmentedProps {
  items: SegmentedItem[]
  value: string
  onChange: (key: string) => void
  dark?: boolean
}

export default function Segmented({ items, value, onChange, dark = false }: SegmentedProps) {
  return (
    <div style={{
      display: 'inline-flex', padding: 3, borderRadius: 99, gap: 2,
      background: dark ? 'rgba(255,255,255,0.12)' : 'var(--surface-sunk)',
    }}>
      {items.map((it) => {
        const on = value === it.key
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className="tap"
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 99, padding: '7px 15px',
              fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--ui)',
              display: 'flex', alignItems: 'center', gap: 6,
              background: on ? (dark ? '#fff' : 'var(--surface, #ffffff)') : 'transparent',
              color: on
                ? (dark ? 'var(--green-700)' : 'var(--ink)')
                : (dark ? 'rgba(255,255,255,0.7)' : 'var(--ink-3)'),
              boxShadow: on ? '0 1px 3px rgba(20,19,12,0.12)' : 'none',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {it.Icon && (
              <it.Icon
                size={15}
                strokeWidth={1.75}
                color={on
                  ? (dark ? 'var(--green-700)' : 'var(--ink)')
                  : (dark ? 'rgba(255,255,255,0.7)' : 'var(--ink-3)')}
              />
            )}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
