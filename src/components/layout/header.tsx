'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

const tabs = [
  { href: '/chat', label: 'Chat', icon: 'chat_bubble' },
  { href: '/garden', label: 'Garden', icon: 'eco' },
  { href: '/links', label: 'Sources', icon: 'link' },
  { href: '/wiki', label: 'Wiki', icon: 'auto_stories' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
]

export default function Header() {
  const pathname = usePathname()
  const [nickname, setNickname] = useState('')

  useEffect(() => {
    setNickname(localStorage.getItem('greenplot_nickname') || '')
  }, [])

  const initial = (nickname || 'G')[0].toUpperCase()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background backdrop-blur-xl border-b border-border/10" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex items-center justify-between px-4 md:px-6 h-14 max-w-7xl mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Avatar className="w-9 h-9 bg-primary shadow-sm">
            <AvatarFallback className="bg-primary text-background font-bold text-sm">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-lg font-bold text-on-surface leading-tight">Greenplot</h1>
            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Living Laboratory</p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {tabs.map((tab) => {
            const active = pathname === tab.href
            return (
              <Link key={tab.href} href={tab.href} className="no-underline">
                <Button
                  variant="ghost"
                  className={`flex items-center gap-1.5 px-3 py-1.5 h-9 rounded-full text-sm font-medium transition-colors
                    ${active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-on-surface hover:bg-accent'}`}
                >
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: active ? '"FILL" 1' : '"FILL" 0' }}>
                    {tab.icon}
                  </span>
                  <span className="hidden lg:inline">{tab.label}</span>
                </Button>
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
