'use client'

import { useRouter } from 'next/navigation'
import { Search, Bell, Leaf } from 'lucide-react'
import { useState, useEffect } from 'react'

interface HeroProps {
  eyebrow?: string
  title: React.ReactNode
  accent?: string
  subtitle?: string
  tall?: boolean
  showBell?: boolean
  onBellClick?: () => void
  children?: React.ReactNode
}

function Brand() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.push('/chat')}
      style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <div style={{
        width: 34, height: 34, borderRadius: 11,
        background: 'linear-gradient(160deg, #34d97a, #16a34a)',
        boxShadow: '0 4px 12px -4px rgba(34,197,94,0.6), inset 0 1px 0 rgba(255,255,255,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Leaf size={19} color="#06281a" strokeWidth={2} />
      </div>
      <span style={{ fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: '#fff' }}>
        Greenplot
      </span>
    </button>
  )
}

function HeroIconBtn({
  children,
  badge,
  onClick,
}: {
  children: React.ReactNode
  badge?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="glass-dark tap"
      style={{
        width: 38, height: 38, borderRadius: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', border: 'none', cursor: 'pointer'
      }}
    >
      {children}
      {badge && (
        <span style={{
          position: 'absolute', top: 8, right: 8,
          width: 7, height: 7, borderRadius: 99,
          background: 'var(--green)',
          boxShadow: '0 0 0 2px var(--forest-2)'
        }} />
      )}
    </button>
  )
}

export default function Hero({
  eyebrow,
  title,
  accent,
  subtitle,
  tall = false,
  showBell = true,
  onBellClick,
  children,
}: HeroProps) {
  const router = useRouter()
  const [hasUnread, setHasUnread] = useState(false)

  useEffect(() => {
    const count = parseInt(localStorage.getItem('greenplot_new_sources') || '0', 10)
    setHasUnread(count > 0)
  }, [])

  return (
    <div
      className="hero-forest"
      style={{ borderRadius: '0 0 30px 30px', paddingTop: 60, paddingBottom: tall ? 30 : 26, position: 'relative', zIndex: 2 }}
    >
      <div style={{ position: 'relative', zIndex: 2, padding: '0 22px' }}>
        {/* Chrome row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tall ? 22 : 18 }}>
          <Brand />
          <div style={{ display: 'flex', gap: 9 }}>
            <HeroIconBtn onClick={() => router.push('/chat')}>
              <Search size={19} color="rgba(255,255,255,0.92)" strokeWidth={1.75} />
            </HeroIconBtn>
            {showBell && (
              <HeroIconBtn badge={hasUnread} onClick={onBellClick || (() => router.push('/notifications'))}>
                <Bell size={19} color="rgba(255,255,255,0.92)" strokeWidth={1.75} />
              </HeroIconBtn>
            )}
          </div>
        </div>

        {/* Eyebrow */}
        {eyebrow && (
          <div className="caps" style={{ fontSize: 10.5, color: 'rgba(180,240,205,0.8)', marginBottom: 10 }}>
            {eyebrow}
          </div>
        )}

        {/* Title */}
        {title && (
          <h1 className="serif" style={{ fontSize: 40, lineHeight: 1.0, color: '#fff', letterSpacing: '-0.02em' }}>
            {title}
            {accent && <span style={{ color: '#7ef0a8' }}> {accent}</span>}
          </h1>
        )}

        {/* Subtitle */}
        {subtitle && (
          <p className="body-text" style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.6, color: 'rgba(233,250,239,0.72)', maxWidth: 300 }}>
            {subtitle}
          </p>
        )}

        {/* Hero content slot */}
        {children}
      </div>
    </div>
  )
}
