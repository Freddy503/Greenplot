'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircle, Sprout, FlaskConical, BookOpen, Settings } from 'lucide-react'

const NAV = [
  { key: 'chat',     href: '/chat',     Icon: MessageCircle, label: 'Chat'    },
  { key: 'garden',   href: '/garden',   Icon: Sprout,        label: 'Garden'  },
  { key: 'studio',   href: '/studio',   Icon: FlaskConical,  label: 'Studio'  },
  { key: 'library',  href: '/library',  Icon: BookOpen,      label: 'Library' },
  { key: 'settings', href: '/settings', Icon: Settings,      label: 'Settings'},
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 35,
        background: 'rgba(250,249,246,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 -0.5px 0 rgba(22,21,15,0.07)',
        paddingTop: 9,
        paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-start', padding: '0 8px' }}>
        {NAV.map(({ key, href, Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={key}
              href={href}
              style={{ textDecoration: 'none' }}
            >
              <div
                className="tap"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  width: 60, padding: '2px 0',
                }}
              >
                <Icon
                  size={23}
                  strokeWidth={active ? 2 : 1.75}
                  color={active ? 'var(--green-700)' : '#9a978c'}
                />
                <span style={{
                  fontFamily: 'var(--ui)', fontSize: 10.5,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--green-700)' : '#9a978c',
                }}>
                  {label}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
      {/* Home indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
        <div style={{ width: 134, height: 5, borderRadius: 99, background: 'rgba(22,21,15,0.22)' }} />
      </div>
    </nav>
  )
}
