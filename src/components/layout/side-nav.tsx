'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MessageCircle, Sprout, FlaskConical, BookOpen, Settings, Bell, Leaf, Plus } from 'lucide-react'

const NAV = [
  { key: 'chat',     href: '/chat',     Icon: MessageCircle, label: 'Chat'    },
  { key: 'garden',   href: '/garden',   Icon: Sprout,        label: 'Garden'  },
  { key: 'studio',   href: '/studio',   Icon: FlaskConical,  label: 'Studio'  },
  { key: 'library',  href: '/library',  Icon: BookOpen,      label: 'Library' },
  { key: 'settings', href: '/settings', Icon: Settings,      label: 'Settings'},
]

// Routes that get the desktop app shell. Landing, login, onboarding etc. stay full-bleed.
const APP_PREFIXES = ['/chat', '/garden', '/studio', '/library', '/settings', '/wiki', '/links', '/notifications', '/explain']

export default function SideNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [hasUnread, setHasUnread] = useState(false)

  const visible = APP_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))

  useEffect(() => {
    if (visible) document.body.classList.add('with-sidenav')
    else document.body.classList.remove('with-sidenav')
    return () => document.body.classList.remove('with-sidenav')
  }, [visible])

  useEffect(() => {
    const count = parseInt(localStorage.getItem('greenplot_new_sources') || '0', 10)
    setHasUnread(count > 0)
  }, [pathname])

  if (!visible) return null

  return (
    <aside
      className="hidden lg:flex print:hidden"
      style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 248, zIndex: 45,
        flexDirection: 'column',
        background: 'linear-gradient(165deg, var(--forest-2) 0%, var(--forest-1) 70%)',
        borderRight: '1px solid rgba(126,240,168,0.08)',
      }}
    >
      {/* Brand */}
      <button
        onClick={() => router.push('/chat')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '22px 20px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 11,
          background: 'linear-gradient(160deg, #34d97a, #16a34a)',
          boxShadow: '0 4px 12px -4px rgba(34,197,94,0.6), inset 0 1px 0 rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Leaf size={20} color="#06281a" strokeWidth={2} />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em', color: '#fff' }}>Greenplot</div>
          <div className="caps" style={{ fontSize: 8.5, color: 'rgba(180,240,205,0.6)', marginTop: 1 }}>LIVING LABORATORY</div>
        </div>
      </button>

      {/* New chat */}
      <div style={{ padding: '0 14px 14px' }}>
        <button
          onClick={() => router.push('/chat')}
          className="tap"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
            background: 'rgba(126,240,168,0.12)', color: '#7ef0a8',
            border: '1px solid rgba(126,240,168,0.22)', borderRadius: 13, padding: '10px 0',
            fontFamily: 'var(--ui)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Plus size={15} strokeWidth={2.25} /> New thought
        </button>
      </div>

      {/* Primary nav */}
      <nav style={{ flex: 1, padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto' }}>
        {NAV.map(({ key, href, Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link key={key} href={href} style={{ textDecoration: 'none' }}>
              <div
                className={active ? 'tap' : 'tap snav-item'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12,
                  background: active ? 'rgba(126,240,168,0.13)' : undefined,
                }}
              >
                <Icon size={18} strokeWidth={active ? 2 : 1.75} color={active ? '#7ef0a8' : 'rgba(233,250,239,0.6)'} />
                <span style={{
                  fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: active ? 700 : 500,
                  color: active ? '#e9faef' : 'rgba(233,250,239,0.65)',
                }}>
                  {label}
                </span>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Bottom: notifications */}
      <div style={{ padding: '12px 14px 18px', borderTop: '1px solid rgba(126,240,168,0.08)' }}>
        <Link href="/notifications" style={{ textDecoration: 'none' }}>
          <div className="tap" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12 }}>
            <span style={{ position: 'relative', display: 'flex' }}>
              <Bell size={18} strokeWidth={1.75} color="rgba(233,250,239,0.6)" />
              {hasUnread && (
                <span style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: 99, background: 'var(--green)', boxShadow: '0 0 0 2px var(--forest-1)' }} />
              )}
            </span>
            <span style={{ fontFamily: 'var(--ui)', fontSize: 13.5, fontWeight: 500, color: 'rgba(233,250,239,0.65)' }}>Notifications</span>
          </div>
        </Link>
      </div>
    </aside>
  )
}
