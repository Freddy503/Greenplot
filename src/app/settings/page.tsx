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

// ── Cron helpers ───────────────────────────────
function cronToHuman(expr: string): string {
  const parts = expr.split(' ')
  if (parts.length < 5) return expr
  const [min, hour, dayOfMonth, month, dayOfWeek] = parts
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (min.startsWith('*/')) return `Every ${min.slice(2)} minutes`
    if (hour === '*') return `At minute ${min} every hour`
    return `Daily at ${hour}:${min.padStart(2, '0')}`
  }
  if (dayOfWeek !== '*' && dayOfMonth === '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const d = dayOfWeek.split(',').map(i => days[parseInt(i)] || i).join(', ')
    return `${d} at ${hour}:${min.padStart(2, '0')}`
  }
  if (dayOfMonth.startsWith('*/')) return `Every ${dayOfMonth.slice(2)} days at ${hour}:${min.padStart(2, '0')}`
  return expr
}

function getStatusColor(status: string, errors: number): string {
  if (errors > 0) return 'text-error'
  if (status === 'ok') return 'text-primary'
  if (status === 'error') return 'text-error'
  return 'text-on-surface-variant'
}

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

  // Cron jobs state
  const [cronJobs, setCronJobs] = useState<Array<{
    id: string
    name: string
    enabled: boolean
    schedule: string
    nextRun: string
    lastRun: string
    lastStatus: string
    consecutiveErrors: number
  }>>([])
  const [cronLoading, setCronLoading] = useState(true)
  const [runningJob, setRunningJob] = useState<string | null>(null)

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

    // Fetch cron jobs — only notification-triggering pipeline jobs
    const NOTIFICATION_JOBS = [
      'Morning Idea Spark',
      'Daily Briefing with Weather',
      'Daily Reflection Prompt',
      'Weekly Content Eval Review (Sun 18:00 CET)',
      'Biweekly Challenge Agent',
    ]
    fetch('/api/cron')
      .then(r => r.json())
      .then(data => {
        const jobs = (data.jobs || [])
          .filter((j: any) => NOTIFICATION_JOBS.some(n => (j.name || '').toLowerCase().includes(n.toLowerCase().split(' (')[0])))
          .map((j: any) => {
            const sched = j.schedule || {}
            let scheduleDesc = ''
            if (sched.kind === 'cron') {
              scheduleDesc = cronToHuman(sched.expr)
              if (sched.tz) scheduleDesc += ` (${sched.tz})`
            } else if (sched.kind === 'every') {
              const mins = Math.round(sched.everyMs / 60000)
              scheduleDesc = mins >= 60 ? `Every ${mins / 60}h` : `Every ${mins}m`
            }
            const fmt = (ms: number | undefined) => ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
            return {
              id: j.id,
              name: j.name || 'Unnamed',
              enabled: j.enabled !== false,
              schedule: scheduleDesc,
              nextRun: fmt(j.state?.nextRunAtMs),
              lastRun: fmt(j.state?.lastRunAtMs),
              lastStatus: j.state?.lastStatus || '—',
              consecutiveErrors: j.state?.consecutiveErrors || 0,
            }
          })
        setCronJobs(jobs)
      })
      .catch(() => {})
      .finally(() => setCronLoading(false))
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

  // ── Run cron job ────────────────────────────
  const handleRunNow = async (jobId: string, jobName: string) => {
    setRunningJob(jobId)
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', jobId }),
      })
      if (res.ok) {
        toast.success(`Triggered: ${jobName}`)
      } else {
        toast.error(`Failed to trigger: ${jobName}`)
      }
    } catch {
      toast.error('Could not reach cron service')
    } finally {
      setRunningJob(null)
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

        {/* ── Scheduled Jobs ──────────────────── */}
        <section className="mb-8">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">
            Notification Pipelines
          </h2>
          {cronLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 rounded-2xl bg-surface-container border border-outline-variant/10 animate-pulse" />
              ))}
            </div>
          ) : cronJobs.length === 0 ? (
            <div className="px-5 py-6 rounded-2xl bg-surface-container border border-outline-variant/10 text-center">
              <span className="material-symbols-outlined text-on-surface-variant/40 text-3xl mb-2">schedule</span>
              <p className="text-sm text-on-surface-variant">No scheduled jobs configured</p>
              <p className="text-[10px] text-on-surface-variant/60 mt-1">Configure via OpenClaw CLI</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cronJobs.map((job) => (
                <div
                  key={job.id}
                  className="px-4 py-3 rounded-2xl bg-surface-container border border-outline-variant/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${job.enabled ? 'bg-primary' : 'bg-on-surface-variant/30'}`} />
                        <p className="text-sm font-bold text-on-surface truncate">{job.name}</p>
                      </div>
                      <p className="text-[10px] text-on-surface-variant/60 mt-0.5 ml-4">{job.schedule}</p>
                      <div className="flex items-center gap-3 mt-1.5 ml-4">
                        <span className="text-[9px] text-on-surface-variant/50">
                          Next: {job.nextRun}
                        </span>
                        <span className={`text-[9px] ${getStatusColor(job.lastStatus, job.consecutiveErrors)}`}>
                          Last: {job.lastRun} · {job.lastStatus}
                          {job.consecutiveErrors > 0 && ` (${job.consecutiveErrors} err)`}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRunNow(job.id, job.name)}
                      disabled={runningJob === job.id}
                      className="flex-shrink-0 p-2 rounded-full hover:bg-primary/10 text-on-surface-variant/50 hover:text-primary transition-colors disabled:opacity-50"
                      title="Run now"
                    >
                      {runningJob === job.id ? (
                        <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: '"FILL" 1' }}>play_arrow</span>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
