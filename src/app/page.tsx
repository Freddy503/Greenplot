'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Leaf, Bell, Bot, BookOpen, Calendar, Mic,
  Share2, Server, PlusCircle, Zap, TrendingUp, ArrowUp, ArrowRight,
  Search, Mail, FileText, Layers, CheckCircle2,
  Shield, Activity, Menu, X, Star, Globe,
} from 'lucide-react'

// ── Design tokens ─────────────────────────────────────────────────────────
const T = {
  bg: '#fafaf8', surface: '#ffffff',
  green: '#22c55e', darkGreen: '#14532d', teal: '#14b8a6',
  text: '#141413', text2: '#5f5f5a',
  border: '#e8e6df', container: '#dcfce7',
}

// ── CSS ───────────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  :root {
    --font-display: 'Instrument Serif', Georgia, serif;
    --font-body: 'Barlow', sans-serif;
    --font-ui: 'Sora', sans-serif;
  }
  .liquid-glass-strong {
    background: rgba(255,255,255,0.01);
    backdrop-filter: blur(50px);
    -webkit-backdrop-filter: blur(50px);
    box-shadow: 4px 4px 4px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.15);
    position: relative;
    overflow: hidden;
  }
  .liquid-glass-strong::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1.4px;
    background: linear-gradient(180deg,
      rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 20%,
      rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%,
      rgba(255,255,255,0.2) 80%, rgba(255,255,255,0.5) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }
  .liquid-glass {
    background: rgba(255,255,255,0.01);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.1);
    position: relative;
    overflow: hidden;
  }
  .liquid-glass::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1.4px;
    background: linear-gradient(180deg,
      rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%,
      rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%,
      rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }
  @keyframes fade-rise {
    from { opacity:0; transform:translateY(24px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .fade-rise   { animation: fade-rise 0.9s ease-out both; }
  .fade-rise-2 { animation: fade-rise 0.9s ease-out 0.2s both; }
  .fade-rise-3 { animation: fade-rise 0.9s ease-out 0.4s both; }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(28px);}to{opacity:1;transform:translateY(0);} }
  @keyframes fadeIn  { from{opacity:0;}to{opacity:1;} }
  @keyframes cursor-blink { 0%,100%{opacity:1;}50%{opacity:0;} }
  @keyframes float   { 0%,100%{transform:translateY(0);}50%{transform:translateY(-8px);} }
  @keyframes flow    { 0%{stroke-dashoffset:200;opacity:0;}40%{opacity:1;}100%{stroke-dashoffset:0;opacity:0;} }
  @keyframes pulse-ring { 0%{transform:scale(1);opacity:0.6;}100%{transform:scale(1.8);opacity:0;} }
  @keyframes slide-in{ from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:translateX(0);} }
  @keyframes node-pulse { 0%,100%{transform:scale(1);}50%{transform:scale(1.12);} }

  @media (max-width: 768px) {
    .nav-links { display: none !important; }
    .hamburger { display: flex !important; }
    .features-grid { grid-template-columns: 1fr !important; }
    .features-list { order: 2 !important; }
    .features-panel { order: 1 !important; }
    .flywheel-arrow { display: none !important; }
    .flywheel-steps { flex-direction: column !important; align-items: stretch !important; }
    .flywheel-card { min-width: unset !important; }
    .pillar-row { grid-template-columns: 1fr !important; gap: 1.75rem !important; }
    .pillar-row > div { order: unset !important; }
    .link-flow { flex-direction: column !important; align-items: stretch !important; }
    .link-flow > div { max-width: none !important; }
    .link-arrow { transform: rotate(90deg) !important; justify-content: center !important; padding: 0.25rem 0 !important; }
  }
`

// ── useInView ─────────────────────────────────────────────────────────────
function useInView() {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect() } },
      { threshold: 0.1 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, inView] as const
}

// ── Icon ──────────────────────────────────────────────────────────────────
type IconName =
  | 'eco' | 'notifications' | 'smart_toy' | 'search'
  | 'auto_stories' | 'layers' | 'calendar_month' | 'mic'
  | 'hub' | 'dns' | 'add_circle' | 'auto_awesome'
  | 'trending_up' | 'arrow_upward' | 'arrow_right' | 'mail' | 'file_text'
  | 'check' | 'shield' | 'activity' | 'sparkles' | 'globe'

const ICON_MAP: Record<IconName, React.ElementType> = {
  eco: Leaf, notifications: Bell, smart_toy: Bot, search: Search,
  auto_stories: BookOpen, layers: Layers, calendar_month: Calendar, mic: Mic,
  hub: Share2, dns: Server, add_circle: PlusCircle, auto_awesome: Zap,
  trending_up: TrendingUp, arrow_upward: ArrowUp, arrow_right: ArrowRight,
  mail: Mail, file_text: FileText, check: CheckCircle2, shield: Shield,
  activity: Activity, sparkles: Star, globe: Globe,
}

function Icon({ name, size = 24, color = T.green, style = {}, strokeWidth = 1.75 }: {
  name: IconName; size?: number; color?: string; style?: React.CSSProperties; strokeWidth?: number
}) {
  const C = ICON_MAP[name]
  if (!C) return <span style={{ width: size, height: size, display: 'inline-block', ...style }} />
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}>
      <C size={size} color={color} strokeWidth={strokeWidth} />
    </span>
  )
}

// ── Logo ──────────────────────────────────────────────────────────────────
function Logo({ size = 20, light = false }: { size?: number; light?: boolean }) {
  const textColor = light ? '#fff' : T.darkGreen
  const leafFill = light ? 'rgba(255,255,255,0.15)' : T.container
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={size + 6} height={size + 6} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill={leafFill} />
        <path d="M16 26 C14 20 9 17 9 12 C9 8.5 12 6 16 6 C20 6 23 8.5 23 12 C23 17 18 20 16 26Z"
          fill={light ? 'rgba(255,255,255,0.35)' : T.green} opacity={light ? 1 : 0.3} />
        <path d="M16 26 C16 19 20.5 16 21.5 12.5 C22 10.5 21 8.5 19.5 7.5 C22 9 23 12 22 15 C21 18 18 21 16 26Z"
          fill={light ? 'rgba(255,255,255,0.7)' : T.green} opacity={light ? 1 : 0.6} />
        <path d="M16 26 L16 14" stroke={light ? '#fff' : T.darkGreen} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span style={{ fontWeight: 700, fontSize: size, color: textColor, letterSpacing: '-0.02em', fontFamily: 'var(--font-ui)' }}>
        Greenplot
      </span>
    </div>
  )
}

// ── Navbar ────────────────────────────────────────────────────────────────
function Navbar({ heroVisible }: { heroVisible: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const light = heroVisible && !menuOpen
  return (
    <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, transition: 'all 0.4s ease' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo size={20} light={light} />
          <div className="nav-links" style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            {[{ label: 'Features', href: '#features' }, { label: 'How it works', href: '#how-it-works' }].map(l => (
              <a key={l.label} href={l.href} style={{
                color: light ? 'rgba(255,255,255,0.7)' : T.text2,
                textDecoration: 'none', fontSize: 13, fontWeight: 500,
                fontFamily: 'var(--font-ui)', transition: 'color 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = light ? '#fff' : T.darkGreen)}
                onMouseLeave={e => (e.currentTarget.style.color = light ? 'rgba(255,255,255,0.7)' : T.text2)}
              >{l.label}</a>
            ))}
            <a href="#waitlist" className="liquid-glass" style={{
              borderRadius: 999, padding: '9px 22px', fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-ui)', color: light ? '#fff' : T.darkGreen,
              background: light ? 'rgba(255,255,255,0.08)' : 'rgba(20,83,45,0.07)',
              transition: 'transform 0.18s ease', textDecoration: 'none', display: 'inline-block',
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >Get early access</a>
          </div>
          <button onClick={() => setMenuOpen(o => !o)} className="hamburger"
            style={{
              display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              flexDirection: 'column', gap: 5, alignItems: 'center', justifyContent: 'center',
            }}>
            {menuOpen
              ? <X size={22} color={light ? '#fff' : T.darkGreen} />
              : <Menu size={22} color={light ? '#fff' : T.darkGreen} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{
            padding: '1rem 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
            borderTop: '1px solid rgba(255,255,255,0.1)', background: '#0f1b16',
          }}>
            {[{ label: 'Features', href: '#features' }, { label: 'How it works', href: '#how-it-works' }].map(l => (
              <a key={l.label} href={l.href} onClick={() => setMenuOpen(false)}
                style={{ color: '#fff', textDecoration: 'none', fontSize: 16, fontWeight: 600, padding: '0.25rem 0', fontFamily: 'var(--font-ui)' }}>
                {l.label}
              </a>
            ))}
            <a href="#waitlist" onClick={() => setMenuOpen(false)} style={{
              marginTop: '0.5rem', background: T.green, color: '#fff', borderRadius: 999,
              padding: '14px 28px', fontSize: 16, fontWeight: 700,
              fontFamily: 'var(--font-ui)', display: 'inline-block', textDecoration: 'none', width: 'fit-content',
            }}>Get early access</a>
          </div>
        )}
      </div>
    </nav>
  )
}

// ── Prompt Box ────────────────────────────────────────────────────────────
const THOUGHTS = [
  'Pressure-test my product idea…',
  'Brainstorm angles on attention restoration…',
  'Strategize a go-to-market for my app…',
  'Ground my next build in real research…',
]

function PromptBox() {
  const [text, setText] = useState('')
  const [idx, setIdx] = useState(0)
  const [ci, setCi] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'pause' | 'delete'>('typing')
  useEffect(() => {
    const t = THOUGHTS[idx]
    let timer: ReturnType<typeof setTimeout>
    if (phase === 'typing') {
      if (ci < t.length) timer = setTimeout(() => { setText(t.slice(0, ci + 1)); setCi(c => c + 1) }, 46)
      else timer = setTimeout(() => setPhase('pause'), 1800)
    } else if (phase === 'pause') {
      timer = setTimeout(() => setPhase('delete'), 300)
    } else {
      if (ci > 0) timer = setTimeout(() => { setText(t.slice(0, ci - 1)); setCi(c => c - 1) }, 22)
      else { setIdx(i => (i + 1) % THOUGHTS.length); setPhase('typing') }
    }
    return () => clearTimeout(timer)
  }, [text, ci, phase, idx])
  return (
    <div style={{
      background: 'rgba(255,255,255,0.07)', borderRadius: '1.25rem',
      border: '1.5px solid rgba(34,197,94,0.35)',
      boxShadow: '0 0 0 5px rgba(34,197,94,0.06), 0 12px 48px rgba(0,0,0,0.3)',
      padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.7rem',
      maxWidth: 580, width: '100%', animation: 'float 4s ease-in-out infinite',
    }}>
      <Icon name="eco" size={20} color={T.green} />
      <span style={{ flex: 1, fontSize: 15, color: text ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)', minHeight: 22, fontFamily: 'var(--font-body)' }}>
        {text}
        <span style={{ animation: 'cursor-blink 1s step-end infinite', color: T.green }}>|</span>
        {!text && <span style={{ color: 'rgba(255,255,255,0.35)' }}>Ask your thinking partner…</span>}
      </span>
      <button style={{
        background: T.green, border: 'none', borderRadius: 999, width: 34, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
      }}>
        <Icon name="arrow_upward" size={16} color="#fff" />
      </button>
    </div>
  )
}

// ── Hero Waitlist (inline) ────────────────────────────────────────────────
function HeroWaitlist() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('Please enter a valid email address.')

  const submit = async () => {
    if (!email.includes('@') || email.length < 5) { setStatus('error'); return }
    setStatus('loading')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) {
        setStatus('done')
      } else {
        const data = await res.json().catch(() => ({}))
        setErrorMsg((data as { error?: string }).error || 'Something went wrong. Please try again.')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  if (status === 'done') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      <div className="liquid-glass" style={{ borderRadius: '1rem', padding: '1rem 2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Icon name="check" size={20} color={T.green} />
        <span style={{ fontSize: 15, color: '#fff', fontFamily: 'var(--font-ui)', fontWeight: 500 }}>You&apos;re on the list!</span>
      </div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>
        We&apos;ll be in touch when your garden is ready to grow.
      </p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', width: '100%', maxWidth: 520 }}>
      <div style={{ display: 'flex', gap: '0.6rem', width: '100%', flexWrap: 'wrap', justifyContent: 'center' }}>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setStatus('idle') }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="your@email.com"
          style={{
            flex: 1, minWidth: 200, padding: '14px 20px', borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.18)'}`,
            color: '#fff', fontSize: 15, fontFamily: 'var(--font-body)', fontWeight: 400,
            outline: 'none', transition: 'border 0.2s', backdropFilter: 'blur(8px)',
          }}
          onFocus={e => (e.target.style.borderColor = 'rgba(34,197,94,0.6)')}
          onBlur={e => (e.target.style.borderColor = status === 'error' ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.18)')}
        />
        <button className="liquid-glass" onClick={submit} disabled={status === 'loading'}
          style={{
            borderRadius: 999, padding: '14px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            color: '#fff', fontFamily: 'var(--font-ui)', background: 'rgba(34,197,94,0.25)',
            border: 'none', whiteSpace: 'nowrap', transition: 'transform 0.18s',
            opacity: status === 'loading' ? 0.7 : 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
        >{status === 'loading' ? 'Joining…' : 'Join the waitlist'}</button>
      </div>
      {status === 'error' && <p style={{ fontSize: 12, color: 'rgba(239,68,68,0.8)', fontFamily: 'var(--font-body)' }}>{errorMsg}</p>}
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>No spam. Unsubscribe anytime.</p>
    </div>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────
function Hero({ onVisibilityChange }: { onVisibilityChange: (v: boolean) => void }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => onVisibilityChange(e.isIntersecting),
      { threshold: 0.1 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [onVisibilityChange])
  return (
    <section ref={ref} style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: 'hsl(201,100%,13%)' }}>
      <video autoPlay loop muted playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}>
        <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4" type="video/mp4" />
      </video>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'linear-gradient(to bottom,rgba(0,0,0,0.3) 0%,rgba(0,0,0,0.05) 50%,rgba(0,0,0,0.55) 100%)',
      }} />
      <div style={{
        position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
        padding: 'clamp(5rem,10vw,7rem) 1.5rem clamp(4rem,8vw,6rem)', textAlign: 'center',
      }}>
        <div className="liquid-glass fade-rise" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          borderRadius: 999, padding: '5px 16px', marginBottom: '2.5rem', cursor: 'default',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-ui)', letterSpacing: '0.04em' }}>
            Now in early access
          </span>
        </div>
        <h1 className="fade-rise" style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(42px,8vw,82px)', fontWeight: 400,
          color: '#fff', lineHeight: 1.0, letterSpacing: '-0.03em', maxWidth: 900, marginBottom: '2rem',
        }}>
          Grow your ideas into<br />
          <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.5)' }}>things worth building.</em>
        </h1>
        <p className="fade-rise-2" style={{
          fontFamily: 'var(--font-body)', fontSize: 'clamp(16px,2vw,19px)',
          color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, maxWidth: 600, marginBottom: '2.75rem', fontWeight: 400,
        }}>
          A living garden for your ideas — where every seed of thought grows into knowledge that
          never fades, a partner helps you think it through, and the gap from idea to build finally closes.
        </p>
        <div className="fade-rise-3" style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '3.5rem' }}>
          <HeroWaitlist />
        </div>
        <div className="fade-rise-3" style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '0 1rem' }}>
          <PromptBox />
        </div>
      </div>
      <div style={{
        position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: 0.45,
      }}>
        <span style={{ fontSize: 10, color: '#fff', fontFamily: 'var(--font-ui)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Scroll</span>
        <div style={{ width: 1, height: 28, background: 'linear-gradient(to bottom,#fff,transparent)' }} />
      </div>
    </section>
  )
}

// ── Two Pillars ───────────────────────────────────────────────────────────
function MemoryTimelineMockup() {
  const items = [
    { when: 'Today', t: 'The right abstraction for this feature', heat: 1 },
    { when: '3 weeks ago', t: 'The app I actually want to build next', heat: 0.7 },
    { when: '5 months ago', t: 'Pricing models, from first principles', heat: 0.42 },
    { when: 'Last year', t: 'Notes from a founder dinner', heat: 0.28 },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', position: 'relative' }}>
      <div style={{
        position: 'absolute', left: 6, top: 8, bottom: 8, width: 1.5,
        background: 'linear-gradient(to bottom,rgba(34,197,94,0.5),rgba(34,197,94,0.08))',
      }} />
      {items.map((it, i) => (
        <div key={it.t} style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-start', padding: '0.6rem 0' }}>
          <div style={{
            width: 13, height: 13, borderRadius: '50%', flexShrink: 0, marginTop: 3, zIndex: 1,
            background: '#0f1b16', border: '2px solid ' + T.green,
            opacity: 0.35 + it.heat * 0.65,
            boxShadow: i === 0 ? '0 0 0 4px rgba(34,197,94,0.15)' : 'none',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: `rgba(255,255,255,${0.45 + it.heat * 0.5})`, fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>{it.t}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-ui)', letterSpacing: '0.04em', marginTop: 2 }}>{it.when}</div>
          </div>
          {i === 0 && <span style={{ fontSize: 9, fontWeight: 700, color: T.green, background: 'rgba(34,197,94,0.18)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap', marginTop: 2, fontFamily: 'var(--font-ui)' }}>TOP OF MIND</span>}
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: '0.6rem', paddingLeft: 2 }}>
        <Icon name="check" size={12} color={T.green} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)' }}>Recent thinking rises. Nothing is ever lost.</span>
      </div>
    </div>
  )
}

const LENSES = [
  { id: 'brainstorm', icon: 'auto_awesome' as IconName, label: 'Brainstorm', line: 'Three angles worth pulling on — two already live in your garden.' },
  { id: 'pressure', icon: 'shield' as IconName, label: 'Pressure-test', line: 'Where it breaks: price anchoring, churn risk, a thin moat. Let us harden each.' },
  { id: 'strategize', icon: 'trending_up' as IconName, label: 'Strategize', line: 'A sequence: validate, narrow your ICP, then win one channel before widening.' },
]

function ThinkingPartnerMockup() {
  const [active, setActive] = useState('pressure')
  const lens = LENSES.find(l => l.id === active)!
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {LENSES.map(l => {
          const on = l.id === active
          return (
            <button key={l.id} onClick={() => setActive(l.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, transition: 'all 0.2s',
              border: `1px solid ${on ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.14)'}`,
              background: on ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.04)',
              color: on ? '#fff' : 'rgba(255,255,255,0.55)',
            }}>
              <Icon name={l.icon} size={13} color={on ? T.green : 'rgba(255,255,255,0.4)'} />
              {l.label}
            </button>
          )
        })}
      </div>
      <div key={active} style={{
        padding: '1rem 1.1rem', borderRadius: '1rem',
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', animation: 'fadeUp 0.35s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.6rem' }}>
          <div style={{ width: 26, height: 26, borderRadius: '0.5rem', background: 'rgba(34,197,94,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={lens.icon} size={14} color={T.green} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-ui)' }}>{lens.label}</span>
        </div>
        <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, fontFamily: 'var(--font-body)' }}>{lens.line}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 2 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, animation: 'node-pulse 1s ease infinite' }} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body)' }}>A partner that pushes back — grounded in what you know.</span>
      </div>
    </div>
  )
}

function Pillar({ label, title, body, visual, reverse }: {
  label: string; title: React.ReactNode; body: string; visual: React.ReactNode; reverse?: boolean
}) {
  const [ref, inView] = useInView()
  return (
    <div ref={ref} className="pillar-row" style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3.5rem', alignItems: 'center',
      opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(28px)', transition: 'all 0.7s ease',
    }}>
      <div style={{ order: reverse ? 2 : 1 }}>
        <div className="liquid-glass" style={{ display: 'inline-flex', borderRadius: 999, padding: '5px 14px', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--font-ui)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
        </div>
        <h3 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,3.5vw,46px)', fontWeight: 400,
          fontStyle: 'italic', color: '#fff', lineHeight: 1.0, letterSpacing: '-0.02em', marginBottom: '1.25rem',
        }}>{title}</h3>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, fontFamily: 'var(--font-body)', fontWeight: 300, maxWidth: 440 }}>{body}</p>
      </div>
      <div style={{ order: reverse ? 1 : 2 }}>
        <div className="liquid-glass" style={{ borderRadius: '1.5rem', padding: '1.75rem' }}>{visual}</div>
      </div>
    </div>
  )
}

function TwoPillars() {
  return (
    <section style={{ padding: '6rem 2rem', background: '#0f1b16', position: 'relative' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '5.5rem' }}>
        <Pillar
          label="Never lose a thought"
          title={<>A garden that<br />never forgets.</>}
          body="Most of what you learn slips away. Greenplot plants it instead — every idea a seed, enriched and connected as it grows. Your newest interests bloom at the surface, while years of cultivated thinking stay a question away."
          visual={<MemoryTimelineMockup />}
        />
        <Pillar
          reverse
          label="Think it through"
          title={<>A partner that<br />tends your thinking.</>}
          body="Not a search box — a gardener for your ideas. Open one up, stress its weak points, and shape the path forward. Every answer is rooted in the knowledge you've grown, not the open web."
          visual={<ThinkingPartnerMockup />}
        />
      </div>
    </section>
  )
}

// ── Missing Link ──────────────────────────────────────────────────────────
function MissingLink() {
  const [ref, inView] = useInView()
  const [pulse, setPulse] = useState(0)
  useEffect(() => { const t = setInterval(() => setPulse(p => (p + 1) % 2), 1600); return () => clearInterval(t) }, [])
  return (
    <section style={{ padding: '7rem 2rem', background: '#0c1611', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 760, height: 760, borderRadius: '50%',
        background: 'radial-gradient(circle,rgba(34,197,94,0.08) 0%,transparent 68%)', pointerEvents: 'none',
      }} />
      <div ref={ref} style={{
        maxWidth: 880, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1,
        opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(28px)', transition: 'all 0.7s ease',
      }}>
        <div className="liquid-glass" style={{ display: 'inline-flex', borderRadius: 999, padding: '5px 16px', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-ui)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>The missing link</span>
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(32px,5vw,58px)', fontWeight: 400,
          fontStyle: 'italic', color: '#fff', lineHeight: 0.98, letterSpacing: '-0.02em', marginBottom: '1.25rem',
        }}>
          Between thinking<br />and building.
        </h2>
        <p style={{
          fontSize: 17, color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, fontFamily: 'var(--font-body)',
          fontWeight: 300, maxWidth: 560, margin: '0 auto 3.5rem',
        }}>
          Your coding agents are only as good as the context you hand them. Greenplot hands them
          your garden — the research and knowledge you&apos;ve grown — so Claude Code and Codex build
          on something real, not a guess.
        </p>
        <div className="link-flow" style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: '1rem' }}>
          <div className="liquid-glass" style={{
            flex: 1, maxWidth: 230, borderRadius: '1.25rem', padding: '1.5rem 1.25rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
          }}>
            <Icon name="eco" size={26} color={T.green} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-ui)' }}>Your knowledge garden</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)', fontWeight: 300, lineHeight: 1.5 }}>Research, seeds &amp; decisions you actually trust</div>
          </div>
          <div className="link-arrow" style={{ display: 'flex', alignItems: 'center' }}>
            <Icon name="arrow_right" size={22} color={pulse ? T.green : 'rgba(34,197,94,0.4)'} style={{ transition: 'color 0.4s' }} />
          </div>
          <div className="liquid-glass-strong" style={{
            flex: 1, maxWidth: 230, borderRadius: '1.25rem', padding: '1.5rem 1.25rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem',
            background: 'rgba(34,197,94,0.12)', boxShadow: '0 0 0 1px rgba(34,197,94,0.35)',
          }}>
            <Logo light size={16} />
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-body)', fontWeight: 300, lineHeight: 1.5, marginTop: 2 }}>Grounds your build in what&apos;s real</div>
          </div>
          <div className="link-arrow" style={{ display: 'flex', alignItems: 'center' }}>
            <Icon name="arrow_right" size={22} color={pulse ? 'rgba(34,197,94,0.4)' : T.green} style={{ transition: 'color 0.4s' }} />
          </div>
          <div className="liquid-glass" style={{
            flex: 1, maxWidth: 230, borderRadius: '1.25rem', padding: '1.5rem 1.25rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.7rem',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Build with</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', width: '100%' }}>
              {['Claude Code', 'Codex'].map(tool => (
                <div key={tool} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '8px 12px', borderRadius: '0.65rem', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}>
                  <Icon name="dns" size={13} color="rgba(255,255,255,0.7)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: 'var(--font-ui)' }}>{tool}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: '1.5rem', fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          Grounded context in, real builds out.
        </p>
      </div>
    </section>
  )
}

// ── Feature Mockups ───────────────────────────────────────────────────────
function MockupThinkingPartner() {
  const modes = [
    { id: 'brainstorm', icon: 'auto_awesome' as IconName, label: 'Brainstorm' },
    { id: 'pressure', icon: 'shield' as IconName, label: 'Pressure-test' },
    { id: 'strategize', icon: 'trending_up' as IconName, label: 'Strategize' },
    { id: 'spec', icon: 'file_text' as IconName, label: 'Spec' },
  ]
  const replies: Record<string, string> = {
    brainstorm: 'Three angles worth pulling on — two already live in your garden.',
    pressure: 'Here\'s where it breaks: price anchoring, churn risk, a thin moat. Let\'s harden each.',
    strategize: 'A sequence: validate, narrow your ICP, then win one channel before widening.',
    spec: 'I\'ve shaped it into a build-ready brief — problem, goals, requirements, open questions.',
  }
  const [active, setActive] = useState('pressure')
  useEffect(() => {
    const order = ['brainstorm', 'pressure', 'strategize', 'spec']
    const t = setInterval(() => setActive(a => order[(order.indexOf(a) + 1) % order.length]), 1800)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {modes.map(m => {
          const on = m.id === active
          return (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 999,
              fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-ui)', transition: 'all 0.25s',
              border: `1px solid ${on ? T.green : T.border}`,
              background: on ? T.container : 'transparent', color: on ? T.darkGreen : T.text2,
            }}>
              <Icon name={m.icon} size={12} color={on ? T.green : T.text2} />{m.label}
            </div>
          )
        })}
      </div>
      <div key={active} style={{ display: 'flex', justifyContent: 'flex-start', animation: 'fadeUp 0.35s ease' }}>
        <div style={{
          maxWidth: '92%', padding: '0.7rem 0.95rem', borderRadius: '1rem 1rem 1rem 0.2rem',
          background: T.container, color: T.darkGreen, fontSize: 12.5, lineHeight: 1.6,
        }}>{replies[active]}</div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, animation: 'node-pulse 1s ease infinite' }} />
        <span style={{ fontSize: 11, color: T.text2 }}>Grounded in your garden — not the open web</span>
      </div>
    </div>
  )
}

function MockupSpec() {
  const rows = ['Problem & context', 'Goals and non-goals', 'Requirements', 'Open questions']
  const [shown, setShown] = useState(0)
  useEffect(() => { const t = setInterval(() => setShown(s => (s + 1) % (rows.length + 2)), 650); return () => clearInterval(t) }, [])
  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: T.container, borderRadius: '0.6rem', padding: '0.55rem 0.8rem' }}>
        <Icon name="eco" size={13} color={T.green} />
        <span style={{ fontSize: 12, color: T.darkGreen, fontWeight: 500 }}>&quot;Turn this thread into a build-ready brief&quot;</span>
      </div>
      <div style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: '0.75rem', padding: '0.9rem', background: T.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Icon name="file_text" size={14} color={T.green} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.darkGreen }}>Build-ready brief</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: T.green, background: T.container, borderRadius: 999, padding: '2px 9px', letterSpacing: '0.05em' }}>READY</span>
        </div>
        {rows.map((r, i) => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', opacity: shown > i ? 1 : 0.3, transition: 'opacity 0.3s' }}>
            <Icon name="check" size={13} color={shown > i ? T.green : T.border} />
            <span style={{ fontSize: 12, color: T.text2 }}>{r}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="dns" size={13} color={T.green} />
        <span style={{ fontSize: 11, color: T.text2 }}>Ready to hand to your build tools</span>
      </div>
    </div>
  )
}

function MockupIdeaGarden() {
  const seeds = ['Emergence theory', 'Second Brain', 'Flow states', 'Stoic philosophy', 'Attention restoration']
  const [active, setActive] = useState(0)
  useEffect(() => { const t = setInterval(() => setActive(a => (a + 1) % seeds.length), 1400); return () => clearInterval(t) }, [])
  return (
    <div style={{ width: '100%', height: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {seeds.map((s, i) => (
        <div key={s} style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.9rem',
          borderRadius: '0.6rem', background: i === active ? T.container : 'transparent',
          border: `1px solid ${i === active ? T.green : T.border}`, transition: 'all 0.4s ease',
        }}>
          <Icon name="eco" size={14} color={i === active ? T.green : T.text2} />
          <span style={{ fontSize: 13, fontWeight: i === active ? 600 : 400, color: i === active ? T.darkGreen : T.text2 }}>{s}</span>
          {i === active && <span style={{ marginLeft: 'auto', fontSize: 11, color: T.green, fontWeight: 600 }}>enriching…</span>}
        </div>
      ))}
    </div>
  )
}

function MockupAIAgent() {
  const msgs = [
    { role: 'user', text: 'What connects stoicism and second brain methodology?' },
    { role: 'ai', text: 'Both emphasize intentional filtering — Stoics chose what to attend to mentally; the Second Brain system chooses what to externalize…' },
  ]
  const [shown, setShown] = useState(0)
  useEffect(() => { const t = setInterval(() => setShown(s => Math.min(s + 1, msgs.length)), 1200); return () => clearInterval(t) }, [])
  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', overflowY: 'hidden' }}>
      {msgs.slice(0, shown).map((m, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', animation: 'fadeUp 0.4s ease' }}>
          <div style={{
            maxWidth: '82%', padding: '0.65rem 0.9rem',
            borderRadius: m.role === 'user' ? '1rem 1rem 0.2rem 1rem' : '1rem 1rem 1rem 0.2rem',
            background: m.role === 'user' ? T.darkGreen : T.container,
            color: m.role === 'user' ? '#fff' : T.darkGreen, fontSize: 12, lineHeight: 1.6, fontWeight: 400,
          }}>{m.text}</div>
        </div>
      ))}
      {shown >= msgs.length && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, animation: 'fadeIn 0.5s ease' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, animation: 'node-pulse 1s ease infinite' }} />
          <span style={{ fontSize: 11, color: T.text2 }}>Searching your garden…</span>
        </div>
      )}
    </div>
  )
}

function MockupCalendar() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const events = [
    { day: 1, label: 'Deep work', color: T.green, top: 20, h: 60 },
    { day: 3, label: 'Research', color: T.teal, top: 50, h: 45 },
    { day: 4, label: 'Writing', color: T.darkGreen, top: 25, h: 70 },
  ]
  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ background: T.container, borderRadius: '0.6rem', padding: '0.6rem 0.9rem', fontSize: 12, color: T.darkGreen, fontWeight: 500 }}>
        <Icon name="mic" size={12} color={T.green} style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }} />
        &quot;Block deep work Tue morning&quot; — done ✓
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
        {days.map((d, i) => (
          <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.text2, textAlign: 'center', paddingBottom: 2 }}>{d}</div>
            <div style={{ flex: 1, background: '#f5f5f2', borderRadius: '0.4rem', position: 'relative', minHeight: 80 }}>
              {events.filter(e => e.day === i).map(ev => (
                <div key={ev.label} style={{
                  position: 'absolute', left: 2, right: 2,
                  top: ev.top / 2 + '%', height: ev.h / 2 + '%',
                  background: ev.color, borderRadius: '0.3rem', opacity: 0.85,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: '#fff', fontWeight: 600, padding: '0 3px', textAlign: 'center',
                  animation: 'fadeIn 0.6s ease',
                }}>{ev.label}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MockupKnowledgeGraph() {
  const nodes = [
    { x: 50, y: 50, label: 'Stoicism', r: 22, primary: true },
    { x: 20, y: 25, label: 'Attention', r: 16, primary: false },
    { x: 78, y: 28, label: 'Flow', r: 16, primary: false },
    { x: 15, y: 72, label: 'Memory', r: 14, primary: false },
    { x: 82, y: 72, label: 'Habits', r: 14, primary: false },
    { x: 50, y: 82, label: 'Focus', r: 13, primary: false },
  ]
  const edges: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 4]]
  const [active, setActive] = useState(0)
  useEffect(() => { const t = setInterval(() => setActive(a => (a + 1) % nodes.length), 900); return () => clearInterval(t) }, [])
  return (
    <div style={{ padding: '1rem', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: 240 }}>
        {edges.map(([a, b], i) => (
          <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
            stroke={T.border} strokeWidth="0.8" opacity="0.8" />
        ))}
        {nodes.map((n, i) => (
          <g key={i}>
            {i === active && <circle cx={n.x} cy={n.y} r={n.r + 6} fill={T.green} opacity="0.1"
              style={{ animation: 'pulse-ring 1.2s ease-out infinite' }} />}
            <circle cx={n.x} cy={n.y} r={n.r} fill={i === active ? T.green : T.container}
              stroke={i === active ? T.green : T.border} strokeWidth="0.8"
              style={{ transition: 'fill 0.4s ease' }} />
            <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize={n.primary ? 5 : 4} fontWeight={n.primary ? '700' : '500'}
              fill={i === active ? '#fff' : T.darkGreen} fontFamily="Sora,sans-serif">{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function MockupWiki() {
  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ height: 10, background: T.darkGreen, borderRadius: 4, width: '70%', opacity: 0.9 }} />
      <div style={{ height: 6, background: T.border, borderRadius: 3, width: '40%' }} />
      <div style={{ height: 1, background: T.border, margin: '0.25rem 0' }} />
      {[85, 92, 78, 88, 65].map((w, i) => (
        <div key={i} style={{ height: 5, background: T.border, borderRadius: 3, width: w + '%', animation: `fadeIn 0.4s ${i * 0.12}s ease both` }} />
      ))}
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {['Attention', 'Memory', 'Cognition', 'Focus'].map(tag => (
          <span key={tag} style={{ fontSize: 10, background: T.container, color: T.darkGreen, padding: '2px 8px', borderRadius: 999, fontWeight: 600, border: `1px solid ${T.border}` }}>{tag}</span>
        ))}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: T.container, borderRadius: '0.5rem', padding: '0.5rem 0.75rem' }}>
        <Icon name="activity" size={12} color={T.green} />
        <span style={{ fontSize: 11, color: T.darkGreen, fontWeight: 500 }}>Living article — 12 seeds compiled</span>
      </div>
    </div>
  )
}

function MockupVoice() {
  const [frame, setFrame] = useState(0)
  useEffect(() => { const t = setInterval(() => setFrame(f => f + 1), 80); return () => clearInterval(t) }, [])
  const bars = Array.from({ length: 24 }, (_, i) => {
    const base = Math.sin(i * 0.6 + frame * 0.15) * 0.4 + 0.5
    return Math.max(0.08, base)
  })
  return (
    <div style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
        {bars.map((h, i) => (
          <div key={i} style={{ width: 6, borderRadius: 3, background: `linear-gradient(to top, ${T.green}, ${T.teal})`, height: h * 60, transition: 'height 0.08s ease' }} />
        ))}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: T.green, fontWeight: 600, marginBottom: 4 }}>Recording…</div>
        <div style={{ fontSize: 11, color: T.text2 }}>Transcribing &amp; enriching automatically</div>
      </div>
      <div style={{ background: T.container, borderRadius: '0.6rem', padding: '0.6rem 1rem', width: '100%' }}>
        <p style={{ fontSize: 11, color: T.darkGreen, lineHeight: 1.6, margin: 0 }}>
          &quot;The concept of emergence — where complex behaviour arises from simple rules…&quot;
        </p>
      </div>
    </div>
  )
}

function MockupAcademic() {
  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Icon name="search" size={13} color={T.green} />
          <span style={{ fontSize: 11, color: T.darkGreen, fontWeight: 600 }}>Research Digest</span>
        </div>
        <span style={{ fontSize: 9, color: T.text2, fontWeight: 600, letterSpacing: '0.05em' }}>every morning</span>
      </div>
      {[
        { title: 'Multi-Layer Memory for AI Agents', seed: 'AI Agents' },
        { title: 'Retrieval over Knowledge Graphs', seed: 'Knowledge Graphs' },
      ].map(p => (
        <div key={p.title} style={{ border: `1px solid ${T.border}`, borderRadius: '0.6rem', padding: '0.6rem 0.75rem', background: T.surface }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.darkGreen, marginBottom: 3, lineHeight: 1.3 }}>{p.title}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: 9, color: T.text2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="file_text" size={9} color={T.text2} />New paper · PDF attached
            </span>
            <span style={{ fontSize: 9, background: T.container, color: T.green, borderRadius: 999, padding: '1px 7px', fontWeight: 700, whiteSpace: 'nowrap' }}>↳ {p.seed}</span>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', border: `1px solid ${T.green}`, borderRadius: '0.6rem', padding: '0.6rem 0.75rem', background: '#f0fdf4' }}>
        <Icon name="auto_awesome" size={13} color={T.green} style={{ flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 11, color: T.darkGreen, lineHeight: 1.5 }}>
          <strong>Actionable move</strong> + solution-design seed planted in your Garden
        </span>
      </div>
    </div>
  )
}

function MockupBriefings() {
  const cards = [
    { title: 'Morning Spark', body: 'Your note on stoicism connects to a new study on cognitive reappraisal…', time: '8:00 AM' },
    { title: 'Deep Dive Reminder', body: 'You haven\'t revisited "Flow states" in 14 days — ready to grow it?', time: '2:00 PM' },
  ]
  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      {cards.map((c, i) => (
        <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: '0.75rem', padding: '0.85rem', background: T.surface, animation: `fadeUp 0.4s ${i * 0.2}s ease both` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.darkGreen }}>{c.title}</span>
            <span style={{ fontSize: 10, color: T.text2 }}>{c.time}</span>
          </div>
          <p style={{ fontSize: 11, color: T.text2, lineHeight: 1.6, margin: 0 }}>{c.body}</p>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.green }} />
        <span style={{ fontSize: 11, color: T.text2 }}>3 more sparks scheduled today</span>
      </div>
    </div>
  )
}

function MockupShare() {
  const formats = [
    { label: 'Markdown', ext: '.md', color: T.darkGreen },
    { label: 'PDF', ext: '.pdf', color: T.teal },
  ]
  const apps = ['WhatsApp', 'Telegram', 'Slack', 'Email']
  const [sent, setSent] = useState<string | null>(null)
  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Export as</div>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        {formats.map(f => (
          <div key={f.label} style={{ flex: 1, border: `1.5px solid ${T.border}`, borderRadius: '0.65rem', padding: '0.65rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: T.surface, cursor: 'pointer' }}>
            <Icon name="file_text" size={18} color={f.color} />
            <span style={{ fontSize: 11, fontWeight: 700, color: T.darkGreen }}>{f.label}</span>
            <span style={{ fontSize: 10, color: T.text2 }}>{f.ext}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: '0.25rem' }}>Send to</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {apps.map(app => (
          <button key={app} onClick={() => setSent(app)} style={{
            padding: '0.55rem 0.75rem', borderRadius: '0.6rem', fontSize: 11, fontWeight: 600,
            border: `1.5px solid ${sent === app ? T.green : T.border}`,
            background: sent === app ? T.container : T.surface,
            color: sent === app ? T.darkGreen : T.text2, cursor: 'pointer', transition: 'all 0.2s',
            fontFamily: 'var(--font-ui)', textAlign: 'left',
          }}>{sent === app ? '✓ ' : '→ '}{app}</button>
        ))}
      </div>
      <div style={{ marginTop: 'auto', background: T.container, borderRadius: '0.6rem', padding: '0.6rem 0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="shield" size={13} color={T.green} />
        <span style={{ fontSize: 11, color: T.darkGreen, lineHeight: 1.5 }}>You control what you share — always.</span>
      </div>
    </div>
  )
}

function MockupMCP() {
  type TokenType = 'comment' | 'key' | 'str' | 'fn' | 'normal'
  const lines: { t: TokenType; v: string }[] = [
    { t: 'comment', v: '// Connect your garden to your IDE' },
    { t: 'key', v: 'import' }, { t: 'normal', v: ' { GreenplotMCP } from ' }, { t: 'str', v: '"@greenplot/mcp"' },
    { t: 'normal', v: '' },
    { t: 'key', v: 'const' }, { t: 'normal', v: ' garden = ' }, { t: 'key', v: 'await ' },
    { t: 'fn', v: 'GreenplotMCP.connect' }, { t: 'normal', v: '({ token })' },
    { t: 'normal', v: '' },
    { t: 'comment', v: '// Query your knowledge' },
    { t: 'key', v: 'const' }, { t: 'normal', v: ' insights = ' }, { t: 'key', v: 'await ' },
    { t: 'fn', v: 'garden.search' }, { t: 'normal', v: '(' }, { t: 'str', v: '"emergence theory"' }, { t: 'normal', v: ')' },
  ]
  const colors: Record<TokenType, string> = { comment: '#6a9955', key: '#569cd6', str: '#ce9178', fn: '#dcdcaa', normal: '#d4d4d4' }
  return (
    <div style={{ padding: '1.25rem', height: '100%', background: '#1e1e1e', borderRadius: '0.75rem', margin: '0.5rem', overflowY: 'hidden' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.9, fontFamily: 'monospace' }}>
        {lines.map((l, i) => (
          <span key={i} style={{ color: colors[l.t] }}>
            {l.v}{l.t === 'normal' && l.v === '' ? <br /> : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Features data ─────────────────────────────────────────────────────────
const FEATURES: { icon: IconName; name: string; tag: string; color: string; desc: string; mockup: React.ReactNode }[] = [
  { icon: 'smart_toy', name: 'Thinking Partner', tag: 'Think', color: T.green,
    desc: 'A strategist, not a search box. Brainstorm to open an idea up, pressure-test its weak points, or strategize the path forward — every mode reasoning from the knowledge you already hold.',
    mockup: <MockupThinkingPartner /> },
  { icon: 'file_text', name: 'Spec it Out', tag: 'Build', color: T.teal,
    desc: 'When the thinking is done, Greenplot shapes the thread into a clean, build-ready brief — problem, goals, requirements and open questions — ready to hand straight to your coding agent.',
    mockup: <MockupSpec /> },
  { icon: 'eco', name: 'Idea Garden', tag: 'Capture', color: T.green,
    desc: 'Capture fleeting thoughts as seeds. Every idea gets enriched with research and connected to your existing knowledge.',
    mockup: <MockupIdeaGarden /> },
  { icon: 'notifications', name: 'Smart Briefings', tag: 'Reflect', color: T.teal,
    desc: 'Receive curated, personalised idea sparks, briefings and reflection reminders to help you be creative and build knowledge.',
    mockup: <MockupBriefings /> },
  { icon: 'smart_toy', name: 'AI Agent', tag: 'Chat', color: T.green,
    desc: 'Ask Greenplot anything. It searches your garden first, then the web — combining your personal knowledge with live information.',
    mockup: <MockupAIAgent /> },
  { icon: 'search', name: 'Research Digest', tag: 'Research', color: T.teal,
    desc: 'Every morning, fresh arXiv papers are matched to your Garden seeds and Wiki, then distilled into an actionable move and a solution-design seed — with the source PDFs attached.',
    mockup: <MockupAcademic /> },
  { icon: 'auto_stories', name: 'Wiki', tag: 'Compile', color: T.green,
    desc: 'Your seeds compile into living wiki articles — encyclopedic summaries of everything you\'ve captured and learned.',
    mockup: <MockupWiki /> },
  { icon: 'layers', name: 'Share Knowledge', tag: 'Share', color: T.teal,
    desc: 'Share your garden or wiki as Markdown, PDF, or send directly to your favourite messenger app. You control what you share.',
    mockup: <MockupShare /> },
  { icon: 'calendar_month', name: 'Calendar', tag: 'Organise', color: T.teal,
    desc: 'Chat to schedule. "Block two hours for deep work tomorrow" — done. Greenplot talks directly to Google Calendar.',
    mockup: <MockupCalendar /> },
  { icon: 'mic', name: 'Voice Capture', tag: 'Record', color: T.green,
    desc: 'Record a voice memo on the go. Greenplot transcribes, enriches, and plants it in your garden automatically.',
    mockup: <MockupVoice /> },
  { icon: 'hub', name: 'Knowledge Graph', tag: 'Connect', color: T.teal,
    desc: 'See your ideas as an interactive network. Discover unexpected connections between everything you\'ve ever captured.',
    mockup: <MockupKnowledgeGraph /> },
  { icon: 'dns', name: 'MCP Server', tag: 'Build', color: T.green,
    desc: 'Expose your Garden to your favourite Agentic Coding tool and build your ideas directly into your workflow.',
    mockup: <MockupMCP /> },
]

// ── Features Showcase ─────────────────────────────────────────────────────
function FeaturesShowcase() {
  const [active, setActive] = useState(0)
  const [headerRef, headerInView] = useInView()
  const feat = FEATURES[active]
  return (
    <section id="features" style={{ padding: '6rem 2rem', background: '#0f1b16', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(to bottom,#0f1b16,transparent)', pointerEvents: 'none', zIndex: 1 }} />
      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 2 }}>
        <div ref={headerRef} style={{ textAlign: 'center', marginBottom: '3rem', opacity: headerInView ? 1 : 0, transform: headerInView ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <div className="liquid-glass" style={{ display: 'inline-flex', borderRadius: 999, padding: '5px 16px', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-body)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Features</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(30px,4vw,52px)', fontWeight: 400, fontStyle: 'italic', color: '#fff', letterSpacing: '-0.02em', lineHeight: 0.95 }}>
            Everything Your Living<br />Laboratory needs
          </h2>
        </div>
        <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '2rem', alignItems: 'start' }}>
          <div className="features-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {FEATURES.map((f, i) => {
              const isActive = i === active
              return (
                <button key={f.name} onClick={() => setActive(i)}
                  className={isActive ? 'liquid-glass' : ''}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.9rem', padding: '0.85rem 1.1rem',
                    borderRadius: '0.85rem',
                    border: isActive ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    background: isActive ? undefined : 'transparent',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.22s ease',
                    fontFamily: 'var(--font-ui)',
                    transform: isActive ? 'translateX(4px)' : 'translateX(0)',
                    width: '100%',
                  }}>
                  <div style={{ width: 36, height: 36, borderRadius: '0.6rem', flexShrink: 0, background: isActive ? f.color + '30' : 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, transition: 'all 0.22s' }}>
                    <Icon name={f.icon} size={16} color={isActive ? f.color : 'rgba(255,255,255,0.4)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? '#fff' : 'rgba(255,255,255,0.6)', lineHeight: 1.3 }}>{f.name}</div>
                    {isActive && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, lineHeight: 1.6, whiteSpace: 'normal' }}>{f.desc}</div>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? f.color : 'rgba(255,255,255,0.25)', background: isActive ? f.color + '20' : 'transparent', borderRadius: 999, padding: '2px 8px', flexShrink: 0, transition: 'all 0.22s', fontFamily: 'var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{f.tag}</span>
                </button>
              )
            })}
          </div>
          <div className="features-mockup features-panel" style={{ position: 'sticky', top: '5rem', height: 'fit-content' }}>
            <div key={active} className="liquid-glass" style={{ borderRadius: '1.5rem', minHeight: 380, overflow: 'hidden', animation: 'slide-in 0.3s ease' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 30, height: 30, borderRadius: '0.5rem', background: feat.color + '28', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={feat.icon} size={14} color={feat.color} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: 'var(--font-ui)' }}>{feat.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: feat.color, background: feat.color + '20', borderRadius: 999, padding: '2px 10px', fontFamily: 'var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{feat.tag}</span>
              </div>
              <div style={{ minHeight: 340, background: T.bg }}>{feat.mockup}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Flywheel ──────────────────────────────────────────────────────────────
const STEPS = [
  { icon: 'auto_awesome' as IconName, color: T.green, label: 'Idea',
    desc: 'It starts as a seed. Brainstorm, pressure-test and strategize with a partner that thinks alongside you — never a blank page.' },
  { icon: 'auto_stories' as IconName, color: T.teal, label: 'Knowledge',
    desc: 'Every exchange takes root in your garden — captured, enriched and connected into knowledge that never fades.' },
  { icon: 'dns' as IconName, color: T.darkGreen, label: 'Build',
    desc: 'Harvest your garden: hand that grounded knowledge to Claude Code or Codex and build on real research, not guesswork.' },
]

function Flywheel() {
  const [active, setActive] = useState(0)
  const [headerRef, headerInView] = useInView()
  const [bodyRef, bodyInView] = useInView()
  useEffect(() => { const t = setInterval(() => setActive(a => (a + 1) % 3), 4200); return () => clearInterval(t) }, [])
  return (
    <section id="how-it-works" style={{ padding: '6rem 2rem', background: '#0f1b16' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div ref={headerRef} style={{ textAlign: 'center', marginBottom: '3.5rem', opacity: headerInView ? 1 : 0, transform: headerInView ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <div className="liquid-glass" style={{ display: 'inline-flex', borderRadius: 999, padding: '5px 16px', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-body)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>How it works</span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,52px)', fontWeight: 400, fontStyle: 'italic', color: '#fff', letterSpacing: '-0.02em', lineHeight: 0.95 }}>
            The loop from seed<br />to knowledge to build
          </h2>
        </div>
        <div ref={bodyRef} style={{ opacity: bodyInView ? 1 : 0, transform: bodyInView ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.7s ease' }}>
          <div className="flywheel-steps" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: '3rem', flexWrap: 'wrap' }}>
            {STEPS.map((step, i) => {
              const isActive = i === active
              return (
                <div key={step.label} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <div className={`flywheel-card${isActive ? ' liquid-glass' : ''}`} onClick={() => setActive(i)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9rem',
                    padding: '2rem 2.5rem', borderRadius: '1.5rem', cursor: 'pointer',
                    border: isActive ? 'none' : '1px solid rgba(255,255,255,0.1)',
                    boxShadow: isActive ? `0 0 0 1px ${step.color}40` : 'none',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)', minWidth: 200,
                  }}>
                    <div style={{ position: 'relative' }}>
                      {isActive && <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: `1px solid ${step.color}`, opacity: 0.35, animation: 'pulse-ring 1.5s ease-out infinite' }} />}
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: isActive ? step.color + '25' : 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.4s ease' }}>
                        <Icon name={step.icon} size={28} color={isActive ? step.color : 'rgba(255,255,255,0.35)'} strokeWidth={1.5} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: isActive ? step.color : 'rgba(255,255,255,0.3)', marginBottom: '0.3rem', fontFamily: 'var(--font-ui)' }}>Step {i + 1}</div>
                      <div style={{ fontSize: 20, fontWeight: 400, fontStyle: 'italic', color: isActive ? '#fff' : 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-display)' }}>{step.label}</div>
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flywheel-arrow" style={{ padding: '0 0.5rem', flexShrink: 0 }}>
                      <svg width="56" height="16" viewBox="0 0 56 16" fill="none">
                        <path d="M4 8 Q28 8 52 8" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3 3" />
                        {active > i && <path d="M4 8 Q28 8 52 8" stroke={STEPS[i + 1].color} strokeWidth="1.5" strokeDasharray="50" strokeDashoffset="0" opacity="0.7" style={{ animation: 'flow 1.8s ease infinite' }} />}
                        <path d="M47 4 L52 8 L47 12" stroke={active > i ? STEPS[i + 1].color : 'rgba(255,255,255,0.12)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div key={active} className="liquid-glass" style={{ maxWidth: 560, margin: '0 auto', borderRadius: '1.25rem', padding: '1.75rem 2rem', boxShadow: `0 0 0 1px ${STEPS[active].color}30`, animation: 'fadeUp 0.35s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '0.6rem', background: STEPS[active].color + '25', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={STEPS[active].icon} size={18} color={STEPS[active].color} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 400, fontStyle: 'italic', color: '#fff', fontFamily: 'var(--font-display)' }}>{STEPS[active].label}</span>
            </div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, fontFamily: 'var(--font-body)', fontWeight: 300, margin: 0 }}>{STEPS[active].desc}</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '2rem' }}>
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => setActive(i)} style={{ width: i === active ? 24 : 8, height: 8, borderRadius: 999, border: 'none', cursor: 'pointer', background: i === active ? STEPS[i].color : 'rgba(255,255,255,0.2)', transition: 'all 0.3s ease', padding: 0 }} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Testimonial ───────────────────────────────────────────────────────────
function Testimonial() {
  const [ref, inView] = useInView()
  return (
    <section style={{ padding: '6rem 2rem', background: '#0f1b16' }}>
      <div ref={ref} style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.7s ease' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 80, color: T.green, lineHeight: 0.6, marginBottom: '1.5rem', fontStyle: 'italic' }}>&ldquo;</div>
        <blockquote style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px,3vw,30px)', fontWeight: 400, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, letterSpacing: '-0.01em', fontStyle: 'italic', border: 'none', margin: 0, padding: 0 }}>
          The hard part was never the idea. It was carrying it from a spark, into real knowledge,
          and finally into something built. Greenplot is the bridge across that gap.
        </blockquote>
      </div>
    </section>
  )
}

// ── Waitlist ──────────────────────────────────────────────────────────────
function Waitlist() {
  const [ref, inView] = useInView()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('Please enter a valid email address.')

  const submit = async () => {
    if (!email.includes('@') || email.length < 5) { setStatus('error'); return }
    setStatus('loading')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) {
        setStatus('done')
      } else {
        const data = await res.json().catch(() => ({}))
        setErrorMsg((data as { error?: string }).error || 'Something went wrong. Please try again.')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <section id="waitlist" style={{ padding: '7rem 2rem', background: '#0f1b16', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,197,94,0.07) 0%,transparent 70%)', pointerEvents: 'none' }} />
      <div ref={ref} style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1, opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.7s ease' }}>
        <div className="liquid-glass" style={{ display: 'inline-flex', borderRadius: 999, padding: '5px 16px', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-body)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Early Access</span>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px,5vw,60px)', fontWeight: 400, fontStyle: 'italic', color: '#fff', lineHeight: 0.95, letterSpacing: '-0.02em', marginBottom: '1.25rem' }}>
          Be first to grow<br />your garden.
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, fontFamily: 'var(--font-body)', fontWeight: 300, maxWidth: 440, margin: '0 auto 2.5rem' }}>
          Join the waitlist and be the first to grow your garden.
        </p>
        {status === 'done' ? (
          <div className="liquid-glass" style={{ borderRadius: '1rem', padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <Icon name="check" size={28} color={T.green} />
            <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', fontFamily: 'var(--font-ui)', margin: 0 }}>You&apos;re on the list!</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-body)', fontWeight: 300, margin: 0 }}>
              We&apos;ll be in touch when your garden is ready to grow.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.75rem', maxWidth: 480, margin: '0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setStatus('idle') }}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="your@email.com"
              style={{
                flex: 1, minWidth: 200, padding: '14px 20px', borderRadius: 999,
                background: 'rgba(255,255,255,0.07)',
                border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)'}`,
                color: '#fff', fontSize: 15, fontFamily: 'var(--font-body)', fontWeight: 400,
                outline: 'none', transition: 'border 0.2s',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(34,197,94,0.5)')}
              onBlur={e => (e.target.style.borderColor = status === 'error' ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.15)')}
            />
            <button className="liquid-glass-strong" onClick={submit} disabled={status === 'loading'}
              style={{
                borderRadius: 999, padding: '14px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                color: '#fff', fontFamily: 'var(--font-ui)', transition: 'transform 0.18s',
                background: 'rgba(34,197,94,0.22)', whiteSpace: 'nowrap',
                opacity: status === 'loading' ? 0.7 : 1,
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >{status === 'loading' ? 'Joining…' : 'Join the waitlist'}</button>
          </div>
        )}
        {status === 'error' && <p style={{ fontSize: 12, color: 'rgba(239,68,68,0.75)', marginTop: '0.75rem', fontFamily: 'var(--font-body)', margin: '0.75rem auto 0' }}>{errorMsg}</p>}
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: '1.5rem', fontFamily: 'var(--font-body)', fontWeight: 300 }}>No spam. Unsubscribe anytime.</p>
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────
function CTA() {
  const [ref, inView] = useInView()
  return (
    <section style={{ padding: '6rem 2rem', background: '#0f1b16' }}>
      <div ref={ref} style={{ maxWidth: 660, margin: '0 auto', textAlign: 'center', opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.7s ease' }}>
        <div className="liquid-glass" style={{ borderRadius: '2rem', padding: '4rem 2.5rem' }}>
          <Icon name="eco" size={42} color={T.green} style={{ marginBottom: '1.5rem' }} />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,4vw,48px)', fontWeight: 400, fontStyle: 'italic', color: '#fff', lineHeight: 0.95, letterSpacing: '-0.02em', marginBottom: '1.25rem' }}>
            Meet your thinking partner.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', marginBottom: '2.25rem', lineHeight: 1.7, fontFamily: 'var(--font-body)', fontWeight: 300 }}>
            From first seed to real build — grounded in a knowledge garden that&apos;s all your own.
          </p>
          <a href="#waitlist" className="liquid-glass-strong" style={{
            borderRadius: 999, padding: '16px 36px', fontSize: 16, fontWeight: 600,
            color: '#fff', fontFamily: 'var(--font-ui)', transition: 'transform 0.18s',
            background: 'rgba(34,197,94,0.22)', display: 'inline-block', textDecoration: 'none',
          }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >Get started — it&apos;s free</a>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: '#0c1611', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '1.75rem 2rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <Logo light size={18} />
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {['Privacy', 'Terms', 'GitHub'].map(l => (
            <a key={l} href="#" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none', fontSize: 13, fontWeight: 400, fontFamily: 'var(--font-body)', transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            >{l}</a>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body)', fontWeight: 300, margin: 0 }}>Built with 💚 for curious minds</p>
      </div>
    </footer>
  )
}

// ── Landing Page ──────────────────────────────────────────────────────────
export default function LandingPage() {
  const [heroVisible, setHeroVisible] = useState(true)

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      bodyBg: body.style.background,
      bodyColor: body.style.color,
    }
    html.style.overflow = 'auto'
    html.style.height = 'auto'
    body.style.overflow = 'auto'
    body.style.height = 'auto'
    body.style.background = '#0f1b16'
    body.style.color = '#fff'
    return () => {
      html.style.overflow = prev.htmlOverflow
      html.style.height = prev.htmlHeight
      body.style.overflow = prev.bodyOverflow
      body.style.height = prev.bodyHeight
      body.style.background = prev.bodyBg
      body.style.color = prev.bodyColor
    }
  }, [])

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <Navbar heroVisible={heroVisible} />
      <main>
        <Hero onVisibilityChange={setHeroVisible} />
        <TwoPillars />
        <MissingLink />
        <Flywheel />
        <FeaturesShowcase />
        <Testimonial />
        <Waitlist />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
