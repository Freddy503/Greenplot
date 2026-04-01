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
    setNickname(localStorage.getItem('greenplot_nickname') || '')
  }, [])

  // User initial for avatar
  const initial = nickname ? nickname[0].toUpperCase() : 'G'

  return (
    <header
      className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
      style={{
        background: 'rgba(17, 20, 18, 0.80)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(63, 73, 67, 0.10)',
      }}
    >
      {/* Logo + Identity */}
      <div className="flex items-center gap-3">
        {/* Green circle avatar with user initial */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: '#10B981',
            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.20)',
          }}
        >
          <span
            className="font-bold text-base"
            style={{ color: '#003825' }}
          >
            {initial}
          </span>
        </div>

        {/* Brand text */}
        <div className="flex flex-col leading-none">
          <h1
            className="text-xl font-extrabold tracking-tight"
            style={{ color: '#e1e3df' }}
          >
            Greenplot
          </h1>
          <span
            className="text-[10px] font-bold uppercase"
            style={{
              color: '#10B981',
              letterSpacing: '0.2em',
            }}
          >
            THE LIVING LABORATORY
          </span>
        </div>
      </div>

      {/* Desktop nav tabs */}
      <nav className="hidden md:flex items-center gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={{
                background: active ? 'rgba(16,185,129,0.10)' : 'transparent',
                color: active ? '#10B981' : 'rgba(159,184,170,0.70)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '18px',
                  fontVariationSettings: active ? '"FILL" 1' : '"FILL" 0',
                }}
              >
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
