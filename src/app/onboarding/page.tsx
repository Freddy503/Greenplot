'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { GP_ICONS } from '@/components/onboarding/gp-icons'

// ── Onboarding v2 — value-first 8-step flow (design: Seedify Onboarding v2) ──
// Welcome → Invite → Interests → Rhythm → Weather → Push → Privacy → Account
// → planting → bloom. Desktop (lg+) gets the editorial side panel.

const SERIF = "var(--font-display, 'Instrument Serif', Georgia, serif)"
const BODY = "var(--font-body, 'Barlow', system-ui, sans-serif)"
const UI = "var(--font-ui, 'Sora', system-ui, sans-serif)"

type Frequency = 'twice-daily' | 'once-daily' | 'bi-weekly' | 'weekly' | 'calendar'
type TokenState = 'idle' | 'checking' | 'valid' | 'invalid' | 'error'

const STEP_LABELS = ['Welcome', 'Invite', 'Interests', 'Rhythm', 'Weather', 'Stay in the loop', 'Your data', 'Account']

const INTERESTS = [
  { label: 'Technology', icon: 'cpu' },
  { label: 'AI agents', icon: 'bot' },
  { label: 'Business trends', icon: 'trending-up' },
  { label: 'Entrepreneurship', icon: 'lightbulb' },
  { label: 'Design', icon: 'palette' },
  { label: 'Productivity', icon: 'zap' },
  { label: 'Learning', icon: 'book-open' },
  { label: 'Creativity', icon: 'sparkles' },
  { label: 'Consulting', icon: 'handshake' },
  { label: 'Law', icon: 'scale' },
  { label: 'Medicine', icon: 'heart-pulse' },
  { label: 'Sustainability', icon: 'leaf' },
]

const DIGESTS: { label: string; sublabel: string; value: Frequency }[] = [
  { label: 'Twice a day', sublabel: 'Morning spark & evening reflection', value: 'twice-daily' },
  { label: 'Once a day', sublabel: 'One rich morning briefing', value: 'once-daily' },
  { label: 'Bi-weekly', sublabel: 'Mid-week & weekend digests', value: 'bi-weekly' },
  { label: 'Weekly', sublabel: 'A Sunday roundup', value: 'weekly' },
  { label: 'Around my calendar', sublabel: 'Smart timing in your free slots', value: 'calendar' },
]

const CRON: Record<Frequency, Array<{ icon: string; name: string; time: string; desc: string }>> = {
  'twice-daily': [
    { icon: 'sun', name: 'Morning Spark', time: '8:00 AM', desc: 'Weather, your day ahead & a creative prompt.' },
    { icon: 'moon', name: 'Evening Reflection', time: '8:00 PM', desc: 'Capture loose thoughts before they fade.' },
  ],
  'once-daily': [
    { icon: 'sun', name: 'Daily Briefing', time: '9:00 AM', desc: 'Weather, calendar highlights, fresh seeds & a prompt.' },
    { icon: 'leaf', name: 'Garden Pulse', time: 'alongside', desc: 'Seed enrichment & new connections, quietly.' },
  ],
  'bi-weekly': [
    { icon: 'trending-up', name: 'Mid-Week Digest', time: 'Wed 10 AM', desc: 'Trends in your topics & new web finds.' },
    { icon: 'book-open', name: 'Weekend Review', time: 'Sun 10 AM', desc: 'A deep-dive into your garden’s growth.' },
  ],
  weekly: [
    { icon: 'book-open', name: 'Weekly Roundup', time: 'Sun 10 AM', desc: 'Seeds planted, enriched & trending topics.' },
  ],
  calendar: [
    { icon: 'calendar-check', name: 'Smart Scheduling', time: 'around you', desc: 'Insights land in free slots — never mid-meeting.' },
  ],
}

const CITIES = ['Berlin', 'Lisbon', 'London', 'New York', 'San Francisco', 'Tokyo', 'Amsterdam', 'Zurich', 'Paris', 'Copenhagen']
const WEATHER: Record<string, [string, string]> = {
  Berlin: ['12°', 'cloud-sun'], Lisbon: ['21°', 'sun'], London: ['11°', 'cloud-drizzle'],
  'New York': ['16°', 'sun'], 'San Francisco': ['17°', 'cloud-sun'], Tokyo: ['19°', 'cloud-sun'],
  Amsterdam: ['13°', 'cloud-rain'], Zurich: ['10°', 'cloud-sun'], Paris: ['14°', 'sun'], Copenhagen: ['9°', 'wind'],
}

const STORAGE_KEY = 'greenplot_onboarding_v2'

// ── Icon (inline lucide paths — identical to the design bundle) ──

function Ic({ name, size, color, style }: { name: string; size: number; color: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'inline-block', flexShrink: 0, transition: 'stroke .2s', ...style }}
      dangerouslySetInnerHTML={{ __html: GP_ICONS[name] || '' }}
    />
  )
}

// ── Shared step typography ──

function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h2 style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 38, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 10px', color: '#141413' }}>{title}</h2>
      <p style={{ fontFamily: BODY, fontSize: 15, lineHeight: 1.6, color: '#5f5f5a', margin: '0 0 24px', maxWidth: 330, textWrap: 'pretty' } as React.CSSProperties}>{sub}</p>
    </>
  )
}

const stepPad: React.CSSProperties = { padding: '16px 28px 24px', width: '100%', maxWidth: 470, margin: '0 auto' }

// ── Editorial side panel (web ≥ 1024px) ──

function SidePanel() {
  return (
    <aside className="ob-side">
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(70% 50% at 30% 20%, rgba(34,197,94,0.08), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 9 }}>
        <Ic name="sprout" size={20} color="#22c55e" />
        <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 22, color: '#141413' }}>Greenplot</span>
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 30, lineHeight: 1.18, letterSpacing: '-0.01em', color: '#141413', margin: 0, textWrap: 'balance' } as React.CSSProperties}>
          &ldquo;A living laboratory for your ideas.&rdquo;
        </p>
        <p style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.6, color: '#71716b', margin: 0, textWrap: 'pretty' } as React.CSSProperties}>
          Seeds become knowledge. Knowledge becomes specs. Specs become software — shipped by agents while you think.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4 }}>
          {[
            { icon: 'sprout', text: 'Plant — capture ideas & research' },
            { icon: 'waypoints', text: 'Grow — a wiki that writes itself' },
            { icon: 'rocket', text: 'Ship — specs to coding agents' },
          ].map((r) => (
            <div key={r.icon} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Ic name={r.icon} size={14} color="#16a34a" />
              <span style={{ fontFamily: UI, fontSize: 12, fontWeight: 500, color: '#5f5f5a' }}>{r.text}</span>
            </div>
          ))}
        </div>
      </div>
      <p style={{ position: 'relative', fontFamily: UI, fontSize: 10.5, color: '#a3a29c', margin: 0 }}>Private beta · invite only</p>
    </aside>
  )
}

// ── Main flow ──

function OnboardingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { requestPermission, isIOS, isStandalone } = usePushNotifications()

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [token, setToken] = useState('')
  const [tokenState, setTokenState] = useState<TokenState>('idle')
  const [interests, setInterests] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('once-daily')
  const [city, setCity] = useState('')
  const [pushChoice, setPushChoice] = useState<string | null>(null)
  const [consent, setConsent] = useState<Record<string, boolean>>({ enrich: true, web: true, calendar: false })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [nickname, setNickname] = useState('')
  const [planting, setPlanting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const tokenSeq = useRef(0)

  // Restore progress + magic-link invite prefill
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s && typeof s === 'object') {
          if (typeof s.step === 'number') setStep(Math.min(Math.max(s.step, 0), 7))
          if (Array.isArray(s.interests)) setInterests(s.interests)
          if (typeof s.custom === 'string') setCustom(s.custom)
          if (typeof s.frequency === 'string') setFrequency(s.frequency)
          if (typeof s.city === 'string') setCity(s.city)
          if (typeof s.pushChoice === 'string') setPushChoice(s.pushChoice)
          if (s.consent && typeof s.consent === 'object') setConsent((c) => ({ ...c, ...s.consent }))
          if (typeof s.email === 'string') setEmail(s.email)
          if (typeof s.nickname === 'string') setNickname(s.nickname)
          if (typeof s.token === 'string') setToken(s.token)
          if (s.tokenOk) setTokenState('valid')
        }
      }
    } catch { /* fresh start */ }
    const inviteEmail = searchParams.get('email')
    if (inviteEmail) setEmail(inviteEmail)
    const codeParam = (searchParams.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (codeParam.length === 6) {
      // Invite email deep link — code arrives prefilled, still validated for real
      setToken(codeParam)
      setTokenState('checking')
      validateCode(codeParam)
    } else if (inviteEmail) {
      // Legacy magic-link invite — the validated email itself is the credential
      setToken('INVITE')
      setTokenState('valid')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = (extra: Record<string, unknown>) => {
    try {
      const base = {
        step, interests, custom, frequency, city, pushChoice, consent, email, nickname, token,
        tokenOk: tokenState === 'valid',
        ...extra,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(base))
    } catch { /* private mode */ }
  }

  const go = (next: number, d: number) => { setStep(next); setDir(d); persist({ step: next }) }
  const back = () => { if (step > 0) go(step - 1, -1) }

  // ── Invite code — real validation against the backend ──
  const validateCode = (v: string) => {
    const seq = ++tokenSeq.current
    fetch('/api/auth/validate-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: v }),
    })
      .then(async (res) => {
        if (seq !== tokenSeq.current) return
        if (!res.ok) { setTokenState('error'); return }
        const data = await res.json()
        setTokenState(data.valid ? 'valid' : 'invalid')
        if (data.valid) persist({ token: v, tokenOk: true })
      })
      .catch(() => { if (seq === tokenSeq.current) setTokenState('error') })
  }

  const onTokenInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setToken(v)
    setTokenState(v.length === 6 ? 'checking' : 'idle')
    if (v.length === 6) validateCode(v)
  }

  const toggleInterest = (label: string) => {
    setInterests((prev) => {
      const next = prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
      persist({ interests: next })
      return next
    })
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const pwOk = password.length >= 6
  const matchOk = pwOk && password === confirm && confirm.length > 0
  const accountValid = emailValid && pwOk && password === confirm

  const allInterests = [...interests, ...(custom.trim() ? [custom.trim()] : [])]

  // ── Register: planting screen runs while the account is created ──
  const enter = async () => {
    setError('')
    setPlanting(true)
    const minDelay = new Promise((r) => setTimeout(r, 2600))
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          city: city.trim() || undefined,
          nickname: nickname.trim() || undefined,
          interests: allInterests.length > 0 ? allInterests : undefined,
          digest_frequency: frequency,
          invite_code: token !== 'INVITE' ? token : undefined,
          consents: consent,
          push_choice: pushChoice || undefined,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        let detail = text
        try { detail = JSON.parse(text).detail || text } catch { /* plain text */ }
        throw new Error(typeof detail === 'string' ? detail : 'Registration failed')
      }
      const { access_token, tenant_id } = await res.json()
      localStorage.setItem('greenplot_token', access_token)
      localStorage.setItem('greenplot_tenant', tenant_id)
      localStorage.setItem('greenplot_nickname', nickname.trim())
      localStorage.setItem('greenplot_email', email.trim())
      localStorage.setItem('greenplot_profile', JSON.stringify({
        nickname: nickname.trim(), city: city.trim(), interests: allInterests,
        digestFrequency: frequency, consents: consent, onboardedAt: new Date().toISOString(),
      }))
      // First seed — non-blocking
      const interestStr = allInterests.length > 0 ? allInterests.join(', ') : 'general ideas'
      fetch('/api/thoughts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
        body: JSON.stringify({
          content: `Welcome! I'm ${nickname.trim() || email.split('@')[0]}. My interests include: ${interestStr}. Let's start building my knowledge garden.`,
          source: 'onboarding',
        }),
      }).catch(() => {})
      if (pushChoice === 'yes') requestPermission().catch(() => {})
      // First chat shows the getting-started card
      localStorage.setItem('greenplot_show_start_card', '1')
      await minDelay
      localStorage.removeItem(STORAGE_KEY)
      setPlanting(false)
      setDone(true)
    } catch (err) {
      await minDelay
      setPlanting(false)
      setError((err as Error).message || 'Something went wrong — please try again.')
    }
  }

  const next = () => { if (step < 7) go(step + 1, 1); else enter() }

  // ── Derived UI state ──
  const ctaDisabled = (step === 1 && tokenState !== 'valid') || (step === 7 && !accountValid)
  const ctaLabel = ['Get started', 'Continue', 'Continue', 'Continue', 'Continue', 'Continue', 'Continue', 'Enter the garden'][step]
  const showChrome = !planting && !done
  const stepAnimStyle: React.CSSProperties = {
    flex: 1, display: 'flex', flexDirection: 'column',
    animation: `${dir >= 0 ? 'gp-slideL' : 'gp-slideR'} .45s cubic-bezier(.25,.8,.3,1) both`,
  }

  const count = interests.length + (custom.trim() ? 1 : 0)
  const selectedHint = count === 0
    ? 'Tip: 3–5 topics make the richest garden.'
    : `${count} ${count === 1 ? 'topic' : 'topics'} chosen — your digests will cover these.`

  const cityTrim = city.trim()
  const cityMatch = CITIES.find((c) => c.toLowerCase() === cityTrim.toLowerCase())
  const knownCity = cityMatch || (cityTrim.length >= 3 ? cityTrim : null)
  const wx = cityMatch ? WEATHER[cityMatch] : (cityTrim.length >= 3 ? ['18°', 'cloud-sun'] as [string, string] : null)
  const citySuggestions = cityTrim.length > 0 && !cityMatch
    ? CITIES.filter((c) => c.toLowerCase().startsWith(cityTrim.toLowerCase())).slice(0, 3)
    : []
  const interestsPicked = interests.slice(0, 3).join(', ') || 'your topics'

  const displayName = nickname.trim() || (email.split('@')[0] || 'friend')

  const fieldLabel: React.CSSProperties = { display: 'block', fontFamily: UI, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#71716b', margin: '0 0 6px 4px' }
  const fieldIcon: React.CSSProperties = { position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }

  return (
    <div className="ob-page">
      <SidePanel />
      <div className="ob-flow">

        {/* ░░ CHROME ░░ */}
        {showChrome && (
          <div className="ob-chrome">
            <div style={{ width: '100%', maxWidth: 470, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 24 }}>
                {step > 0 ? (
                  <button onClick={back} className="ob-back" aria-label="Back">
                    <Ic name="arrow-left" size={16} color="currentColor" />Back
                  </button>
                ) : <span />}
                <span style={{ fontFamily: UI, fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#16a34a' }}>{STEP_LABELS[step]}</span>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} style={{ flex: 1, height: 4, borderRadius: 9999, background: '#e8e6df', overflow: 'hidden', position: 'relative' }}>
                    {i <= step && <div style={{ position: 'absolute', inset: 0, background: '#22c55e', borderRadius: 9999, animation: 'gp-fadeIn .5s ease both' }} />}
                    {i === step && <div style={{ position: 'absolute', inset: 0, background: '#22c55e', borderRadius: 9999, opacity: 0, animation: 'gp-pulseDot 1.8s ease-in-out infinite' }} />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ░░ BODY ░░ */}
        <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}>

          {/* ── 0 · WELCOME ── */}
          {step === 0 && showChrome && (
            <div key="s0" style={stepAnimStyle}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '10px 28px 30px', width: '100%', maxWidth: 470, margin: '0 auto' }}>
                <div style={{ position: 'relative', width: 190, height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
                  <div style={{ position: 'absolute', width: 170, height: 170, borderRadius: 9999, background: 'radial-gradient(circle, rgba(34,197,94,0.22), transparent 68%)', animation: 'gp-breathe 5s ease-in-out infinite' }} />
                  <div style={{ position: 'absolute', width: 190, height: 190, borderRadius: 9999, border: '1px dashed #d8e8dd', animation: 'gp-spin 28s linear infinite' }}>
                    <div style={{ position: 'absolute', top: -4, left: '50%', width: 9, height: 9, borderRadius: 9999, background: '#22c55e', transform: 'translateX(-50%)', boxShadow: '0 0 0 4px rgba(34,197,94,0.14)' }} />
                    <div style={{ position: 'absolute', bottom: 15, left: 8, width: 6, height: 6, borderRadius: 9999, background: '#14b8a6' }} />
                  </div>
                  <div style={{ position: 'absolute', width: 150, height: 150, borderRadius: 9999, border: '1px solid #e8e6df', animation: 'gp-spinR 36s linear infinite' }}>
                    <div style={{ position: 'absolute', top: '50%', right: -3, width: 7, height: 7, borderRadius: 9999, background: '#86efac', transform: 'translateY(-50%)' }} />
                  </div>
                  <div style={{ position: 'relative', width: 124, height: 124, borderRadius: 9999, background: 'rgba(255,255,255,0.62)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(20,20,19,0.06), 0 12px 30px -14px rgba(20,40,25,0.4)' }}>
                    <Ic name="sprout" size={54} color="#22c55e" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 9999, background: '#22c55e' }} />
                  <span style={{ fontFamily: UI, fontSize: 11, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#71716b', whiteSpace: 'nowrap' }}>Welcome to</span>
                </div>
                <h1 style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 58, lineHeight: 0.98, letterSpacing: '-0.02em', margin: '0 0 16px', color: '#141413' }}>Greenplot</h1>
                <p style={{ fontFamily: BODY, fontSize: 16, lineHeight: 1.6, color: '#5f5f5a', maxWidth: 310, margin: '0 0 24px', textWrap: 'pretty' } as React.CSSProperties}>
                  Your AI thinking partner. Plant ideas, grow them into knowledge, ship them with coding agents.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {[
                    { icon: 'sprout', text: 'Plant ideas', delay: '.12s' },
                    { icon: 'waypoints', text: 'Grow knowledge', delay: '.24s' },
                    { icon: 'rocket', text: 'Ship with agents', delay: '.36s' },
                  ].map((c) => (
                    <span key={c.text} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.66)', backdropFilter: 'blur(8px)', boxShadow: 'inset 0 0 0 1px rgba(20,20,19,0.07)', fontFamily: UI, fontSize: 12, fontWeight: 500, color: '#5f5f5a', animation: 'gp-fadeUp .5s ease both', animationDelay: c.delay }}>
                      <Ic name={c.icon} size={14} color="#22c55e" />{c.text}
                    </span>
                  ))}
                </div>
                <button onClick={() => router.push('/login')} className="ob-quiet" style={{ marginTop: 26 }}>
                  Already have an account? <span style={{ color: '#16a34a', fontWeight: 600 }}>Log in</span>
                </button>
                <a
                  href="https://buymeacoffee.com/frederickk1" target="_blank" rel="noopener noreferrer"
                  className="ob-bmc" style={{ marginTop: 10 }}
                >
                  <span style={{ fontSize: 14 }}>☕</span>
                  <span style={{ fontFamily: UI, fontSize: 12, fontWeight: 600, color: '#141413' }}>Buy me a coffee</span>
                  <span style={{ fontFamily: BODY, fontSize: 11, color: '#71716b' }}>— support the build</span>
                </a>
              </div>
            </div>
          )}

          {/* ── 1 · INVITE ── */}
          {step === 1 && showChrome && (
            <div key="s1" style={stepAnimStyle}>
              <div style={stepPad}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 11px', borderRadius: 9999, background: '#dcfce7', fontFamily: UI, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0a3622', marginBottom: 14 }}>
                  <Ic name="key-round" size={12} color="#16a34a" />
                  Private beta
                </span>
                <StepHeading title="Unlock your plot" sub="Greenplot is invite-only. Enter the 6-character code from your invite." />

                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 9 }}>
                    {[0, 1, 2, 3, 4, 5].map((i) => {
                      const ch = token[i] || ''
                      const caret = i === token.length && tokenState === 'idle'
                      const valid = tokenState === 'valid'
                      const ring = valid ? 'inset 0 0 0 2px #22c55e' : ch ? 'inset 0 0 0 1.5px #ccc9c0' : 'inset 0 0 0 1px #e8e6df'
                      return (
                        <div key={i} style={{ position: 'relative', flex: 1, maxWidth: 58, height: 64, borderRadius: 14, background: valid ? '#f0fdf4' : '#ffffff', boxShadow: ring, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: UI, fontSize: 24, fontWeight: 600, color: '#141413', transition: 'all .25s', transform: valid ? 'translateY(-2px)' : undefined }}>
                          {ch}
                          {caret && <span style={{ position: 'absolute', width: 2, height: 26, background: '#22c55e', borderRadius: 2, animation: 'gp-caret 1.1s steps(1) infinite' }} />}
                        </div>
                      )
                    })}
                  </div>
                  <input
                    value={token} onChange={onTokenInput} maxLength={6} spellCheck={false}
                    autoComplete="one-time-code" aria-label="Invite code" autoFocus
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, border: 'none', background: 'transparent', cursor: 'text', outline: 'none', fontSize: 24 }}
                  />
                </div>

                <div style={{ minHeight: 32 }}>
                  {tokenState === 'checking' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, animation: 'gp-fadeIn .3s ease both' }}>
                      <span style={{ width: 16, height: 16, borderRadius: 9999, border: '2px solid #dcfce7', borderTopColor: '#22c55e', animation: 'gp-spin .8s linear infinite', flexShrink: 0 }} />
                      <span style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 500, color: '#71716b' }}>Checking your invite…</span>
                    </div>
                  )}
                  {tokenState === 'valid' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, animation: 'gp-pop .4s cubic-bezier(.2,.8,.2,1) both' }}>
                      <span style={{ width: 20, height: 20, borderRadius: 9999, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ic name="check" size={12} color="#fff" />
                      </span>
                      <span style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 600, color: '#16a34a' }}>You&rsquo;re in. Welcome to the garden.</span>
                    </div>
                  )}
                  {tokenState === 'invalid' && (
                    <p style={{ fontFamily: BODY, fontSize: 13, color: '#b91c1c', margin: 0, animation: 'gp-fadeIn .3s ease both' }}>
                      That code didn&rsquo;t unlock — check for typos and try again.
                    </p>
                  )}
                  {tokenState === 'error' && (
                    <p style={{ fontFamily: BODY, fontSize: 13, color: '#b45309', margin: 0, animation: 'gp-fadeIn .3s ease both' }}>
                      Couldn&rsquo;t reach the garden — check your connection and try again.
                    </p>
                  )}
                  {tokenState === 'idle' && (
                    <p style={{ fontFamily: BODY, fontSize: 13, color: '#a3a29c', margin: 0 }}>
                      Paste works too — the code is in your invite email.
                    </p>
                  )}
                </div>

                <a href="/#waitlist" className="ob-quiet" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', fontSize: 13.5, textDecoration: 'none' }}>
                  No invite yet? <span style={{ color: '#16a34a', fontWeight: 600 }}>Join the waitlist</span>
                  <Ic name="arrow-up-right" size={13} color="#16a34a" />
                </a>
              </div>
            </div>
          )}

          {/* ── 2 · INTERESTS ── */}
          {step === 2 && showChrome && (
            <div key="s2" style={stepAnimStyle}>
              <div style={stepPad}>
                <StepHeading title="What should we plant?" sub="Your briefings, digests and wiki grow around these topics. Pick a few." />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 20 }}>
                  {INTERESTS.map((it) => {
                    const selected = interests.includes(it.label)
                    return (
                      <button
                        key={it.label} onClick={() => toggleInterest(it.label)} className="ob-chip"
                        style={{
                          position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, height: 42, padding: '0 15px',
                          border: 'none', borderRadius: 9999, cursor: 'pointer', fontFamily: UI, fontSize: 13, fontWeight: 500,
                          transition: 'all .22s cubic-bezier(.2,.8,.3,1)',
                          ...(selected
                            ? { background: '#16a34a', color: '#ffffff', boxShadow: '0 6px 16px -6px rgba(22,163,74,0.55)', transform: 'translateY(-1px)' }
                            : { background: '#ffffff', color: '#5f5f5a', boxShadow: 'inset 0 0 0 1px #e8e6df' }),
                        }}
                      >
                        <Ic name={it.icon} size={15} color={selected ? '#ffffff' : '#9ca39b'} />
                        {it.label}
                      </button>
                    )
                  })}
                </div>
                <div style={{ position: 'relative' }}>
                  <Ic name="plus" size={17} color="#22c55e" style={fieldIcon} />
                  <input
                    value={custom} onChange={(e) => { setCustom(e.target.value); persist({ custom: e.target.value }) }}
                    type="text" placeholder="Add your own — climate tech, typography…" className="ob-input"
                    style={{ height: 50 }}
                  />
                </div>
                <p style={{ fontFamily: BODY, fontSize: 13, color: '#a3a29c', margin: '12px 0 0 4px' }}>{selectedHint}</p>
              </div>
            </div>
          )}

          {/* ── 3 · RHYTHM ── */}
          {step === 3 && showChrome && (
            <div key="s3" style={stepAnimStyle}>
              <div style={{ ...stepPad }}>
                <StepHeading title="Find your rhythm" sub="How often should briefings reach you? Preview what arrives below." />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 }}>
                  {DIGESTS.map((d) => {
                    const selected = frequency === d.value
                    return (
                      <button
                        key={d.value} onClick={() => { setFrequency(d.value); persist({ frequency: d.value }) }} className="ob-card-btn"
                        style={{
                          position: 'relative', display: 'flex', alignItems: 'center', gap: 13, width: '100%', padding: '13px 16px',
                          border: 'none', borderRadius: 16, background: selected ? '#f0fdf4' : '#ffffff',
                          boxShadow: selected ? 'inset 0 0 0 1.5px #22c55e' : 'inset 0 0 0 1px #e8e6df',
                          cursor: 'pointer', textAlign: 'left', transition: 'all .2s',
                        }}
                      >
                        <span style={{ position: 'relative', flexShrink: 0, width: 21, height: 21, borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: selected ? '#22c55e' : 'transparent', boxShadow: selected ? 'none' : 'inset 0 0 0 1.5px #ccc9c0', transition: 'all .2s' }}>
                          {selected && <Ic name="check" size={12} color="#fff" style={{ animation: 'gp-pop .25s ease both' }} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontFamily: UI, fontSize: 14, fontWeight: 600, color: selected ? '#15803d' : '#141413' }}>{d.label}</span>
                          <span style={{ display: 'block', fontFamily: BODY, fontSize: 12.5, color: '#71716b', marginTop: 1 }}>{d.sublabel}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                  <Ic name="clock" size={15} color="#16a34a" />
                  <span style={{ fontFamily: UI, fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#71716b' }}>What arrives</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {CRON[frequency].map((p) => (
                    <div key={p.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 15px', borderRadius: 16, background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(10px)', boxShadow: 'inset 0 0 0 1px rgba(20,20,19,0.06)', animation: 'gp-fadeUp .4s ease both' }}>
                      <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 11, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Ic name={p.icon} size={17} color="#16a34a" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontFamily: UI, fontSize: 13.5, fontWeight: 600, color: '#141413' }}>{p.name}</span>
                          <span style={{ fontFamily: UI, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#16a34a', whiteSpace: 'nowrap' }}>{p.time}</span>
                        </div>
                        <p style={{ fontFamily: BODY, fontSize: 12.5, lineHeight: 1.5, color: '#5f5f5a', margin: '3px 0 0', textWrap: 'pretty' } as React.CSSProperties}>{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontFamily: BODY, fontSize: 12, color: '#a3a29c', margin: '14px 0 0' }}>Change anytime in Profile → Briefings.</p>
              </div>
            </div>
          )}

          {/* ── 4 · WEATHER / CITY ── */}
          {step === 4 && showChrome && (
            <div key="s4" style={stepAnimStyle}>
              <div style={stepPad}>
                <StepHeading title="Where does your day begin?" sub="Briefings open with your local weather and timing. Just a city — never your precise location." />
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <Ic name="map-pin" size={17} color="#22c55e" style={fieldIcon} />
                  <input
                    value={city} onChange={(e) => { setCity(e.target.value); persist({ city: e.target.value }) }}
                    type="text" placeholder="Your city — try Berlin, Lisbon, Tokyo…" className="ob-input"
                    style={{ height: 52 }}
                  />
                </div>
                {citySuggestions.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, animation: 'gp-fadeIn .25s ease both' }}>
                    {citySuggestions.map((c) => (
                      <button key={c} onClick={() => { setCity(c); persist({ city: c }) }} className="ob-suggest">{c}</button>
                    ))}
                  </div>
                )}
                {wx && (
                  <div style={{ marginTop: 14, borderRadius: 18, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', boxShadow: 'inset 0 0 0 1px rgba(20,20,19,0.06)', padding: 16, animation: 'gp-notif .45s cubic-bezier(.2,.8,.3,1) both' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 9999, background: '#22c55e', animation: 'gp-pulseDot 2.2s ease-in-out infinite' }} />
                      <span style={{ fontFamily: UI, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#71716b' }}>Tomorrow&rsquo;s briefing — preview</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ flexShrink: 0, width: 54, height: 54, borderRadius: 16, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Ic name={wx[1]} size={30} color="#16a34a" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 26, color: '#141413' }}>{wx[0]}</span>
                          <span style={{ fontFamily: UI, fontSize: 13, fontWeight: 600, color: '#141413' }}>{knownCity}</span>
                        </div>
                        <p style={{ fontFamily: BODY, fontSize: 12.5, lineHeight: 1.5, color: '#5f5f5a', margin: '3px 0 0', textWrap: 'pretty' } as React.CSSProperties}>
                          Good morning — clear start, then your latest on {interestsPicked}.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 5 · PUSH ── */}
          {step === 5 && showChrome && (
            <div key="s5" style={stepAnimStyle}>
              <div style={stepPad}>
                <StepHeading title="Hear the garden grow" sub="A gentle push when a briefing lands or a seed blooms into something bigger. Never noisy." />
                <div style={{ borderRadius: 18, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', boxShadow: 'inset 0 0 0 1px rgba(20,20,19,0.07), 0 14px 30px -18px rgba(20,40,25,0.35)', padding: '14px 16px', marginBottom: 22, display: 'flex', alignItems: 'flex-start', gap: 12, animation: 'gp-notif .55s cubic-bezier(.2,.8,.3,1) both' }}>
                  <div style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 11, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 5px 14px -5px rgba(34,197,94,0.6)' }}>
                    <Ic name="sprout" size={20} color="#ffffff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: UI, fontSize: 13, fontWeight: 600, color: '#141413' }}>Greenplot</span>
                      <span style={{ fontFamily: UI, fontSize: 10.5, color: '#a3a29c' }}>now</span>
                    </div>
                    <p style={{ fontFamily: BODY, fontSize: 13, lineHeight: 1.45, color: '#5f5f5a', margin: '2px 0 0' }}>Your morning briefing is ready — 3 new connections in your garden 🌱</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { value: 'yes', icon: 'bell-ring', title: 'Notify me', sub: 'Briefings arrive as gentle pushes' },
                    { value: 'later', icon: 'bell-off', title: 'Maybe later', sub: 'You can enable them in Profile' },
                  ].map((p) => {
                    const selected = pushChoice === p.value
                    return (
                      <button
                        key={p.value} onClick={() => { setPushChoice(p.value); persist({ pushChoice: p.value }) }} className="ob-card-btn"
                        style={{
                          position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, flex: 1, padding: 16,
                          border: 'none', borderRadius: 18, background: selected ? '#f0fdf4' : '#ffffff',
                          boxShadow: selected ? 'inset 0 0 0 1.5px #22c55e' : 'inset 0 0 0 1px #e8e6df',
                          cursor: 'pointer', textAlign: 'left', transition: 'all .2s',
                        }}
                      >
                        <span style={{ width: 38, height: 38, borderRadius: 12, background: selected ? '#dcfce7' : '#f4f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}>
                          <Ic name={p.icon} size={19} color={selected ? '#16a34a' : '#9a988f'} />
                        </span>
                        <span>
                          <span style={{ fontFamily: UI, fontSize: 14, fontWeight: 600, color: selected ? '#15803d' : '#141413' }}>{p.title}</span>
                          <span style={{ display: 'block', fontFamily: BODY, fontSize: 12, lineHeight: 1.45, color: '#71716b', marginTop: 2 }}>{p.sub}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {isIOS && !isStandalone ? (
                  <div style={{ marginTop: 14, borderRadius: 16, background: '#ffffff', boxShadow: 'inset 0 0 0 1px #e8e6df', padding: '13px 15px' }}>
                    <span style={{ display: 'block', fontFamily: UI, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 10 }}>
                      Add to Home Screen — pushes need this on iPhone
                    </span>
                    {[
                      { icon: 'arrow-up-right', text: <>Tap <strong>Share</strong> in Safari&rsquo;s toolbar</> },
                      { icon: 'plus', text: <>Choose <strong>Add to Home Screen</strong></> },
                      { icon: 'bell-ring', text: <>Open Greenplot from your home screen — done</> },
                    ].map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i === 2 ? 0 : 8 }}>
                        <span style={{ width: 26, height: 26, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ic name={s.icon} size={13} color="#16a34a" />
                        </span>
                        <span style={{ fontFamily: BODY, fontSize: 12.5, lineHeight: 1.5, color: '#5f5f5a' }}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontFamily: BODY, fontSize: 12, color: '#a3a29c', margin: '14px 0 0' }}>
                    On iPhone, add Greenplot to your home screen to receive pushes.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── 6 · PRIVACY ── */}
          {step === 6 && showChrome && (
            <div key="s6" style={stepAnimStyle}>
              <div style={stepPad}>
                <StepHeading title="Your garden, your rules" sub="Choose what Greenplot may do with your seeds. Every switch can be changed later." />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {[
                    { key: 'enrich', icon: 'sparkles', title: 'AI enrichment', sub: 'Seeds are summarized, tagged & connected by AI' },
                    { key: 'web', icon: 'globe', title: 'Web research', sub: 'Greenplot may search the web to enrich your topics' },
                    { key: 'calendar', icon: 'calendar-days', title: 'Google Calendar', sub: 'Briefings reference your day & avoid meetings' },
                  ].map((c) => {
                    const on = !!consent[c.key]
                    return (
                      <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderRadius: 17, background: '#ffffff', boxShadow: 'inset 0 0 0 1px #e8e6df' }}>
                        <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, background: on ? '#dcfce7' : '#f4f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}>
                          <Ic name={c.icon} size={18} color={on ? '#16a34a' : '#9a988f'} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontFamily: UI, fontSize: 13.5, fontWeight: 600, color: '#141413' }}>{c.title}</span>
                          <span style={{ display: 'block', fontFamily: BODY, fontSize: 12, lineHeight: 1.45, color: '#71716b', marginTop: 1 }}>{c.sub}</span>
                        </span>
                        <button
                          onClick={() => { const next = { ...consent, [c.key]: !on }; setConsent(next); persist({ consent: next }) }}
                          aria-label={c.title} role="switch" aria-checked={on}
                          style={{ position: 'relative', flexShrink: 0, width: 46, height: 27, borderRadius: 9999, background: on ? '#22c55e' : '#dddbd3', transition: 'background .25s', cursor: 'pointer', border: 'none', padding: 0 }}
                        >
                          <span style={{ position: 'absolute', top: 2.5, left: on ? 21.5 : 2.5, width: 22, height: 22, borderRadius: 9999, background: '#ffffff', boxShadow: '0 1px 4px rgba(20,20,19,0.25)', transition: 'left .25s cubic-bezier(.3,.9,.4,1)' }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '13px 16px', borderRadius: 15, background: '#f4f4f1' }}>
                  <Ic name="shield-check" size={16} color="#71716b" style={{ marginTop: 1 }} />
                  <p style={{ fontFamily: BODY, fontSize: 12.5, lineHeight: 1.55, color: '#5f5f5a', margin: 0, textWrap: 'pretty' } as React.CSSProperties}>
                    Your seeds are yours. Stored encrypted, never used to train models, exportable anytime.{' '}
                    <a href="/privacy" style={{ color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}>Privacy policy</a>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── 7 · ACCOUNT ── */}
          {step === 7 && showChrome && (
            <div key="s7" style={stepAnimStyle}>
              <div style={stepPad}>
                <StepHeading title="Claim your plot" sub="Last step — everything you chose is saved to your account." />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                  <div>
                    <label style={fieldLabel}>Email</label>
                    <div style={{ position: 'relative' }}>
                      <Ic name="mail" size={17} color="#22c55e" style={fieldIcon} />
                      <input value={email} onChange={(e) => { setEmail(e.target.value); persist({ email: e.target.value }) }} type="email" placeholder="you@example.com" className="ob-input" style={{ height: 50 }} />
                    </div>
                  </div>
                  <div>
                    <label style={fieldLabel}>Nickname <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: '#a3a29c' }}>· optional</span></label>
                    <div style={{ position: 'relative' }}>
                      <Ic name="leaf" size={17} color="#22c55e" style={fieldIcon} />
                      <input value={nickname} onChange={(e) => { setNickname(e.target.value); persist({ nickname: e.target.value }) }} type="text" placeholder="Seedling_42" className="ob-input" style={{ height: 50 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 11 }}>
                    <div style={{ flex: 1 }}>
                      <label style={fieldLabel}>Password</label>
                      <div style={{ position: 'relative' }}>
                        <Ic name="lock" size={17} color="#22c55e" style={fieldIcon} />
                        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••" className="ob-input" style={{ height: 50, paddingRight: 14 }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={fieldLabel}>Confirm</label>
                      <div style={{ position: 'relative' }}>
                        <Ic name="lock-keyhole" size={17} color="#22c55e" style={fieldIcon} />
                        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" placeholder="••••••" className="ob-input" style={{ height: 50, paddingRight: 14 }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 2 }}>
                    {[
                      { label: 'Valid email', ok: emailValid },
                      { label: '6+ characters', ok: pwOk },
                      { label: 'Passwords match', ok: matchOk },
                    ].map((c) => (
                      <span key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px', borderRadius: 9999, fontFamily: UI, fontSize: 11, fontWeight: 600, transition: 'all .25s', ...(c.ok ? { background: '#dcfce7', color: '#15803d' } : { background: '#f4f4f1', color: '#a3a29c' }) }}>
                        <Ic name={c.ok ? 'check' : 'circle'} size={12} color={c.ok ? '#16a34a' : '#c4c2ba'} />
                        {c.label}
                      </span>
                    ))}
                  </div>
                  {error && (
                    <div style={{ padding: '12px 16px', borderRadius: 14, background: '#fef2f2', boxShadow: 'inset 0 0 0 1px #fecaca', fontFamily: BODY, fontSize: 13, color: '#b91c1c', animation: 'gp-fadeIn .3s ease both' }}>
                      {error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── PLANTING ── */}
          {planting && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 36px', animation: 'gp-fadeIn .4s ease both' }}>
              <div style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
                <div style={{ position: 'absolute', width: 150, height: 150, borderRadius: 9999, background: 'radial-gradient(circle, rgba(34,197,94,0.24), transparent 68%)', animation: 'gp-breathe 2.4s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', width: 150, height: 150, borderRadius: 9999, border: '2px solid #dcfce7', borderTopColor: '#22c55e', animation: 'gp-spin 1s linear infinite' }} />
                <Ic name="sprout" size={52} color="#22c55e" />
              </div>
              <h2 style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 30, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 22px', color: '#141413' }}>Preparing your garden…</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, width: '100%', maxWidth: 250, textAlign: 'left' }}>
                {[
                  { text: 'Planting your topics', delay: '.1s' },
                  { text: 'Tuning your briefings', delay: '.9s' },
                  { text: 'Securing your plot', delay: '1.7s' },
                ].map((t) => (
                  <div key={t.text} style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'gp-tick .4s ease both', animationDelay: t.delay }}>
                    <Ic name="circle-check" size={18} color="#22c55e" />
                    <span style={{ fontFamily: BODY, fontSize: 14, color: '#141413' }}>{t.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── DONE · BLOOM ── */}
          {done && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 34px', position: 'relative', background: 'radial-gradient(80% 50% at 50% 38%, rgba(34,197,94,0.1), transparent 70%)', animation: 'gp-fadeIn .5s ease both' }}>
              <div style={{ position: 'absolute', left: '30%', bottom: '34%', width: 7, height: 7, borderRadius: 9999, background: '#22c55e', animation: 'gp-rise 2.6s ease-in infinite', animationDelay: '.2s' }} />
              <div style={{ position: 'absolute', left: '62%', bottom: '30%', width: 5, height: 5, borderRadius: 9999, background: '#14b8a6', animation: 'gp-rise 3.1s ease-in infinite', animationDelay: '.9s' }} />
              <div style={{ position: 'absolute', left: '46%', bottom: '36%', width: 6, height: 6, borderRadius: 9999, background: '#86efac', animation: 'gp-rise 2.9s ease-in infinite', animationDelay: '1.5s' }} />

              <div style={{ position: 'relative', width: 150, height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 26, animation: 'gp-pop .6s cubic-bezier(.2,.8,.2,1) both' }}>
                <div style={{ position: 'absolute', width: 150, height: 150, borderRadius: 9999, background: 'radial-gradient(circle, rgba(34,197,94,0.22), transparent 68%)', animation: 'gp-breathe 5s ease-in-out infinite' }} />
                <div style={{ position: 'relative', width: 118, height: 118, borderRadius: 9999, background: 'rgba(255,255,255,0.66)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(20,20,19,0.06), 0 14px 32px -16px rgba(20,40,25,0.45)' }}>
                  <Ic name="sprout" size={54} color="#22c55e" />
                </div>
              </div>

              <span style={{ fontFamily: UI, fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 12 }}>Your garden is ready</span>
              <h2 style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 400, fontSize: 40, lineHeight: 1.06, letterSpacing: '-0.02em', margin: '0 0 14px', maxWidth: 320, color: '#141413', textWrap: 'balance' } as React.CSSProperties}>Welcome, {displayName}</h2>
              <p style={{ fontFamily: BODY, fontSize: 15, lineHeight: 1.6, color: '#5f5f5a', maxWidth: 290, margin: '0 0 30px', textWrap: 'pretty' } as React.CSSProperties}>
                Everything&rsquo;s planted. Capture your first thought and watch it grow.
              </p>

              <button onClick={() => router.push('/chat')} className="ob-cta" style={{ maxWidth: 290 }}>
                <span className="ob-sheen" />
                <span style={{ position: 'relative' }}>Open Greenplot</span>
                <Ic name="arrow-right" size={18} color="#ffffff" style={{ position: 'relative' }} />
              </button>

              <div style={{ marginTop: 18, width: '100%', maxWidth: 320, borderRadius: 16, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', boxShadow: 'inset 0 0 0 1px rgba(20,20,19,0.06)', padding: '12px 15px', display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left' }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <Ic name="sparkles" size={14} color="#16a34a" />
                </span>
                <p style={{ fontFamily: BODY, fontSize: 12, lineHeight: 1.55, color: '#5f5f5a', margin: 0, textWrap: 'pretty' } as React.CSSProperties}>
                  You&rsquo;re in a private beta — your feedback shapes Greenplot. Spotted a bug or
                  wished for a feature? Send it anytime from <strong style={{ color: '#141413' }}>Settings → &ldquo;Got an idea?&rdquo;</strong> — it lands directly with Freddy.
                </p>
              </div>

              <a
                href="https://buymeacoffee.com/frederickk1" target="_blank" rel="noopener noreferrer"
                className="ob-quiet" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, fontFamily: UI, fontSize: 12.5, fontWeight: 500, textDecoration: 'none' }}
              >
                <span style={{ fontSize: 14 }}>☕</span>
                Buy me a coffee — support the build
              </a>
            </div>
          )}
        </div>

        {/* ░░ FOOTER CTA ░░ */}
        {showChrome && (
          <div style={{ position: 'sticky', bottom: 0, zIndex: 6, padding: '14px 28px calc(18px + env(safe-area-inset-bottom))', background: 'linear-gradient(transparent, #fafaf8 32%)' }}>
            <div style={{ width: '100%', maxWidth: 470, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ctaDisabled ? (
                <div style={{ width: '100%', height: 54, borderRadius: 9999, background: '#eeeeec', color: '#b9b8b3', fontFamily: UI, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'not-allowed' }}>
                  {ctaLabel}
                  <Ic name="arrow-right" size={18} color="#b9b8b3" />
                </div>
              ) : (
                <button onClick={next} className="ob-cta">
                  <span className="ob-sheen" />
                  <span style={{ position: 'relative' }}>{ctaLabel}</span>
                  <Ic name={step === 7 ? 'sprout' : 'arrow-right'} size={18} color="#ffffff" style={{ position: 'relative' }} />
                </button>
              )}
              {(step === 4 || step === 5) && (
                <button onClick={next} className="ob-skip">
                  {step === 4 ? 'Skip — briefings without weather' : 'Not now'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gp-slideL { from { opacity: 0; transform: translateX(36px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes gp-slideR { from { opacity: 0; transform: translateX(-36px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes gp-fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gp-fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gp-pop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes gp-breathe { 0%,100% { transform: scale(1); opacity: .55; } 50% { transform: scale(1.14); opacity: .9; } }
        @keyframes gp-spin { to { transform: rotate(360deg); } }
        @keyframes gp-spinR { to { transform: rotate(-360deg); } }
        @keyframes gp-pulseDot { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: .45; } }
        @keyframes gp-caret { 0%,45% { opacity: 1; } 55%,100% { opacity: 0; } }
        @keyframes gp-notif { 0% { opacity: 0; transform: translateY(-22px) scale(.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes gp-rise { 0% { transform: translateY(20px) scale(.4); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(-150px) scale(1); opacity: 0; } }
        @keyframes gp-sheen { 0% { transform: translateX(-130%); } 60%,100% { transform: translateX(130%); } }
        @keyframes gp-tick { 0% { opacity: .2; } 100% { opacity: 1; } }

        .ob-page { min-height: 100dvh; width: 100%; display: flex; background: #fafaf8; color: #141413; }
        .ob-flow { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 100dvh; }
        .ob-side { display: none; }
        @media (min-width: 1024px) {
          .ob-side {
            display: flex; width: 340px; flex-shrink: 0; background: #f1f1ed; border-right: 1px solid #e8e6df;
            flex-direction: column; justify-content: space-between; padding: 34px 32px;
            position: sticky; top: 0; height: 100dvh; overflow: hidden;
          }
        }
        .ob-chrome {
          padding: calc(env(safe-area-inset-top) + 26px) 28px 12px;
          position: sticky; top: 0; z-index: 6; background: #fafaf8;
        }
        .ob-back {
          border: none; background: transparent; padding: 4px 6px 4px 0; margin: 0; cursor: pointer;
          display: flex; align-items: center; gap: 6px; color: #71716b;
          font-family: ${UI}; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; transition: color .2s;
        }
        .ob-back:hover { color: #141413; }
        .ob-input {
          width: 100%; border: none; border-radius: 15px; background: #ffffff;
          box-shadow: inset 0 0 0 1px #e8e6df; padding: 0 16px 0 44px;
          font-family: ${BODY}; font-size: 15px; color: #141413; outline: none; transition: box-shadow .2s;
        }
        .ob-input:focus { box-shadow: inset 0 0 0 2px #22c55e; }
        .ob-input::placeholder { color: #a3a29c; }
        .ob-chip:active { transform: scale(0.93) !important; }
        .ob-card-btn:active { transform: scale(0.99); }
        .ob-suggest {
          height: 34px; padding: 0 14px; border: none; border-radius: 9999px; background: #ffffff;
          box-shadow: inset 0 0 0 1px #e8e6df; cursor: pointer;
          font-family: ${UI}; font-size: 12.5px; font-weight: 500; color: #5f5f5a; transition: all .15s;
        }
        .ob-suggest:hover { box-shadow: inset 0 0 0 1.5px #22c55e; color: #16a34a; }
        .ob-cta {
          position: relative; overflow: hidden; width: 100%; height: 54px; border: none; border-radius: 9999px;
          background: #22c55e; color: #fff; font-family: ${UI}; font-size: 15px; font-weight: 600; letter-spacing: 0.01em;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 9px;
          box-shadow: 0 10px 26px -10px rgba(34,197,94,0.6); transition: all .2s;
        }
        .ob-cta:hover { background: #16a34a; transform: translateY(-1px); box-shadow: 0 14px 32px -10px rgba(34,197,94,0.7); }
        .ob-cta:active { transform: scale(0.985); }
        .ob-sheen {
          position: absolute; top: 0; left: 0; width: 40%; height: 100%;
          background: linear-gradient(100deg, transparent, rgba(255,255,255,0.4), transparent);
          animation: gp-sheen 3s ease-in-out infinite;
        }
        .ob-skip {
          border: none; background: transparent; cursor: pointer; padding: 2px;
          font-family: ${UI}; font-size: 12.5px; font-weight: 500; color: #a3a29c; transition: color .2s;
        }
        .ob-skip:hover { color: #71716b; }
        .ob-quiet {
          border: none; background: transparent; cursor: pointer; padding: 6px 0;
          font-family: ${BODY}; font-size: 13px; color: #71716b; transition: color .2s;
        }
        .ob-quiet:hover { color: #141413; }
        .ob-bmc {
          display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px;
          border-radius: 9999px; background: rgba(255,221,0,0.12);
          box-shadow: inset 0 0 0 1px rgba(255,221,0,0.35); text-decoration: none;
          transition: all .2s;
        }
        .ob-bmc:hover { background: rgba(255,221,0,0.2); box-shadow: inset 0 0 0 1px rgba(255,221,0,0.6); }
        .ob-bmc:active { transform: scale(0.98); }
      ` }} />
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  )
}
