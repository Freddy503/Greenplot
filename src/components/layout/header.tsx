'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MessageCircle, Sprout, FlaskConical, BookOpen, Settings, Bell, Search, Leaf } from 'lucide-react'

const tabs = [
  { href: '/chat',     label: 'Chat',     Icon: MessageCircle },
  { href: '/garden',   label: 'Garden',   Icon: Sprout        },
  { href: '/studio',   label: 'Studio',   Icon: FlaskConical  },
  { href: '/library',  label: 'Library',  Icon: BookOpen      },
  { href: '/settings', label: 'Settings', Icon: Settings      },
]

export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const [hasUnread, setHasUnread] = useState(false)

  useEffect(() => {
    const count = parseInt(localStorage.getItem('greenplot_new_sources') || '0', 10)
    setHasUnread(count > 0)
  }, [])

  return (
    <header
      className="hidden md:block fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/10"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between px-4 md:px-6 h-14 max-w-7xl mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-3">
          {onMenuClick ? (
            <button
              onClick={onMenuClick}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant"
              aria-label="Open chat history"
            >
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                <rect y="0" width="18" height="2" rx="1" fill="currentColor"/>
                <rect y="6" width="18" height="2" rx="1" fill="currentColor"/>
                <rect y="12" width="12" height="2" rx="1" fill="currentColor"/>
              </svg>
            </button>
          ) : (
            <div style={{
              width: 34, height: 34, borderRadius: 11,
              background: 'linear-gradient(160deg, #34d97a, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Leaf size={18} color="#06281a" strokeWidth={2} />
            </div>
          )}
          <div>
            <span className="text-base font-bold" style={{ fontFamily: 'var(--ui)', color: 'var(--ink)' }}>Greenplot</span>
          </div>
        </div>

        {/* Desktop nav + actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push('/chat')}
            className="hidden md:flex w-9 h-9 items-center justify-center rounded-xl hover:bg-surface-container transition-colors"
            aria-label="Search"
          >
            <Search size={18} strokeWidth={1.75} color="var(--ink-2)" />
          </button>
          <button
            onClick={() => router.push('/notifications')}
            className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-container transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} strokeWidth={1.75} color="var(--ink-2)" />
            {hasUnread && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500" />
            )}
          </button>

          <nav className="hidden md:flex items-center gap-1 ml-2">
            {tabs.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href} className="no-underline">
                  <button
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                      borderRadius: 9999, border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 600,
                      background: active ? 'var(--green-tint)' : 'transparent',
                      color: active ? 'var(--green-700)' : 'var(--ink-3)',
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                  >
                    <Icon size={15} strokeWidth={active ? 2 : 1.75} />
                    <span className="hidden lg:inline">{label}</span>
                  </button>
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </header>
  )
}
