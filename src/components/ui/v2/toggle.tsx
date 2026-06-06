'use client'

import { useState } from 'react'

interface ToggleProps {
  on?: boolean
  onChange?: (on: boolean) => void
}

export default function Toggle({ on: initialOn = false, onChange }: ToggleProps) {
  const [on, setOn] = useState(initialOn)

  const toggle = () => {
    const next = !on
    setOn(next)
    onChange?.(next)
  }

  return (
    <button
      onClick={toggle}
      className="tap"
      style={{
        width: 46, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer',
        padding: 3,
        background: on ? 'var(--green)' : 'var(--border-2)',
        transition: 'background 0.2s ease',
        display: 'flex',
        justifyContent: on ? 'flex-end' : 'flex-start',
        flexShrink: 0,
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 99, background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'all 0.2s ease',
        display: 'block',
      }} />
    </button>
  )
}
