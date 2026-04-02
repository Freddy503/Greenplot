'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/chat', label: 'Chat', icon: 'chat_bubble' },
  { href: '/garden', label: 'Garden', icon: 'local_florist' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 w-full flex justify-around items-center px-8 pb-8 pt-4 z-50 md:hidden bg-surface-container-low/80 backdrop-blur-xl border-t border-outline-variant/10"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center rounded-full px-6 py-2 transition-all ${
              active
                ? 'bg-primary/10 text-primary'
                : 'text-on-surface-variant/60'
            }`}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontVariationSettings: active ? '"FILL" 1' : '"FILL" 0',
                fontSize: '22px',
              }}
            >
              {tab.icon}
            </span>
            <span
              className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
