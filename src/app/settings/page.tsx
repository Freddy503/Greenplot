'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarConnectCard } from '@/components/settings/calendar-connect-card'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { toast } from 'sonner'
import {
  Bell, Sun, Mail, Download, LogOut, ChevronRight, Copy, Plus, X,
  Plug, Calendar, Trash2, MessageSquarePlus, Send, Loader2, Leaf,
  Moon, BookOpen, BarChart2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import Hero from '@/components/layout/hero'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import Toggle from '@/components/ui/v2/toggle'
import SettingsRow from '@/components/ui/v2/settings-row'
import SettingsGroup from '@/components/ui/v2/settings-group'
import SectionHeader from '@/components/ui/v2/section-header'

const BACKEND = '/api'

const PIPELINE_JOBS = [
  { id: 'morning_spark',        label: 'Morning Spark',              Icon: Sun,       description: 'Weather + deep pattern from your interests (08:30 CET)',   configurable: true },
  { id: 'daily_briefing',       label: 'Daily Briefing',             Icon: Mail,      description: 'Enterprise AI news + academic papers (09:30 CET)',         configurable: true },
  { id: 'afternoon_reflection', label: 'Evening Reflection',         Icon: Moon,      description: 'Contrarian view + actionable move for tomorrow (16:00 CET)', configurable: true },
  { id: 'academic_digest',      label: 'Academic & Research Digest', Icon: BookOpen,  description: 'ArXiv papers matched to your interests (07:00 CET)',        configurable: true },
  { id: 'weekly_digest',        label: 'Weekly Garden Digest',       Icon: BarChart2, description: 'Sunday overview of your growing knowledge garden (10:00 CET)', configurable: false },
]

interface JobConfig {
  enabled: boolean
  hour: number
  minute: number
  label: string
}

function pad(n: number) { return String(n).padStart(2, '0') }


// ── GitHub integration (docs/specs/github-repo-sync.md) ─────────
function GitHubCard() {
  const [conn, setConn] = useState<{ connected: boolean; repo_full_name?: string; webhook_url?: string; webhook_secret?: string } | null>(null)
  const [repo, setRepo] = useState('')
  const [pat, setPat] = useState('')
  const [busy, setBusy] = useState(false)

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('greenplot_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  useEffect(() => {
    fetch('/api/github/connection', { headers: authHeaders() })
      .then(r => r.json()).then(setConn).catch(() => setConn({ connected: false }))
  }, [])

  const connect = async () => {
    if (!repo.trim() || !pat.trim() || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/github/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ repo_full_name: repo.trim(), token: pat.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Connected ${data.repo_full_name} — PRDs are now repo-grounded`)
        setConn({ connected: true, ...data })
        setPat('')
      } else {
        toast.error(data.detail || data.error || 'Connection failed')
      }
    } catch { toast.error('Connection failed') } finally { setBusy(false) }
  }

  const disconnect = async () => {
    await fetch('/api/github/connection', { method: 'DELETE', headers: authHeaders() }).catch(() => {})
    setConn({ connected: false })
    toast.success('GitHub disconnected')
  }

  return (
    <>
      <SectionHeader>GitHub</SectionHeader>
      <div className="v2-card" style={{ borderRadius: 18, padding: '14px 16px', marginBottom: 18 }}>
        {conn?.connected ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: 'var(--green)', flexShrink: 0 }} />
              <span className="ui" style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{conn.repo_full_name}</span>
              <button onClick={disconnect} className="tap ui" style={{ background: 'none', border: '1px solid var(--border-2)', borderRadius: 9999, padding: '6px 12px', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}>Disconnect</button>
            </div>
            <p className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
              PRDs are grounded in this repo and "Ship to GitHub" opens PRs. For merge→Built automation, add a webhook
              (repo Settings → Webhooks): URL <code style={{ fontSize: 10.5, background: 'var(--surface-sunk)', padding: '1px 5px', borderRadius: 5 }}>{conn.webhook_url}</code>,
              content type JSON, secret{' '}
              <button onClick={() => { navigator.clipboard.writeText(conn.webhook_secret || ''); toast.success('Secret copied') }} className="tap ui" style={{ background: 'var(--surface-sunk)', border: 'none', borderRadius: 5, padding: '1px 7px', fontSize: 10.5, fontWeight: 600, color: 'var(--green-700)', cursor: 'pointer' }}>copy</button>,
              events: Pull requests.
            </p>
          </>
        ) : (
          <>
            <p className="body-text" style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 10, lineHeight: 1.6 }}>
              Connect a repo to ground PRDs in your actual codebase and ship specs as pull requests.
              Use a fine-grained PAT scoped to one repo (Contents, Issues, Pull requests: read/write).
            </p>
            <input value={repo} onChange={e => setRepo(e.target.value)} placeholder="owner/repo"
              style={{ width: '100%', border: '1px solid var(--border-2)', borderRadius: 12, padding: '9px 12px', fontFamily: 'var(--body)', fontSize: 12.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', marginBottom: 8 }} />
            <input value={pat} onChange={e => setPat(e.target.value)} placeholder="github_pat_…" type="password"
              style={{ width: '100%', border: '1px solid var(--border-2)', borderRadius: 12, padding: '9px 12px', fontFamily: 'var(--body)', fontSize: 12.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none', marginBottom: 10 }} />
            <button onClick={connect} disabled={busy || !repo.trim() || !pat.trim()} className="tap ui"
              style={{ width: '100%', background: 'var(--green)', color: '#06281a', border: 'none', borderRadius: 9999, padding: '10px 0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: busy || !repo.trim() || !pat.trim() ? 0.5 : 1 }}>
              {busy ? 'Validating…' : 'Connect repo'}
            </button>
          </>
        )}
      </div>
    </>
  )
}

// ── MCP API keys (docs/specs/mcp-server-v2.md) ─────────
interface ApiKeyRow { id: string; name: string; prefix: string; created_at: string | null; last_used_at: string | null }

function McpKeysCard() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [keyName, setKeyName] = useState('')
  const [minting, setMinting] = useState(false)
  const [mintedKey, setMintedKey] = useState('')

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('greenplot_token')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  useEffect(() => {
    fetch('/api/api-keys', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { keys: [] })
      .then(d => setKeys(d.keys || []))
      .catch(() => {})
  }, [])

  const mint = async () => {
    if (minting) return
    setMinting(true)
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: keyName.trim() || 'MCP key' }),
      })
      const data = await res.json()
      if (res.ok) {
        setMintedKey(data.key)
        setKeys(prev => [{ id: data.id, name: data.name, prefix: data.prefix, created_at: data.created_at, last_used_at: null }, ...prev])
        setKeyName('')
      } else {
        toast.error(data.detail || data.error || 'Could not create key')
      }
    } catch { toast.error('Could not create key') } finally { setMinting(false) }
  }

  const revoke = async (id: string) => {
    setKeys(prev => prev.filter(k => k.id !== id))
    if (mintedKey) setMintedKey('')
    await fetch(`/api/api-keys/${id}`, { method: 'DELETE', headers: authHeaders() }).catch(() => {})
    toast.success('Key revoked')
  }

  const mcpConfig = `{
  "mcpServers": {
    "greenplot": {
      "type": "http",
      "url": "https://api.greenplot.ink/mcp",
      "headers": { "Authorization": "Bearer ${mintedKey || 'gp_live_…'}" }
    }
  }
}`

  return (
    <>
      <SectionHeader>Coding agents · MCP</SectionHeader>
      <div className="v2-card" style={{ borderRadius: 18, padding: '14px 16px', marginBottom: 18 }}>
        <p className="body-text" style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 10, lineHeight: 1.6 }}>
          Connect Claude Code, Claude Desktop or Cursor to your garden. Mint a key, then add the
          server config below — agents can search seeds, read PRDs and report build progress.
        </p>

        {keys.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {keys.map(k => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: 'var(--surface-sunk)' }}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--green)', flexShrink: 0 }} />
                <span className="ui" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.name}</span>
                <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)', flexShrink: 0 }}>
                  {k.prefix}… · {k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleDateString()}` : 'never used'}
                </span>
                <button onClick={() => revoke(k.id)} className="tap ui" style={{ background: 'none', border: '1px solid var(--border-2)', borderRadius: 9999, padding: '4px 10px', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer', flexShrink: 0 }}>Revoke</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: mintedKey ? 10 : 0 }}>
          <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Key name — e.g. Claude Code"
            onKeyDown={e => e.key === 'Enter' && mint()}
            style={{ flex: 1, minWidth: 0, border: '1px solid var(--border-2)', borderRadius: 12, padding: '9px 12px', fontFamily: 'var(--body)', fontSize: 12.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }} />
          <button onClick={mint} disabled={minting} className="tap ui"
            style={{ background: 'var(--green)', color: '#06281a', border: 'none', borderRadius: 9999, padding: '0 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: minting ? 0.5 : 1, flexShrink: 0 }}>
            {minting ? '…' : 'Create key'}
          </button>
        </div>

        {mintedKey && (
          <div style={{ borderRadius: 12, background: 'var(--green-tint)', padding: '10px 12px' }}>
            <p className="body-text" style={{ fontSize: 11.5, color: 'var(--green-700)', fontWeight: 600, marginBottom: 6 }}>
              Copy it now — this key is shown only once.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <code style={{ flex: 1, minWidth: 0, fontSize: 10.5, background: 'var(--surface)', padding: '6px 8px', borderRadius: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>{mintedKey}</code>
              <button onClick={() => { navigator.clipboard.writeText(mintedKey); toast.success('Key copied') }} className="tap ui"
                style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 9999, padding: '5px 12px', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer', flexShrink: 0 }}>Copy</button>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(mcpConfig); toast.success('Config copied — paste into .mcp.json or claude_desktop_config.json') }} className="tap ui"
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '8px 0', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}>
              Copy MCP config for Claude Code / Desktop / Cursor
            </button>
          </div>
        )}
      </div>
    </>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [city, setCity] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [scheduleConfig, setScheduleConfig] = useState<Record<string, JobConfig>>({})
  const [editingNickname, setEditingNickname] = useState(false)
  const [editNickname, setEditNickname] = useState('')
  const [editingCity, setEditingCity] = useState(false)
  const [editCity, setEditCity] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [interestInput, setInterestInput] = useState('')
  const [savingInterests, setSavingInterests] = useState(false)
  const [featureRequest, setFeatureRequest] = useState('')
  const [sendingFeatureRequest, setSendingFeatureRequest] = useState(false)
  const [showDevTools, setShowDevTools] = useState(false)
  const [devPassword, setDevPassword] = useState('')
  const [devEmail, setDevEmail] = useState('')
  const [devUnlocking, setDevUnlocking] = useState(false)
  const [devError, setDevError] = useState('')
  const [sendingTestEmail, setSendingTestEmail] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''

  useEffect(() => {
    setNickname(localStorage.getItem('greenplot_nickname') || '')
    try {
      const profile = JSON.parse(localStorage.getItem('greenplot_profile') || '{}')
      if (profile.city) setCity(profile.city)
      if (profile.interests) setInterests(profile.interests)
    } catch {}

    if (token) {
      fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return
          if (data.city) { setCity(data.city); const p = JSON.parse(localStorage.getItem('greenplot_profile') || '{}'); p.city = data.city; localStorage.setItem('greenplot_profile', JSON.stringify(p)) }
          if (data.nickname) { setNickname(data.nickname); localStorage.setItem('greenplot_nickname', data.nickname) }
          if (data.email) setUserEmail(data.email)
          if (data.interests) setInterests(data.interests)
        })
        .catch(() => {})
    }

    fetch('/api/schedule', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.jobs) setScheduleConfig(data.jobs) })
      .catch(() => {})
  }, [])

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  })

  const handleSaveNickname = async () => {
    if (!editNickname.trim()) return
    setNickname(editNickname.trim())
    localStorage.setItem('greenplot_nickname', editNickname.trim())
    // best-effort backend patch
    fetch(`${BACKEND}/profile`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ nickname: editNickname.trim() }) }).catch(() => {})
    setEditingNickname(false)
    toast.success('Nickname updated')
  }

  const handleSaveCity = async () => {
    if (!editCity.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${BACKEND}/profile`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ city: editCity.trim() }) })
      if (!res.ok) throw new Error('Failed')
      setCity(editCity.trim())
      const p = JSON.parse(localStorage.getItem('greenplot_profile') || '{}'); p.city = editCity.trim(); localStorage.setItem('greenplot_profile', JSON.stringify(p))
      setEditingCity(false)
      toast.success('Location updated')
    } catch { toast.error('Failed to save location') } finally { setSaving(false) }
  }

  const handleAddInterest = () => {
    const val = interestInput.trim()
    if (!val || interests.includes(val)) { setInterestInput(''); return }
    const next = [...interests, val]; setInterests(next); setInterestInput(''); handleSaveInterestList(next)
  }

  const handleRemoveInterest = (val: string) => {
    const next = interests.filter(i => i !== val); setInterests(next); handleSaveInterestList(next)
  }

  const handleSaveInterestList = async (list: string[]) => {
    setSavingInterests(true)
    try {
      await fetch(`${BACKEND}/profile`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ interests: list }) })
      const p = JSON.parse(localStorage.getItem('greenplot_profile') || '{}'); p.interests = list; localStorage.setItem('greenplot_profile', JSON.stringify(p))
    } catch {} finally { setSavingInterests(false) }
  }

  const { status: pushStatus, requestPermission, unsubscribe } = usePushNotifications()
  const notificationsEnabled = pushStatus === 'subscribed' || pushStatus === 'granted'

  const handleToggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const ok = await requestPermission()
      if (ok) toast.success('Notifications enabled')
      else toast.error('Could not enable — check browser permissions')
    } else {
      await unsubscribe()
      toast.success('Notifications disabled')
    }
  }

  const handleScheduleToggle = async (jobId: string, enabled: boolean) => {
    const updated = { ...scheduleConfig, [jobId]: { ...scheduleConfig[jobId], enabled } }
    setScheduleConfig(updated)
    try {
      await fetch('/api/schedule', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ [jobId]: { enabled } }) })
      toast.success(enabled ? 'Pipeline enabled' : 'Pipeline disabled')
    } catch { toast.error('Failed to update') }
  }

  const handleScheduleHour = async (jobId: string, hour: number) => {
    const updated = { ...scheduleConfig, [jobId]: { ...scheduleConfig[jobId], hour } }
    setScheduleConfig(updated)
    try {
      await fetch('/api/schedule', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ [jobId]: { hour } }) })
      toast.success(`Time updated to ${String(hour).padStart(2,'0')}:00 CET`)
    } catch { toast.error('Failed to update time') }
  }

  const handleLogout = () => {
    localStorage.removeItem('greenplot_token'); localStorage.removeItem('greenplot_tenant')
    localStorage.removeItem('greenplot_nickname'); localStorage.removeItem('greenplot_chat_messages')
    localStorage.removeItem('greenplot_profile')
    toast.success('Logged out'); router.push('/onboarding')
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete my account') return
    setDeleting(true)
    try {
      const res = await fetch(`${BACKEND}/account`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error('Failed')
      localStorage.clear(); toast.success('Account deleted'); router.push('/onboarding')
    } catch { toast.error('Failed to delete account. Try again.') } finally { setDeleting(false); setShowDeleteDialog(false) }
  }

  const handleExport = async () => {
    const res = await fetch('/api/me/export', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'greenplot-export.json'; a.click(); URL.revokeObjectURL(url)
    }
  }

  const handleUnlockDevTools = async () => {
    const emailToUse = userEmail || devEmail
    if (!devPassword || !emailToUse || devUnlocking) return
    setDevUnlocking(true); setDevError('')
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailToUse, password: devPassword }) })
      if (res.ok) { setShowDevTools(true); setDevPassword(''); setDevEmail('') } else { setDevError('Incorrect password') }
    } catch { setDevError('Could not verify — check connection') } finally { setDevUnlocking(false) }
  }

  const handleSendFeatureRequest = async () => {
    if (!featureRequest.trim()) return
    setSendingFeatureRequest(true)
    try {
      const res = await fetch('/api/feedback/feature-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: featureRequest.trim() }) })
      if (res.ok) { toast.success('Feature request sent!'); setFeatureRequest('') } else { toast.error('Could not send — try again') }
    } catch { toast.error('Could not reach backend') } finally { setSendingFeatureRequest(false) }
  }

  const handleSendTestEmail = async () => {
    setSendingTestEmail(true)
    try {
      const res = await fetch('/api/email/test', { method: 'POST', headers: authHeaders() })
      const data = await res.json()
      if (res.ok) toast.success(data.message || 'Test email sent!')
      else toast.error(data.detail || data.error || 'Failed to send test email')
    } catch { toast.error('Could not reach backend') } finally { setSendingTestEmail(false) }
  }

  const [deduping, setDeduping] = useState(false)

  const handleDeduplicate = async () => {
    if (deduping) return
    setDeduping(true)
    const id = toast.loading('Scanning for duplicate seeds…')
    try {
      const res = await fetch('/api/seeds/deduplicate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) {
        if (data.deduped === 0) {
          toast.success('No duplicates found — Garden is clean!', { id })
        } else {
          toast.success(`Removed ${data.deduped} duplicate seed${data.deduped === 1 ? '' : 's'}`, { id })
        }
      } else {
        toast.error(data.error || 'Dedup failed', { id })
      }
    } catch {
      toast.error('Could not reach backend', { id })
    } finally {
      setDeduping(false)
    }
  }

  const initial = (nickname || userEmail || 'G')[0].toUpperCase()

  return (
    <div style={{ background: 'var(--bg)', height: '100dvh', overflowY: 'auto', overflowX: 'hidden' }}>
      <Header />

      <Hero
        eyebrow="GREENPLOT · LIVING LABORATORY"
        title="Settings"
        subtitle="Tune Greenplot to the way you think."
        showBell={false}
      />

      <div className="desk-narrow" style={{ position: 'relative', zIndex: 3, marginTop: -22, padding: '0 18px', paddingBottom: 120 }}>

        {/* Profile card */}
        <div className="glass" style={{ borderRadius: 22, padding: '18px 18px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 99, background: 'linear-gradient(135deg, var(--green), var(--green-700))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="ui" style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{initial}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingNickname ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input value={editNickname} onChange={e => setEditNickname(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveNickname()}
                    autoFocus placeholder="Nickname"
                    style={{ flex: 1, background: 'var(--surface-sunk)', border: 'none', borderRadius: 9999, padding: '6px 14px', fontFamily: 'var(--ui)', fontSize: 14, color: 'var(--ink)', outline: 'none' }} />
                  <button onClick={handleSaveNickname} className="tap" style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 9999, padding: '6px 12px', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingNickname(false)} className="tap" style={{ background: 'var(--surface-sunk)', color: 'var(--ink-2)', border: 'none', borderRadius: 9999, padding: '6px 12px', fontFamily: 'var(--ui)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <>
                  <div className="serif" style={{ fontSize: 22, color: 'var(--ink)', lineHeight: 1.1 }}>{nickname || 'Your name'}</div>
                  <div className="body-text" style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{userEmail || 'No email'}</div>
                </>
              )}
            </div>
            {!editingNickname && (
              <button onClick={() => { setEditNickname(nickname); setEditingNickname(true) }} className="tap" style={{ background: 'var(--green-tint)', color: 'var(--green-700)', border: 'none', borderRadius: 9999, padding: '7px 13px', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
            )}
          </div>

          {/* Location row */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
            {editingCity ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={editCity} onChange={e => setEditCity(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveCity()}
                  autoFocus placeholder="e.g. Munich, Berlin, NYC"
                  style={{ flex: 1, background: 'var(--surface-sunk)', border: 'none', borderRadius: 9999, padding: '6px 14px', fontFamily: 'var(--ui)', fontSize: 14, color: 'var(--ink)', outline: 'none' }} />
                <button onClick={handleSaveCity} disabled={saving} className="tap" style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 9999, padding: '6px 12px', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                <button onClick={() => setEditingCity(false)} className="tap" style={{ background: 'var(--surface-sunk)', color: 'var(--ink-2)', border: 'none', borderRadius: 9999, padding: '6px 12px', fontFamily: 'var(--ui)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="ui" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Location</div>
                  <div className="body-text" style={{ fontSize: 13.5, color: 'var(--ink)', marginTop: 2 }}>{city || 'Not set'}</div>
                  <div className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1 }}>Used for weather in daily briefing</div>
                </div>
                <button onClick={() => { setEditCity(city); setEditingCity(true) }} className="tap" style={{ background: 'none', border: 'none', color: 'var(--green-700)', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
              </div>
            )}
          </div>
        </div>

        {/* Interests */}
        <SettingsGroup label="Interests">
          <div style={{ padding: '14px 16px' }}>
            <div className="body-text" style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>Topics that shape your digests and research papers.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {interests.map(i => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--green-tint)', color: 'var(--green-700)', borderRadius: 9999, padding: '5px 10px 5px 12px', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 600 }}>
                  {i}
                  <button onClick={() => handleRemoveInterest(i)} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 0 }}>
                    <X size={12} color="var(--green-700)" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
              {interests.length === 0 && <span className="body-text" style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>No interests yet</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={interestInput} onChange={e => setInterestInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddInterest() } }}
                placeholder="Add interest (e.g. Medicine)"
                style={{ flex: 1, background: 'var(--surface-sunk)', border: 'none', borderRadius: 9999, padding: '8px 14px', fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink)', outline: 'none' }} />
              <button onClick={handleAddInterest} disabled={!interestInput.trim() || savingInterests} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 9999, padding: '8px 14px', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !interestInput.trim() ? 0.5 : 1 }}>
                <Plus size={14} color="#fff" strokeWidth={2.5} /> Add
              </button>
            </div>
          </div>
        </SettingsGroup>

        {/* Notifications */}
        <SettingsGroup label="Notifications &amp; digests">
          <SettingsRow
            Icon={Bell}
            title="Push Notifications"
            sub="Daily briefings and reminders"
            right={<Toggle on={notificationsEnabled} onChange={handleToggleNotifications} />}
          />
          {PIPELINE_JOBS.map((job, idx) => {
            const cfg = scheduleConfig[job.id]
            const enabled = cfg?.enabled ?? true
            const hour = cfg?.hour ?? undefined
            return (
              <SettingsRow
                key={job.id}
                Icon={job.Icon}
                title={job.label}
                sub={job.description}
                right={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {job.configurable && (
                      <select
                        value={hour ?? ''}
                        onChange={e => handleScheduleHour(job.id, Number(e.target.value))}
                        style={{ background: 'var(--surface-sunk)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '4px 8px', fontFamily: 'var(--ui)', fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }}
                        title="Hour (CET)"
                      >
                        <option value="" disabled>Time</option>
                        {Array.from({ length: 18 }, (_, i) => i + 5).map(h => (
                          <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                        ))}
                      </select>
                    )}
                    <Toggle on={enabled} onChange={v => handleScheduleToggle(job.id, v)} />
                  </div>
                }
                last={idx === PIPELINE_JOBS.length - 1}
              />
            )
          })}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--hairline)' }}>
            <button onClick={handleSendTestEmail} disabled={sendingTestEmail} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 9999, padding: '8px 16px', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
              {sendingTestEmail ? <Loader2 size={13} color="var(--ink-2)" className="animate-spin" strokeWidth={2} /> : <Send size={13} color="var(--ink-2)" strokeWidth={2} />}
              {sendingTestEmail ? 'Sending…' : 'Send Test Email'}
            </button>
          </div>
        </SettingsGroup>

        {/* Connect */}
        <SettingsGroup label="Connect">
          <div style={{ padding: '14px 16px' }}>
            <CalendarConnectCard />
          </div>
          <div style={{ borderTop: '1px solid var(--hairline)' }}>
            {!showDevTools ? (
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Plug size={17} color="var(--green-700)" strokeWidth={1.75} />
                  </span>
                  <div>
                    <div className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>MCP Server</div>
                    <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Unlock with your password to configure</div>
                  </div>
                </div>
                {!userEmail && (
                  <input type="email" value={devEmail} onChange={e => { setDevEmail(e.target.value); setDevError('') }} placeholder="Your email"
                    style={{ width: '100%', background: 'var(--surface-sunk)', border: 'none', borderRadius: 10, padding: '8px 12px', fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink)', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="password" value={devPassword} onChange={e => { setDevPassword(e.target.value); setDevError('') }} onKeyDown={e => e.key === 'Enter' && handleUnlockDevTools()} placeholder="Password"
                    style={{ flex: 1, background: 'var(--surface-sunk)', border: 'none', borderRadius: 10, padding: '8px 12px', fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink)', outline: 'none' }} />
                  <button onClick={handleUnlockDevTools} disabled={devUnlocking || !devPassword || (!userEmail && !devEmail)} className="tap"
                    style={{ background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (!devPassword || (!userEmail && !devEmail)) ? 0.5 : 1 }}>
                    {devUnlocking ? '…' : 'Unlock'}
                  </button>
                </div>
                {devError && <p className="body-text" style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 6 }}>{devError}</p>}
              </div>
            ) : (
              <div style={{ padding: '14px 16px' }}>
                <div className="ui" style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>MCP Server — Claude Code / Cursor</div>
                <div style={{ position: 'relative' }}>
                  <pre style={{ fontSize: 10, color: 'var(--ink)', background: 'var(--surface-sunk)', borderRadius: 12, padding: '12px', overflow: 'auto', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>{`{
  "mcpServers": {
    "greenplot": {
      "command": "python3",
      "args": ["~/Seedify/openclaw-api/mcp_server.py"],
      "env": {
        "GREENPLOT_API_URL": "https://api.greenplot.ink",
        "GREENPLOT_TOKEN": "${token || '<paste-your-token>'}"
      }
    }
  }
}`}</pre>
                  <button onClick={() => { navigator.clipboard.writeText(`{"mcpServers":{"greenplot":{"command":"python3","args":["~/Seedify/openclaw-api/mcp_server.py"],"env":{"GREENPLOT_API_URL":"https://api.greenplot.ink","GREENPLOT_TOKEN":"${token}"}}}}`); toast.success('Config copied') }} className="tap"
                    style={{ position: 'absolute', top: 8, right: 8, background: 'var(--surface)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer' }}>
                    <Copy size={14} color="var(--ink-2)" strokeWidth={1.75} />
                  </button>
                </div>
                <button onClick={() => { setShowDevTools(false); setDevPassword('') }} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--ink-3)', fontFamily: 'var(--ui)', fontSize: 11.5, cursor: 'pointer' }}>Lock developer tools</button>
              </div>
            )}
          </div>
        </SettingsGroup>

        {/* Feature Request */}
        <SectionHeader>Got an idea?</SectionHeader>
        <div className="v2-card" style={{ borderRadius: 18, padding: '14px 16px', marginBottom: 18 }}>
          <textarea value={featureRequest} onChange={e => setFeatureRequest(e.target.value)} placeholder="I'd love to see…" rows={3}
            style={{ width: '100%', background: 'var(--surface-sunk)', border: 'none', borderRadius: 12, padding: '10px 14px', fontFamily: 'var(--body)', fontSize: 14, lineHeight: 1.6, color: 'var(--ink)', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
          <button onClick={handleSendFeatureRequest} disabled={sendingFeatureRequest || !featureRequest.trim()} className="tap"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: !featureRequest.trim() ? 'var(--surface-sunk)' : 'var(--green)', color: !featureRequest.trim() ? 'var(--ink-3)' : '#fff', border: 'none', borderRadius: 9999, padding: '9px 16px', fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
            {sendingFeatureRequest ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
            {sendingFeatureRequest ? 'Sending…' : 'Send Request'}
          </button>
        </div>

        <GitHubCard />

        <McpKeysCard />

        {/* Support */}
        <SectionHeader>Support</SectionHeader>
        <a
          href="https://buymeacoffee.com/frederickk1"
          target="_blank"
          rel="noopener noreferrer"
          className="v2-card tap"
          style={{ display: 'flex', alignItems: 'center', gap: 13, borderRadius: 18, padding: '14px 16px', marginBottom: 18, textDecoration: 'none', background: 'rgba(255,221,0,0.08)', border: '1px solid rgba(255,221,0,0.25)' }}
        >
          <span style={{ fontSize: 24, flexShrink: 0 }}>☕</span>
          <span style={{ flex: 1 }}>
            <span className="ui" style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Buy Me a Coffee</span>
            <span className="body-text" style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2 }}>Enjoying Greenplot? Support the build.</span>
          </span>
          <ChevronRight size={16} color="var(--ink-3)" strokeWidth={1.75} />
        </a>

        {/* Account */}
        <SettingsGroup label="Account">
          <SettingsRow Icon={Download} title="Export My Data" sub="Download all seeds and sessions as JSON" right={<ChevronRight size={16} color="var(--ink-3)" strokeWidth={1.75} />}
            last={false} onClick={handleExport} />
          <SettingsRow
            Icon={deduping ? Loader2 : Leaf}
            title="Clean up duplicates"
            sub="Remove duplicate seeds — keeps the richest version"
            right={deduping ? <Loader2 size={16} color="var(--ink-3)" strokeWidth={1.75} className="animate-spin" /> : <ChevronRight size={16} color="var(--ink-3)" strokeWidth={1.75} />}
            last={false}
            onClick={handleDeduplicate}
          />
          <SettingsRow Icon={LogOut} title="Log Out" sub="Sign out of your account" right={<ChevronRight size={16} color="var(--ink-3)" strokeWidth={1.75} />}
            last={false} onClick={handleLogout} />
          <SettingsRow Icon={Trash2} title="Delete Account" sub="Permanently delete all data" right={<ChevronRight size={16} color="var(--red)" strokeWidth={1.75} />}
            last titleStyle={{ color: 'var(--red)' }} onClick={() => setShowDeleteDialog(true)} />
        </SettingsGroup>

        <p className="body-text" style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 24 }}>
          Greenplot v2 · <a href="/privacy" style={{ color: 'var(--ink-3)' }}>Privacy Policy</a>
        </p>
      </div>

      <BottomNav />

      {/* Delete dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="rounded-3xl max-w-sm mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <DialogHeader>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <div style={{ width: 56, height: 56, borderRadius: 99, background: 'rgba(212,80,62,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={24} color="var(--red)" strokeWidth={1.75} />
              </div>
            </div>
            <DialogTitle style={{ textAlign: 'center', fontFamily: 'var(--ui)', fontWeight: 700 }}>Delete Account?</DialogTitle>
            <DialogDescription style={{ textAlign: 'center', fontFamily: 'var(--body)', fontSize: 13 }}>
              This will permanently delete your account, all seeds, conversations, and data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div style={{ padding: '12px 0' }}>
            <p className="body-text" style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 6 }}>Type <strong style={{ color: 'var(--red)' }}>delete my account</strong> to confirm:</p>
            <input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="delete my account"
              style={{ width: '100%', background: 'var(--surface-sunk)', border: '1px solid rgba(212,80,62,0.2)', borderRadius: 9999, padding: '8px 16px', fontFamily: 'var(--ui)', fontSize: 13, textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <DialogFooter style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={handleDeleteAccount} disabled={deleteConfirmText.toLowerCase() !== 'delete my account' || deleting}
              style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 9999, padding: '12px', fontFamily: 'var(--ui)', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: deleteConfirmText.toLowerCase() !== 'delete my account' ? 0.4 : 1, width: '100%' }}>
              {deleting ? 'Deleting…' : 'Delete My Account'}
            </button>
            <button onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText('') }}
              style={{ background: 'none', border: 'none', color: 'var(--ink-2)', fontFamily: 'var(--ui)', fontSize: 14, cursor: 'pointer', padding: 12 }}>Cancel</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
