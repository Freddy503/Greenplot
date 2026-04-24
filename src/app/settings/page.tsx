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

const PIPELINE_JOBS = [
  { id: 'morning_spark',     label: 'Morning Idea Spark',  icon: 'light_mode',    emoji: '☀️', description: 'Weather + one deep pattern from your research interests' },
  { id: 'daily_briefing',    label: 'Daily Briefing',       icon: 'newspaper',     emoji: '📰', description: 'Enterprise AI news + academic papers for your focus areas' },
  { id: 'reflection',        label: 'Evening Reflection',   icon: 'psychology',    emoji: '🧠', description: 'Contrarian angle on today + one actionable move' },
  { id: 'weekly_eval',       label: 'Weekly Content Eval',  icon: 'assessment',    emoji: '📊', description: 'What stuck this week? Patterns + creative constraint' },
  { id: 'biweekly_challenge',label: 'Biweekly Challenge',   icon: 'emoji_events',  emoji: '🎯', description: 'Cross-domain experiment: apply a concept from one field to another' },
]

interface JobConfig {
  enabled: boolean
  hour: number
  minute: number
  label: string
}

function pad(n: number) { return String(n).padStart(2, '0') }

function TimeEditor({ hour, minute, onChange }: { hour: number; minute: number; onChange: (h: number, m: number) => void }) {
  const [val, setVal] = useState(`${pad(hour)}:${pad(minute)}`)
  // Sync when parent schedule config loads asynchronously
  useEffect(() => {
    setVal(`${pad(hour)}:${pad(minute)}`)
  }, [hour, minute])
  return (
    <input
      type="time"
      value={val}
      onChange={e => {
        setVal(e.target.value)
        const [h, m] = e.target.value.split(':').map(Number)
        if (!isNaN(h) && !isNaN(m)) onChange(h, m)
      }}
      className="text-xs font-mono bg-surface-container-high border border-outline-variant/20 rounded-lg px-2 py-1 text-on-surface"
    />
  )
}

export default function SettingsPage() {
 const router = useRouter()
 const [nickname, setNickname] = useState('')
 const [city, setCity] = useState('')
 const [saving, setSaving] = useState(false)
 const [showDeleteDialog, setShowDeleteDialog] = useState(false)
 const [deleting, setDeleting] = useState(false)
 const [deleteConfirmText, setDeleteConfirmText] = useState('')
 const [scheduleConfig, setScheduleConfig] = useState<Record<string, JobConfig>>({})
 const [savingSchedule, setSavingSchedule] = useState<string | null>(null)

 const [editingCity, setEditingCity] = useState(false)
 const [editCity, setEditCity] = useState('')
 const [editingNickname, setEditingNickname] = useState(false)
 const [editNickname, setEditNickname] = useState('')
 const [userEmail, setUserEmail] = useState('')
 const [sendingTestEmail, setSendingTestEmail] = useState(false)
 const [triggeringWikiCompile, setTriggeringWikiCompile] = useState(false)
 const [featureRequest, setFeatureRequest] = useState('')
 const [sendingFeatureRequest, setSendingFeatureRequest] = useState(false)
 const [showDevTools, setShowDevTools] = useState(false)
 const [devPassword, setDevPassword] = useState('')
 const [devEmail, setDevEmail] = useState('')
 const [devUnlocking, setDevUnlocking] = useState(false)
 const [devError, setDevError] = useState('')

 const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''

 useEffect(() => {
   // Seed from localStorage immediately so UI isn't blank
   setNickname(localStorage.getItem('greenplot_nickname') || '')
   try {
     const profile = JSON.parse(localStorage.getItem('greenplot_profile') || '{}')
     if (profile.city) setCity(profile.city)
   } catch {}

   // Fetch authoritative profile from backend (overwrites stale localStorage)
   if (token) {
     fetch('/api/profile', {
       headers: { Authorization: `Bearer ${token}` },
     })
       .then(r => r.ok ? r.json() : null)
       .then(data => {
         if (!data) return
         if (data.city) {
           setCity(data.city)
           const profile = JSON.parse(localStorage.getItem('greenplot_profile') || '{}')
           profile.city = data.city
           localStorage.setItem('greenplot_profile', JSON.stringify(profile))
         }
         if (data.nickname) {
           setNickname(data.nickname)
           localStorage.setItem('greenplot_nickname', data.nickname)
         }
         if (data.email) setUserEmail(data.email)
       })
       .catch(() => {})
   }

   // Fetch schedule config
   fetch('/api/schedule', {
     headers: token ? { Authorization: `Bearer ${token}` } : {},
   })
     .then(r => r.ok ? r.json() : null)
     .then(data => { if (data?.jobs) setScheduleConfig(data.jobs) })
     .catch(() => {})
 }, [])

 const authHeaders = () => ({
   'Content-Type': 'application/json',
   ...(token ? { Authorization: `Bearer ${token}` } : {}),
 })

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

 const handleSaveNickname = async () => {
   if (!editNickname.trim()) return
   setNickname(editNickname.trim())
   localStorage.setItem('greenplot_nickname', editNickname.trim())
   setEditingNickname(false)
   toast.success('Nickname updated')
 }

 const { status: pushStatus, requestPermission, unsubscribe } = usePushNotifications()
 const notificationsEnabled = pushStatus === 'subscribed' || pushStatus === 'granted'

 const handleToggleNotifications = async (enabled: boolean) => {
   if (enabled) {
     const ok = await requestPermission()
     if (ok) toast.success('Notifications enabled')
     else toast.error('Could not enable notifications. Check browser permissions.')
   } else {
     await unsubscribe()
     toast.success('Notifications disabled')
   }
 }

 const handleScheduleChange = async (jobId: string, updates: Partial<JobConfig>) => {
   const updated = { ...scheduleConfig, [jobId]: { ...scheduleConfig[jobId], ...updates } }
   setScheduleConfig(updated)
   setSavingSchedule(jobId)
   try {
     const res = await fetch('/api/schedule', {
       method: 'PATCH',
       headers: authHeaders(),
       body: JSON.stringify({ [jobId]: updates }),
     })
     if (!res.ok) throw new Error('Failed')
     toast.success('Schedule updated')
   } catch {
     toast.error('Failed to save schedule')
   } finally {
     setSavingSchedule(null)
   }
 }

 const handleSendTestEmail = async () => {
   setSendingTestEmail(true)
   try {
     const res = await fetch('/api/email/test', {
       method: 'POST',
       headers: authHeaders(),
     })
     const data = await res.json()
     if (res.ok) toast.success(data.message || 'Test email sent!')
     else toast.error(data.detail || data.error || 'Failed to send test email')
   } catch {
     toast.error('Could not reach backend')
   } finally {
     setSendingTestEmail(false)
   }
 }

 const handleTriggerWikiCompile = async () => {
   setTriggeringWikiCompile(true)
   try {
     const res = await fetch('/api/scheduler/trigger/wiki_compile', {
       method: 'POST',
       headers: authHeaders(),
     })
     const data = await res.json()
     if (res.ok) toast.success('Wiki compile started — check Wiki in a few minutes')
     else toast.error(data.detail || 'Failed to trigger compile')
   } catch {
     toast.error('Could not reach backend')
   } finally {
     setTriggeringWikiCompile(false)
   }
 }

 const handleSendFeatureRequest = async () => {
   if (!featureRequest.trim()) return
   setSendingFeatureRequest(true)
   try {
     const res = await fetch('/api/feedback/feature-request', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ message: featureRequest.trim() }),
     })
     if (res.ok) {
       toast.success('Feature request sent!')
       setFeatureRequest('')
     } else {
       toast.error('Could not send — try again')
     }
   } catch {
     toast.error('Could not reach backend')
   } finally {
     setSendingFeatureRequest(false)
   }
 }

 const handleLogout = () => {
   localStorage.removeItem('greenplot_token')
   localStorage.removeItem('greenplot_tenant')
   localStorage.removeItem('greenplot_nickname')
   localStorage.removeItem('greenplot_chat_messages')
   localStorage.removeItem('greenplot_profile')
   toast.success('Logged out')
   router.push('/onboarding')
 }

 const handleDeleteAccount = async () => {
   if (deleteConfirmText.toLowerCase() !== 'delete my account') return
   setDeleting(true)
   try {
     const res = await fetch(`${BACKEND}/account`, {
       method: 'DELETE',
       headers: authHeaders(),
     })
     if (!res.ok) throw new Error('Failed to delete')
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

 const handleUnlockDevTools = async () => {
   const emailToUse = userEmail || devEmail
   if (!devPassword || !emailToUse || devUnlocking) return
   setDevUnlocking(true)
   setDevError('')
   try {
     const res = await fetch('/api/login', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ email: emailToUse, password: devPassword }),
     })
     if (res.ok) {
       setShowDevTools(true)
       setDevPassword('')
       setDevEmail('')
     } else {
       setDevError('Incorrect password')
     }
   } catch {
     setDevError('Could not verify — check connection')
   } finally {
     setDevUnlocking(false)
   }
 }

 return (
   <div className="flex flex-col h-dvh bg-background">
     <Header />
     <main className="flex-1 overflow-y-auto" style={{ paddingTop: 'var(--header-height)' }}>
       <div className="px-4 space-y-6 max-w-2xl mx-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8rem)' }}>
         <h1 className="text-3xl font-normal tracking-tight text-on-surface">Settings</h1>



         {/* Profile */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Profile</h2>
           <div className="space-y-2">
             <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
               {editingNickname ? (
                 <div className="flex items-center gap-2">
                   <Input value={editNickname} onChange={e => setEditNickname(e.target.value)}
                     className="flex-1 rounded-full bg-surface-container-highest border-0" placeholder="Your nickname" autoFocus />
                   <Button size="sm" onClick={handleSaveNickname} disabled={saving} className="rounded-full">Save</Button>
                   <Button size="sm" variant="ghost" onClick={() => setEditingNickname(false)} className="rounded-full">Cancel</Button>
                 </div>
               ) : (
                 <div className="flex items-center justify-between">
                   <div>
                     <p className="text-xs text-on-surface-variant">Nickname</p>
                     <p className="text-sm font-bold text-on-surface">{nickname || 'Not set'}</p>
                   </div>
                   <button onClick={() => { setEditNickname(nickname); setEditingNickname(true) }} className="text-xs text-primary font-medium">Edit</button>
                 </div>
               )}
             </div>
             <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
               {editingCity ? (
                 <div className="flex items-center gap-2">
                   <Input value={editCity} onChange={e => setEditCity(e.target.value)}
                     className="flex-1 rounded-full bg-surface-container-highest border-0" placeholder="e.g. Munich, Berlin, NYC" autoFocus />
                   <Button size="sm" onClick={handleSaveCity} disabled={saving} className="rounded-full">Save</Button>
                   <Button size="sm" variant="ghost" onClick={() => setEditingCity(false)} className="rounded-full">Cancel</Button>
                 </div>
               ) : (
                 <div className="flex items-center justify-between">
                   <div>
                     <p className="text-xs text-on-surface-variant">Location</p>
                     <p className="text-sm font-bold text-on-surface">{city || 'Not set'}</p>
                     <p className="text-[10px] text-on-surface-variant/60 mt-0.5">Used for weather in daily briefing</p>
                   </div>
                   <button onClick={() => { setEditCity(city); setEditingCity(true) }} className="text-xs text-primary font-medium">Edit</button>
                 </div>
               )}
             </div>
           </div>
         </section>

         {/* Notifications */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Notifications</h2>
           <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10">
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm font-bold text-on-surface">Push Notifications</p>
                 <p className="text-xs text-on-surface-variant">Daily briefings and reminders</p>
               </div>
               <Switch checked={notificationsEnabled} onCheckedChange={handleToggleNotifications} />
             </div>
             {pushStatus === 'not-installed' && (
               <div className="mt-3 p-3 rounded-xl bg-tertiary-container/20 border border-tertiary/20">
                 <p className="text-xs font-medium text-on-surface">📱 Install to Home Screen first</p>
                 <p className="text-[11px] text-on-surface-variant leading-relaxed">
                   Tap the <span className="material-symbols-outlined text-[12px] align-middle">ios_share</span> icon → Add to Home Screen.
                 </p>
               </div>
             )}
             {pushStatus === 'denied' && (
               <div className="mt-3 p-3 rounded-xl bg-error/10 border border-error/20">
                 <p className="text-xs font-medium text-error">🚫 Notifications blocked</p>
                 <p className="text-[11px] text-on-surface-variant leading-relaxed">
                   Go to Settings → Safari → Notifications → Allow.
                 </p>
               </div>
             )}
           </div>
         </section>

         {/* Wiki Compile */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Knowledge Base</h2>
           <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 space-y-3">
             <div className="flex items-start gap-3">
               <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}>auto_stories</span>
               <div className="flex-1">
                 <p className="text-sm font-bold text-on-surface">Wiki Compilation</p>
                 <p className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
                   Automatically compiles wiki articles from your garden seeds. Runs every 6 hours.
                   Trigger manually to compile right now.
                 </p>
               </div>
             </div>
             <Button
               size="sm"
               variant="outline"
               onClick={handleTriggerWikiCompile}
               disabled={triggeringWikiCompile}
               className="w-full rounded-full text-xs"
             >
               {triggeringWikiCompile ? (
                 <span className="material-symbols-outlined animate-spin mr-1" style={{ fontSize: '14px' }}>progress_activity</span>
               ) : (
                 <span className="material-symbols-outlined mr-1" style={{ fontSize: '14px' }}>auto_awesome</span>
               )}
               {triggeringWikiCompile ? 'Compiling…' : 'Compile Wiki Now'}
             </Button>
           </div>
         </section>

         {/* Email Digests */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Email Digests</h2>
           <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 space-y-3">
             <div className="flex items-start gap-3">
               <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}>mail</span>
               <div className="flex-1">
                 <p className="text-sm font-bold text-on-surface">Daily Email Digests</p>
                 <p className="text-[11px] text-on-surface-variant mt-0.5">
                   {userEmail ? `Sending to ${userEmail}` : 'Email from your account registration'}
                 </p>
                 <div className="mt-2 space-y-1 text-[10px] text-on-surface-variant/70">
                   <p>☀️ Enterprise Digest — 09:30 CET</p>
                   <p>🔬 Academic + Research Digest — 07:00 & 18:00 CET (4 arXiv PDFs attached)</p>
                   <p>📊 Weekly Content Eval — Sunday 18:00 CET</p>
                 </div>
               </div>
             </div>
             <Button
               size="sm"
               variant="outline"
               onClick={handleSendTestEmail}
               disabled={sendingTestEmail}
               className="w-full rounded-full text-xs"
             >
               {sendingTestEmail ? (
                 <span className="material-symbols-outlined animate-spin mr-1" style={{ fontSize: '14px' }}>progress_activity</span>
               ) : (
                 <span className="material-symbols-outlined mr-1" style={{ fontSize: '14px' }}>send</span>
               )}
               {sendingTestEmail ? 'Sending…' : 'Send Test Email'}
             </Button>
           </div>
         </section>

         {/* Share to Garden */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Share to Garden</h2>
           <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 space-y-3">
             <div className="flex items-start gap-3">
               <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}>ios_share</span>
               <div>
                 <p className="text-sm font-bold text-on-surface">Share from Safari</p>
                 <p className="text-[11px] text-on-surface-variant leading-relaxed mt-0.5">
                   Greenplot appears in the iOS share sheet once installed to your home screen.
                   If you added the app before this feature was enabled, remove it and re-add it.
                 </p>
               </div>
             </div>
             <div className="bg-surface-container-high rounded-xl p-3 text-[11px] text-on-surface-variant leading-relaxed space-y-1.5">
               <p className="font-semibold text-on-surface text-xs">To enable:</p>
               <p>1. Remove Greenplot from your home screen</p>
               <p>2. Open <span className="font-medium text-primary">greenplot.ink</span> in Safari</p>
               <p>3. Tap <span className="material-symbols-outlined text-[11px] align-middle">ios_share</span> → <strong>Add to Home Screen</strong></p>
               <p>4. Now tap Share in any app → Greenplot appears in the list</p>
             </div>
           </div>
         </section>

         {/* Buy Me a Coffee */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Support</h2>
           <a
             href="https://buymeacoffee.com/frederickk1"
             target="_blank"
             rel="noopener noreferrer"
             className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-[#FFDD00]/10 border border-[#FFDD00]/20 hover:border-[#FFDD00]/50 hover:bg-[#FFDD00]/15 transition-all active:scale-[0.98] group"
           >
             <span className="text-2xl">☕</span>
             <div className="flex-1">
               <p className="text-sm font-bold text-on-surface">Buy Me a Coffee</p>
               <p className="text-[11px] text-on-surface-variant mt-0.5">Enjoying Greenplot? Support the build.</p>
             </div>
             <span className="material-symbols-outlined text-on-surface-variant/40 group-hover:text-[#FFDD00] transition-colors">open_in_new</span>
           </a>
         </section>

         {/* Integrations */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Integrations</h2>
           <CalendarConnectCard />
         </section>

         {/* Notification Pipelines */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Notification Pipelines</h2>
           <div className="space-y-2">
             {PIPELINE_JOBS.map(job => {
               const cfg = scheduleConfig[job.id]
               const enabled = cfg?.enabled ?? true
               const hour = cfg?.hour ?? 8
               const minute = cfg?.minute ?? 30
               return (
                 <div key={job.id} className={`px-4 py-4 rounded-2xl bg-surface-container border transition-colors ${enabled ? 'border-outline-variant/10' : 'border-outline-variant/5 opacity-60'}`}>
                   <div className="flex items-start gap-3">
                     <span className="material-symbols-outlined text-primary mt-0.5 flex-shrink-0" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}>{job.icon}</span>
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center justify-between mb-1">
                         <p className="text-sm font-bold text-on-surface">{job.label}</p>
                         <Switch
                           checked={enabled}
                           onCheckedChange={val => handleScheduleChange(job.id, { enabled: val })}
                           disabled={savingSchedule === job.id}
                         />
                       </div>
                       <p className="text-[10px] text-on-surface-variant mb-2">{job.description}</p>
                       {enabled && (
                         <div className="flex items-center gap-2">
                           <span className="material-symbols-outlined text-on-surface-variant/50" style={{ fontSize: '14px' }}>schedule</span>
                           <TimeEditor
                             hour={hour}
                             minute={minute}
                             onChange={(h, m) => handleScheduleChange(job.id, { hour: h, minute: m })}
                           />
                           <span className="text-[9px] text-on-surface-variant/50">CET</span>
                           {savingSchedule === job.id && (
                             <span className="material-symbols-outlined text-primary animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
                           )}
                         </div>
                       )}
                     </div>
                   </div>
                 </div>
               )
             })}
           </div>
         </section>

         {/* Feature Request */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Feature Request</h2>
           <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 space-y-3">
             <div className="flex items-start gap-3">
               <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}>lightbulb</span>
               <div className="flex-1">
                 <p className="text-sm font-bold text-on-surface">Got an idea?</p>
                 <p className="text-[11px] text-on-surface-variant mt-0.5">Tell me what you'd like to see next.</p>
               </div>
             </div>
             <textarea
               value={featureRequest}
               onChange={e => setFeatureRequest(e.target.value)}
               placeholder="I'd love to see..."
               rows={3}
               className="w-full rounded-2xl bg-surface-container-high border border-outline-variant/20 px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30 transition-colors resize-none"
             />
             <Button
               size="sm"
               onClick={handleSendFeatureRequest}
               disabled={sendingFeatureRequest || !featureRequest.trim()}
               className="w-full rounded-full text-xs"
             >
               {sendingFeatureRequest ? (
                 <span className="material-symbols-outlined animate-spin mr-1" style={{ fontSize: '14px' }}>progress_activity</span>
               ) : (
                 <span className="material-symbols-outlined mr-1" style={{ fontSize: '14px' }}>send</span>
               )}
               {sendingFeatureRequest ? 'Sending…' : 'Send Request'}
             </Button>
           </div>
         </section>

         {/* Developer Tools — password-gated */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Developer Tools</h2>
           {!showDevTools ? (
             <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 space-y-3">
               <div className="flex items-center gap-3">
                 <span className="material-symbols-outlined text-on-surface-variant/60 mt-0.5" style={{ fontSize: '20px' }}>lock</span>
                 <div>
                   <p className="text-sm font-bold text-on-surface">MCP Server &amp; Data Tools</p>
                   <p className="text-[11px] text-on-surface-variant mt-0.5">Re-enter your password to access sensitive developer settings.</p>
                 </div>
               </div>
               <div className="flex flex-col gap-2">
                 {!userEmail && (
                   <input
                     type="email"
                     value={devEmail}
                     onChange={e => { setDevEmail(e.target.value); setDevError('') }}
                     placeholder="Your email"
                     className="w-full rounded-xl bg-surface-container-high border border-outline-variant/20 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50"
                   />
                 )}
                 <div className="flex gap-2">
                   <input
                     type="password"
                     value={devPassword}
                     onChange={e => { setDevPassword(e.target.value); setDevError('') }}
                     onKeyDown={e => e.key === 'Enter' && handleUnlockDevTools()}
                     placeholder="Your password"
                     className="flex-1 rounded-xl bg-surface-container-high border border-outline-variant/20 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50"
                   />
                   <button
                     onClick={handleUnlockDevTools}
                     disabled={devUnlocking || !devPassword || (!userEmail && !devEmail)}
                     className="rounded-xl bg-primary text-on-primary px-4 py-2 text-sm font-bold disabled:opacity-40 active:scale-95 transition-transform"
                   >
                     {devUnlocking ? '…' : 'Unlock'}
                   </button>
                 </div>
               </div>
               {devError && <p className="text-xs text-error">{devError}</p>}
             </div>
           ) : (
             <div className="space-y-4">
               {/* MCP Server */}
               <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 space-y-4">
                 <div className="flex items-start gap-3">
                   <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}>extension</span>
                   <div>
                     <p className="text-sm font-bold text-on-surface">MCP Server (Claude Code / Cursor)</p>
                     <p className="text-[11px] text-on-surface-variant leading-relaxed mt-0.5">
                       Lets Claude Code, Claude Desktop, and Cursor search your seeds and wiki while you code.
                     </p>
                   </div>
                 </div>
                 <div className="space-y-2">
                   <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Add to ~/.claude/settings.json</p>
                   <div className="relative">
                     <pre className="text-[10px] text-on-surface/80 bg-surface-container-high rounded-xl p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">{`{
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
                     <button
                       onClick={() => {
                         const config = JSON.stringify({
                           mcpServers: {
                             greenplot: {
                               command: 'python3',
                               args: ['~/Seedify/openclaw-api/mcp_server.py'],
                               env: {
                                 GREENPLOT_API_URL: 'https://api.greenplot.ink',
                                 GREENPLOT_TOKEN: token || '',
                               },
                             },
                           },
                         }, null, 2)
                         navigator.clipboard.writeText(config)
                         toast.success('Config copied to clipboard')
                       }}
                       className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant/60 hover:text-primary transition-colors"
                       title="Copy to clipboard"
                     >
                       <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
                     </button>
                   </div>
                 </div>
                 <div className="space-y-1">
                   <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Available tools once connected</p>
                   <div className="grid grid-cols-2 gap-1.5">
                     {['query_seeds', 'query_wiki', 'capture_thought', 'list_recent_seeds'].map(t => (
                       <div key={t} className="flex items-center gap-1.5 text-[10px] text-on-surface-variant bg-surface-container-high rounded-lg px-2 py-1.5">
                         <span className="material-symbols-outlined text-primary" style={{ fontSize: '12px' }}>check_circle</span>
                         <code>{t}</code>
                       </div>
                     ))}
                   </div>
                 </div>
               </div>

               {/* Data Tools */}
               <div className="px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 space-y-3">
                 <div className="flex items-start gap-3">
                   <span className="material-symbols-outlined text-primary mt-0.5" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}>auto_fix</span>
                   <div className="flex-1">
                     <p className="text-sm font-bold text-on-surface">Fix Seed Titles</p>
                     <p className="text-[11px] text-on-surface-variant mt-0.5">Re-generate titles for seeds saved as "Untitled". Processes 5 seeds per run.</p>
                   </div>
                 </div>
                 <Button
                   size="sm"
                   variant="outline"
                   onClick={async () => {
                     const t = localStorage.getItem('greenplot_token')
                     toast.loading('Fixing seed titles…')
                     try {
                       const res = await fetch('/api/seeds/fix-titles', {
                         method: 'POST',
                         headers: t ? { Authorization: `Bearer ${t}` } : {},
                       })
                       const data = await res.json()
                       toast.dismiss()
                       if (res.ok) {
                         if (data.errors?.length) {
                           toast.error(`Fixed ${data.fixed} · Error: ${data.errors[0]}`)
                         } else {
                           toast.success(`Fixed ${data.fixed} seed${data.fixed !== 1 ? 's' : ''}${data.remaining > 0 ? ` · ${data.remaining} remaining (run again)` : ' · all done!'}`)
                         }
                       } else {
                         toast.error('Failed to fix titles')
                       }
                     } catch {
                       toast.dismiss()
                       toast.error('Could not reach server')
                     }
                   }}
                   className="w-full rounded-full text-xs"
                 >
                   <span className="material-symbols-outlined mr-1" style={{ fontSize: '14px' }}>auto_fix_high</span>
                   Fix Seed Titles
                 </Button>
               </div>

               <button
                 onClick={() => { setShowDevTools(false); setDevPassword('') }}
                 className="w-full text-xs text-on-surface-variant/50 hover:text-on-surface-variant transition-colors py-1"
               >
                 Lock developer tools
               </button>
             </div>
           )}
         </section>

         {/* Account */}
         <section>
           <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Account</h2>
           <div className="space-y-2">
             <button onClick={handleLogout}
               className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 transition-colors hover:bg-surface-container-high">
               <span className="material-symbols-outlined text-on-surface-variant">logout</span>
               <div className="text-left">
                 <p className="text-sm font-bold text-on-surface">Log Out</p>
                 <p className="text-xs text-on-surface-variant">Sign out of your account</p>
               </div>
             </button>
             <button onClick={() => setShowDeleteDialog(true)}
               className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-error/5 border border-error/10 transition-colors hover:bg-error/10">
               <span className="material-symbols-outlined text-error">delete_forever</span>
               <div className="text-left">
                 <p className="text-sm font-bold text-error">Delete Account</p>
                 <p className="text-xs text-on-surface-variant">Permanently delete your account and all data</p>
               </div>
             </button>
           </div>
         </section>
       </div>
     </main>
     <BottomNav />

     <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
       <DialogContent className="rounded-3xl bg-surface-container border border-outline-variant/10 max-w-sm mx-4">
         <DialogHeader>
           <div className="flex justify-center">
             <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center">
               <span className="material-symbols-outlined text-error">warning</span>
             </div>
           </div>
           <DialogTitle className="text-center text-lg font-extrabold text-on-surface">Delete Account?</DialogTitle>
           <DialogDescription className="text-center text-sm text-on-surface-variant">
             This will permanently delete your account, all seeds, conversations, and data. This cannot be undone.
           </DialogDescription>
         </DialogHeader>
         <div className="py-4">
           <p className="text-xs text-on-surface-variant">Type <span className="font-bold text-error">&quot;delete my account&quot;</span> to confirm:</p>
           <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
             placeholder="delete my account" className="rounded-full bg-surface-container-highest border-error/20 text-center" autoFocus />
         </div>
         <DialogFooter className="flex gap-2 sm:flex-col">
           <Button onClick={handleDeleteAccount}
             disabled={deleteConfirmText.toLowerCase() !== 'delete my account' || deleting}
             className="w-full rounded-full bg-error text-on-error hover:bg-error/90 font-bold">
             {deleting ? 'Deleting...' : 'Delete My Account'}
           </Button>
           <Button variant="ghost" onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText('') }}
             className="w-full rounded-full text-on-surface-variant">Cancel</Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   </div>
 )
}
