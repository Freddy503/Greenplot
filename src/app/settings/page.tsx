'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import { CalendarConnectCard } from '@/components/settings/calendar-connect-card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { toast } from 'sonner'

const BACKEND = '/api'

export default function SettingsPage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Notification pipeline jobs — pre-defined, no gateway dependency
  const PIPELINE_JOBS = [
    {
      id: 'morning-spark',
      name: 'Morning Idea Spark',
      icon: '💡',
      description: 'Generates a bold "What if…" question from your enriched seeds',
      schedule: 'Daily at 8:30 AM CET',
      cadence: 'daily',
    },
    {
      id: 'daily-briefing',
      name: 'Daily Briefing',
      icon: '☀️',
      description: 'Weather, agentic architecture insight, academic spotlight & enterprise AI news',
      schedule: 'Daily at 8:30 AM CET',
      cadence: 'daily',
    },
    {
      id: 'daily-reflection',
      name: 'Daily Reflection',
      icon: '📓',
      description: 'Afternoon journaling prompt with Notion link',
      schedule: 'Daily at 4:00 PM CET',
      cadence: 'daily',
    },
    {
      id: 'weekly-eval',
      name: 'Weekly Content Eval',
      icon: '📊',
      description: 'Reviews your rated seeds, identifies patterns, suggests enrichment adjustments',
      schedule: 'Sundays at 6:00 PM CET',
      cadence: 'weekly',
    },
    {
      id: 'biweekly-challenge',
      name: 'Biweekly Challenge',
      icon: '🎯',
      description: 'Cross-pollination challenge: identifies knowledge gaps and proposes experiments',
      schedule: '1st & 15th at 10:00 AM CET',
      cadence: 'biweekly',
    },
  ]

  // Edit modes
  const [editingCity, setEditingCity] = useState(false)
  const [editCity, setEditCity] = useState('')
  const [editingNickname, setEditingNickname] = useState(false)
  const [editNickname, setEditNickname] = useState('')

  const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''

  useEffect(() => {
    setNickname(localStorage.getItem('greenplot_nickname') || '')
    try {
      const profile = JSON.parse(localStorage.getItem('greenplot_profile') || '{}')
      setCity(profile.city || '')
    } catch {}

    // (Pipeline jobs are pre-defined — no fetch needed)
  }, [])

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  })

  // ── Save city ───────────────────────────────
  const handleSaveCity = async () => {
    if (!editCity.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${BACKEND}/profile`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ city: editCity.trim() }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setCity(editCity.trim())
      const profile = JSON.parse(localStorage.getItem('greenplot_profile') || '{}')
      profile.city = editCity.trim()
      localStorage.setItem('greenplot_profile', JSON.stringify(profile))
      setEditingCity(false)
      toast.success('Location updated')
    } catch {
      toast.error('Failed to save location')
    } finally {
      setSaving(false)
    }
  }

  // ── Save nickname ───────────────────────────
  const handleSaveNickname = async () => {
    if (!editNickname.trim()) return
    setNickname(editNickname.trim())
    localStorage.setItem('greenplot_nickname', editNickname.trim())
    setEditingNickname(false)
    toast.success('Nickname updated')
  }

  // ── Push notifications (via hook) ──────────
  const { status: pushStatus, requestPermission } = usePushNotifications()
  const notificationsEnabled = pushStatus === 'subscribed' || pushStatus === 'granted'

  const handleToggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const ok = await requestPermission()
      if (ok) {
        toast.success('Notifications enabled')
      } else {
        toast.error('Could not enable notifications. Check browser permissions.')
      }
    } else {
      toast.info('Notifications disabled. Re-enable from browser settings if needed.')
    }
  }

  // ── Logout ──────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem('greenplot_token')
    localStorage.removeItem('greenplot_tenant')
    localStorage.removeItem('greenplot_nickname')
    localStorage.removeItem('greenplot_chat_messages')
    localStorage.removeItem('greenplot_profile')
    toast.success('Logged out')
    router.push('/onboarding')
  }

  // ── Delete account ──────────────────────────
  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete my account') return
    setDeleting(true)
    try {
      const res = await fetch(`${BACKEND}/account`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to delete')
      // Clear all local data
      localStorage.clear()
      toast.success('Account deleted')
      router.push('/onboarding')
    } catch {
      toast.error('Failed to delete account. Try again.')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <Header />
      <main className="pt-[max(3.5rem,env(safe-area-inset-top,3.5rem))] pb-[max(5rem,env(safe-area-inset-bottom,5rem))] px-4 max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-extrabold tracking-tight mb-6 text-on-surface">
          Settings
        </h1>

        {/* ── Support the Project ────────────── */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Support
          </h2>
          <a
            href="https://buymeacoffee.com/freddy503"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-5 py-4 rounded-2xl bg-[#FFDD00] hover:bg-[#ffda00] transition-colors no-underline"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">☕</span>
              <div>
                <p className="text-sm font-bold text-[#1a1a1a]">Buy me a coffee</p>
                <p className="text-xs text-[#1a1a1a]/70">Help keep the garden growing</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-[#1a1a1a]">arrow_forward</span>
          </a>
        </section>

        {/* ── Profile ────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Profile
          </h2>
          <div className="space-y-3">
            {/* Nickname */}
            <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
              {editingNickname ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editNickname}
                    onChange={(e) => setEditNickname(e.target.value)}
                    className="flex-1 rounded-full bg-surface-container-highest border-0"
                    placeholder="Your nickname"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveNickname} disabled={saving} className="rounded-full">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNickname(false)} className="rounded-full">
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-on-surface-variant">Nickname</p>
                    <p className="text-sm font-bold text-on-surface">{nickname || 'Not set'}</p>
                  </div>
                  <button
                    onClick={() => { setEditNickname(nickname); setEditingNickname(true) }}
                    className="text-xs text-primary font-medium"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* Location */}
            <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
              {editingCity ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="flex-1 rounded-full bg-surface-container-highest border-0"
                    placeholder="e.g. Munich, Berlin, NYC"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaveCity} disabled={saving} className="rounded-full">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingCity(false)} className="rounded-full">
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-on-surface-variant">Location</p>
                    <p className="text-sm font-bold text-on-surface">{city || 'Not set'}</p>
                    <p className="text-[10px] text-on-surface-variant/60 mt-0.5">Used for weather in daily briefing</p>
                  </div>
                  <button
                    onClick={() => { setEditCity(city); setEditingCity(true) }}
                    className="text-xs text-primary font-medium"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Notifications ──────────────────── */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Notifications
          </h2>
          <div className="space-y-3">
            {/* Push toggle */}
            <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-on-surface">Push Notifications</p>
                  <p className="text-xs text-on-surface-variant">Daily briefings and reminders</p>
                </div>
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={handleToggleNotifications}
                />
              </div>
              {pushStatus === 'not-installed' && (
                <div className="mt-3 p-3 rounded-xl bg-tertiary-container/20 border border-tertiary/20">
                  <p className="text-xs font-medium text-on-surface mb-1">📱 Install to Home Screen first</p>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Safari requires the app installed to your home screen for notifications.
                    Tap the <span className="material-symbols-outlined text-[12px] align-middle" style={{ fontSize: '14px' }}>ios_share</span> icon → Add to Home Screen.
                  </p>
                </div>
              )}
              {pushStatus === 'denied' && (
                <div className="mt-3 p-3 rounded-xl bg-error/10 border border-error/20">
                  <p className="text-xs font-medium text-error mb-1">🚫 Notifications blocked</p>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Go to Settings → Safari → Notifications → Allow, or in Settings app → Greenplot → toggle Notifications on.
                  </p>
                </div>
              )}
              {pushStatus === 'error' && (
                <div className="mt-3 p-3 rounded-xl bg-error/10 border border-error/20">
                  <p className="text-xs font-medium text-error mb-1">⚠ Could not enable notifications</p>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Make sure you've allowed notification permission when prompted. Try toggling again.
                  </p>
                </div>
              )}
            </div>

          </div>
        </section>

        {/* ── Integrations ───────────────────── */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Integrations
          </h2>
          <CalendarConnectCard />
        </section>

        {/* ── Notification Pipelines ──────────── */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Notification Pipelines
          </h2>
          <div className="space-y-2">
            {PIPELINE_JOBS.map((job) => (
              <div
                key={job.id}
                className="px-4 py-3 rounded-2xl bg-surface-container border border-outline-variant/10"
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5 flex-shrink-0">{job.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-on-surface">{job.name}</p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">{job.description}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="material-symbols-outlined text-on-surface-variant/50" style={{ fontSize: '12px' }}>schedule</span>
                      <span className="text-[9px] text-on-surface-variant/60">{job.schedule}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary ml-1">
                        {job.cadence}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-on-surface-variant/40 mt-3 px-1">
            Pipelines run automatically via OpenClaw cron. Deliveries go to your connected Telegram.
          </p>
        </section>

        {/* ── Support the Project ────────────── */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Support
          </h2>
          <a
            href="https://buymeacoffee.com/freddy503"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full px-5 py-6 rounded-2xl bg-[#FFDD00] hover:bg-[#ffda00] transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-bold text-[#1a1a1a]">Buy me a coffee ☕</p>
                <p className="text-xs text-[#1a1a1a]/70 mt-0.5">Help keep the garden growing</p>
              </div>
              <div className="flex items-center gap-2">
                <svg width="32" height="32" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 20C15 20 15 10 25 10C35 10 35 20 35 20" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M17 22H33V34C33 37.3137 30.3137 40 27 40H23C19.6863 40 17 37.3137 17 34V22Z" fill="#1a1a1a"/>
                  <path d="M12 26H17" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M33 26H38" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M30 17C30 17 35 15 36 10" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span className="material-symbols-outlined text-[#1a1a1a]">arrow_forward</span>
              </div>
            </div>
          </a>
        </section>

        {/* ── Account ────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Account
          </h2>
          <div className="space-y-3">
            {/* Logout */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 transition-colors hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>
                logout
              </span>
              <div className="text-left">
                <p className="text-sm font-bold text-on-surface">Log Out</p>
                <p className="text-xs text-on-surface-variant">Sign out of your account</p>
              </div>
            </button>

            {/* Delete account */}
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-error/5 border border-error/10 transition-colors hover:bg-error/10"
            >
              <span className="material-symbols-outlined text-error" style={{ fontSize: '20px' }}>
                delete_forever
              </span>
              <div className="text-left">
                <p className="text-sm font-bold text-error">Delete Account</p>
                <p className="text-xs text-on-surface-variant">Permanently delete your account and all data</p>
              </div>
            </button>
          </div>
        </section>
      </main>
      <BottomNav />

      {/* ── Delete Account Confirmation Dialog ──────── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="rounded-3xl bg-surface-container border border-outline-variant/10 max-w-sm mx-4">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-error" style={{ fontSize: '28px' }}>
                  warning
                </span>
              </div>
            </div>
            <DialogTitle className="text-center text-lg font-extrabold text-on-surface">
              Delete Account?
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-on-surface-variant">
              This will permanently delete your account, all seeds, conversations, and data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-xs text-on-surface-variant mb-2">
              Type <span className="font-bold text-error">&quot;delete my account&quot;</span> to confirm:
            </p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete my account"
              className="rounded-full bg-surface-container-highest border-error/20 text-center"
              autoFocus
            />
          </div>

          <DialogFooter className="flex gap-2 sm:flex-col">
            <Button
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText.toLowerCase() !== 'delete my account' || deleting}
              className="w-full rounded-full bg-error text-on-error hover:bg-error/90 font-bold"
            >
              {deleting ? 'Deleting...' : 'Delete My Account'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText('') }}
              className="w-full rounded-full text-on-surface-variant"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
