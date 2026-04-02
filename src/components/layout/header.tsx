'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

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

  const initial = nickname ? nickname[0].toUpperCase() : 'G'

  return (
    <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-surface/80 backdrop-blur-2xl border-b border-outline-variant/10">
      {/* Logo + Identity */}
      <div className="flex items-center gap-3">
        <Avatar className="w-10 h-10 bg-primary shadow-[0_4px_16px_rgba(105,246,184,0.20)]">
          <AvatarFallback className="bg-primary text-on-primary font-bold text-base">
            {initial}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col leading-none">
          <h1 className="text-xl font-extrabold tracking-tight text-on-surface">Greenplot</h1>
          <span className="text-[10px] font-bold uppercase text-primary" style={{ letterSpacing: '0.2em' }}>
            THE LIVING LABORATORY
          </span>
        </div>
      </div>

      {/* Desktop nav tabs */}
      <nav className="hidden md:flex items-center gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <Link key={tab.href} href={tab.href} className="no-underline">
              <Button
                variant="ghost"
                className={`
                  flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium
                  ${active
                    ? 'bg-primary/10 text-primary hover:bg-primary/15'
                    : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container'
                  }
                `}
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
              </Button>
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
