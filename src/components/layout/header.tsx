'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const tabs = [
  { href: '/chat', label: 'Chat', icon: 'chat_bubble' },
  { href: '/garden', label: 'Garden', icon: 'eco' },
  { href: '/links', label: 'Sources', icon: 'link' },
  { href: '/wiki', label: 'Plants', icon: 'auto_stories' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
]

export default function Header() {
  const pathname = usePathname()
  const [nickname, setNickname] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setNickname(localStorage.getItem('greenplot_nickname') || '')
    setMounted(true)
  }, [])

  const initial = mounted && nickname ? nickname[0].toUpperCase() : 'G'

  return (
    <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-background border-b border-border/60">
      {/* Logo + Identity */}
      <div className="flex items-center gap-3">
        <Avatar className="w-10 h-10 bg-primary shadow-sm">
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
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}
              >
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: active ? '"FILL" 1' : '"FILL" 0' }}>
                  {tab.icon}
                </span>
                {tab.label}
              </Button>
            </Link>
          )
        })}
      </nav>

      {/* Avatar (mobile) */}
      <div className="flex md:hidden items-center gap-2">
        <Avatar className="w-8 h-8 bg-primary shadow-sm">
          <AvatarFallback className="bg-primary text-on-primary font-bold text-xs">
            {initial}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
