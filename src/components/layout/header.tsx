'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const tabs = [
  { href: '/chat', label: 'Chat', icon: 'chat_bubble' },
  { href: '/garden', label: 'Garden', icon: 'eco' },
]

export default function Header() {
  const pathname = usePathname()
  const [nickname, setNickname] = useState('')

  useEffect(() => {
    setNickname(localStorage.getItem('seedify_nickname') || '')
  }, [])

  return (
    <header
      className="fixed top-0 w-full z-50 backdrop-blur-xl border-b"
      style={{ background: 'rgba(1,18,11,0.85)', borderColor: 'var(--border)' }}
    >
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'var(--primary)' }}
          >
            <span className="font-bold text-sm" style={{ color: 'var(--primary-foreground)' }}>
              S
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
              Seedify
            </h1>
            {nickname && (
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                @{nickname}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const active = pathname === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--primary)' : 'var(--muted-foreground)',
                }}
              >
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: active ? '"FILL" 1' : undefined }}>
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
