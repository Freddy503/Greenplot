'use client'

import { ArrowLeft } from 'lucide-react'

interface DetailHeroProps {
  eyebrow?: string
  title: React.ReactNode
  accent?: string
  onClose: () => void
  right?: React.ReactNode
  children?: React.ReactNode
  tall?: boolean
}

export function DetailHeroBtn({
  name,
  onClick,
}: {
  name: 'more' | 'bookmark' | 'check' | 'share'
  onClick?: () => void
}) {
  const icons: Record<string, React.ReactNode> = {
    more: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="5" cy="9" r="1.5" fill="rgba(255,255,255,0.9)"/>
        <circle cx="9" cy="9" r="1.5" fill="rgba(255,255,255,0.9)"/>
        <circle cx="13" cy="9" r="1.5" fill="rgba(255,255,255,0.9)"/>
      </svg>
    ),
    bookmark: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M4 3h10v13l-5-3-5 3V3Z" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
    check: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M3.5 9L7.5 13L14.5 5" stroke="rgba(255,255,255,0.9)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    share: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M13 6.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"/>
        <path d="M5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"/>
        <path d="M13 16.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"/>
        <path d="M7.5 9.5L10.5 11M10.5 7L7.5 8.5" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  }
  return (
    <button
      onClick={onClick}
      className="glass-dark tap"
      style={{
        width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      {icons[name]}
    </button>
  )
}

export default function DetailHero({
  eyebrow,
  title,
  accent,
  onClose,
  right,
  children,
  tall = false,
}: DetailHeroProps) {
  return (
    <div
      className="hero-forest"
      style={{ borderRadius: '0 0 28px 28px', paddingTop: 'max(52px, calc(env(safe-area-inset-top, 0px) + 18px))', paddingBottom: tall ? 28 : 22 }}
    >
      <div style={{ position: 'relative', zIndex: 2, padding: '0 18px' }}>
        {/* Top bar: back + optional right action */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tall ? 20 : 16 }}>
          <button
            onClick={onClose}
            className="glass-dark tap"
            style={{ width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft size={19} color="rgba(255,255,255,0.92)" strokeWidth={1.75} />
          </button>
          {right || <div style={{ width: 38, height: 38 }} />}
        </div>

        {/* Eyebrow */}
        {eyebrow && (
          <div className="caps" style={{ fontSize: 10.5, color: 'rgba(180,240,205,0.82)', marginBottom: 10 }}>
            {eyebrow}
          </div>
        )}

        {/* Title */}
        {title && (
          <h1 className="serif" style={{ fontSize: tall ? 34 : 30, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.02em' }}>
            {title}
            {accent && <span style={{ color: '#7ef0a8' }}> {accent}</span>}
          </h1>
        )}

        {/* Slot */}
        {children}
      </div>
    </div>
  )
}
