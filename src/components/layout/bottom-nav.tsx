'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const navItems = [
  { href: '/chat', label: 'Chat', icon: 'chat_bubble', badge: false },
  { href: '/garden', label: 'Garden', icon: 'eco', badge: false },
  { href: '/links', label: 'Sources', icon: 'link', badge: true },
  { href: '/wiki', label: 'Wiki', icon: 'auto_stories', badge: false },
  { href: '/notifications', label: 'Inbox', icon: 'notifications', badge: false },
  { href: '/settings', label: 'Settings', icon: 'settings', badge: false },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    // Get count from localStorage (the Links page updates this)
    const stored = localStorage.getItem('greenplot_new_sources')
    if (stored) {
      setUnreadCount(parseInt(stored, 10))
    }
  }, [])

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/10 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex justify-around items-center py-1.5 px-2 max-w-lg mx-auto">
        {navItems.map((item) => {
          const active = pathname === item.href
          const showBadge = item.badge && unreadCount > 0

          return (
            <Link key={item.href} href={item.href} className="no-underline relative">
              {showBadge && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center leading-none px-0.5 shadow-sm">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              <div className={`flex flex-col items-center gap-0.5 py-1 px-2 min-w-[56px] rounded-xl transition-colors
                ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                <span className="material-symbols-outlined text-xl" >
                  {item.icon}
                </span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
