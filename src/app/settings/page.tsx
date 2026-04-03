'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import { CalendarConnectCard } from '@/components/settings/calendar-connect-card'

export default function SettingsPage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')

  useEffect(() => {
    setNickname(localStorage.getItem('greenplot_nickname') || '')
    try {
      const profile = JSON.parse(localStorage.getItem('greenplot_profile') || '{}')
      setCity(profile.city || '')
    } catch {}
  }, [])

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <Header />
      <main className="pt-20 pb-28 px-4 max-w-lg mx-auto w-full">
        <h1 className="text-3xl font-extrabold tracking-tight mb-6 text-on-surface">
          Settings
        </h1>

        {/* Profile */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Profile
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
              <div>
                <p className="text-xs text-on-surface-variant">Nickname</p>
                <p className="text-sm font-bold text-on-surface">{nickname || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
              <div>
                <p className="text-xs text-on-surface-variant">Location</p>
                <p className="text-sm font-bold text-on-surface">{city || 'Not set'}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Integrations
          </h2>
          <CalendarConnectCard />
        </section>

        {/* Cron */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Notifications
          </h2>
          <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
            <p className="text-sm font-bold text-on-surface">Digest Frequency</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Change how often you receive insights in onboarding settings.
            </p>
          </div>
        </section>
      </main>
      <BottomNav />
    </div>
  )
}
