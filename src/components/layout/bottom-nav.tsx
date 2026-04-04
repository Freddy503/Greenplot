'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/chat', label: 'Chat', icon: 'chat_bubble' },
  { href: '/garden', label: 'Garden', icon: 'eco' },
  { href: '/links', label: 'Sources', icon: 'link' },
  { href: '/wiki', label: 'Wiki', icon: 'auto_stories' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border/60 py-2 px-4 md:hidden">
      <div className="flex justify-around items-center">
        {navItems.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center gap-1 py-1 px-2 rounded-xl min-w-12
                transition-colors no-underline
                ${active ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}
              `}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={{ fontVariationSettings: active ? '"FILL" 1' : '"FILL" 0' }}
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
