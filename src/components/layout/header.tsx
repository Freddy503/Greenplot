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
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setNickname(localStorage.getItem('greenplot_nickname') || '')
    setMounted(true)
  }, [])

  // Use 'G' as default until mounted to avoid hydration mismatch
  const initial = mounted && nickname ? nickname[0].toUpperCase() : 'G'

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        {/* Logo */}
        <Link href="/chat" className="flex items-center gap-3 no-underline">
          <Avatar className="w-8 h-8 bg-primary shadow-[0_2px_8px_rgba(22,163,74,0.15)]">
            <AvatarFallback className="bg-primary text-on-primary font-bold text-sm">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col leading-none">
            <span className="text-base font-bold text-on-surface tracking-tight">Greenplot</span>
            <span className="text-[9px] font-semibold uppercase text-primary/70" style={{ letterSpacing: '0.15em' }}>
              THE LIVING LABORATORY
            </span>
          </div>
        </Link>

        {/* Desktop nav tabs */}
        <nav className="hidden md:flex items-center gap-1">
          {tabs.map((tab) => {
            const active = pathname === tab.href
            return (
              <Link key={tab.href} href={tab.href} className="no-underline">
                <Button
                  variant="ghost"
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium min-h-0 h-9
                    ${active
                      ? 'bg-primary/10 text-primary hover:bg-primary/15'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-gray-50'}
                  `}
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
      </div>
    </header>
  )
}
