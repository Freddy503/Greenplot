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
import { toast } from 'sonner'

const BACKEND = '/api'
const DIGEST_OPTIONS = [
  { value: 'twice-daily', label: 'Twice a day', desc: 'Morning + evening digests' },
  { value: 'once-daily', label: 'Once a day', desc: 'Morning digest only' },
  { value: 'bi-weekly', label: 'Twice a week', desc: 'Mon & Thu digests' },
  { value: 'weekly', label: 'Weekly', desc: 'Monday digest only' },
]

export default function SettingsPage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')
  const [digestFrequency, setDigestFrequency] = useState('once-daily')
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

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
      setDigestFrequency(profile.digest_frequency || 'once-daily')
    } catch {}

    // Check push notification status
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted')
    }
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

  // ── Save digest frequency ───────────────────
  const handleSaveFrequency = async (freq: string) => {
    setSaving(true)
    try {
      const res = await fetch(`${BACKEND}/profile`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ digest_frequency: freq }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setDigestFrequency(freq)
      const profile = JSON.parse(localStorage.getItem('greenplot_profile') || '{}')
      profile.digest_frequency = freq
      localStorage.setItem('greenplot_profile', JSON.stringify(profile))
      toast.success('Digest frequency updated')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle notifications ────────────────────
  const handleToggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: undefined, // Will use existing VAPID key
        })
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ subscription: sub.toJSON(), userId: token }),
        })
        setNotificationsEnabled(true)
        toast.success('Notifications enabled')
      } catch {
        toast.error('Could not enable notifications. Check browser permissions.')
      }
    } else {
      setNotificationsEnabled(false)
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
    router.push('/login')
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
      <main className="pt-20 pb-28 px-4 max-w-lg mx-auto w-full">
        <h1 className="text-3xl font-extrabold tracking-tight mb-6 text-on-surface">
          Settings
        </h1>

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
            <div className="flex items-center justify-between px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
              <div>
                <p className="text-sm font-bold text-on-surface">Push Notifications</p>
                <p className="text-xs text-on-surface-variant">Receive daily briefings and reminders</p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={handleToggleNotifications}
              />
            </div>

            {/* Digest frequency */}
            <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
              <p className="text-sm font-bold text-on-surface mb-3">Digest Frequency</p>
              <div className="space-y-2">
                {DIGEST_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSaveFrequency(opt.value)}
                    disabled={saving}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                      digestFrequency === opt.value
                        ? 'bg-primary/10 border border-primary/30'
                        : 'bg-surface-container-highest/50 border border-transparent hover:bg-surface-container-highest'
                    }`}
                  >
                    <div className="text-left">
                      <p className={`text-sm font-semibold ${digestFrequency === opt.value ? 'text-primary' : 'text-on-surface'}`}>
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-on-surface-variant">{opt.desc}</p>
                    </div>
                    {digestFrequency === opt.value && (
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}>
                        check_circle
                      </span>
                    )}
                  </button>
                ))}
              </div>
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
