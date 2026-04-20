'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Leaf, Bell, Cpu, Globe, BookOpen, Calendar, Image, Mic,
  Share2, Server, PlusCircle, Zap, TrendingUp, ArrowUp,
  ArrowRight, Search, Mail, FileText, Layers, CheckCircle,
  Shield, Activity, MoreHorizontal, Menu, X,
} from 'lucide-react'

// ── Design tokens ─────────────────────────────────────────────────────────
const T = {
  bg: '#fafaf8',
  surface: '#ffffff',
  green: '#22c55e',
  darkGreen: '#14532d',
  teal: '#14b8a6',
  text: '#141413',
  text2: '#5f5f5a',
  border: '#e8e6df',
  container: '#dcfce7',
}

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

// ── Icon helper ───────────────────────────────────────────────────────────
type IconName =
  | 'eco' | 'notifications' | 'smart_toy' | 'auto_stories'
  | 'calendar_month' | 'image' | 'mic' | 'hub' | 'dns'
  | 'add_circle' | 'auto_awesome' | 'trending_up' | 'arrow_upward'
  | 'search' | 'mail' | 'file_text' | 'layers' | 'shield' | 'activity'

const ICON_COMPONENTS: Record<IconName, React.ElementType> = {
  eco: Leaf, notifications: Bell, smart_toy: Cpu, auto_stories: BookOpen,
  calendar_month: Calendar, image: Image, mic: Mic, hub: Share2, dns: Server,
  add_circle: PlusCircle, auto_awesome: Zap, trending_up: TrendingUp,
  arrow_upward: ArrowUp, search: Search, mail: Mail, file_text: FileText,
  layers: Layers, shield: Shield, activity: Activity,
}

function Icon({ name, size = 20, color = T.green, strokeWidth = 1.75, style = {} }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties
}) {
  const Comp = ICON_COMPONENTS[name]
  if (!Comp) return null
  return <Comp width={size} height={size} stroke={color} strokeWidth={strokeWidth} style={{ flexShrink: 0, ...style }} />
}

// ── Logo ──────────────────────────────────────────────────────────────────
function Logo({ size = 20 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width={size + 6} height={size + 6} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="16" fill={T.container} />
        <path d="M16 26 C14 20 9 17 9 12 C9 8.5 12 6 16 6 C20 6 23 8.5 23 12 C23 17 18 20 16 26Z" fill={T.green} opacity="0.3" />
        <path d="M16 26 C16 19 20.5 16 21.5 12.5 C22 10.5 21 8.5 19.5 7.5 C22 9 23 12 22 15 C21 18 18 21 16 26Z" fill={T.green} opacity="0.6" />
        <path d="M16 26 L16 14" stroke={T.darkGreen} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span style={{ fontWeight: 700, fontSize: size, color: T.darkGreen, letterSpacing: '-0.02em', fontFamily: 'Sora, sans-serif' }}>
        Greenplot
      </span>
    </div>
  )
}

// ── Navbar ────────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const navStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: scrolled || menuOpen ? 'rgba(250,250,248,0.96)' : 'transparent',
    backdropFilter: scrolled || menuOpen ? 'blur(16px)' : 'none',
    borderBottom: scrolled || menuOpen ? `1px solid ${T.border}` : '1px solid transparent',
    transition: 'all 0.3s ease',
  }

  return (
    <nav style={navStyle}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo />

          {/* Desktop links */}
          <div className="landing-nav-links" style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            {['Features', 'How it works'].map(l => (
              <a key={l} href={`#${l.toLowerCase().replace(/ /g, '-')}`}
                style={{ color: T.text2, textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = T.darkGreen)}
                onMouseLeave={e => (e.currentTarget.style.color = T.text2)}>{l}</a>
            ))}
            <Link href="/onboarding">
              <PillButton size="sm">Get started — free</PillButton>
            </Link>
          </div>

          {/* Hamburger */}
          <button onClick={() => setMenuOpen(o => !o)}
            style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            className="landing-hamburger">
            {menuOpen ? <X size={22} color={T.darkGreen} /> : <Menu size={22} color={T.darkGreen} />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div style={{ padding: '1rem 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: `1px solid ${T.border}` }}>
            {['Features', 'How it works'].map(l => (
              <a key={l} href={`#${l.toLowerCase().replace(/ /g, '-')}`}
                onClick={() => setMenuOpen(false)}
                style={{ color: T.text, textDecoration: 'none', fontSize: 16, fontWeight: 600, padding: '0.25rem 0' }}>{l}</a>
            ))}
            <div style={{ marginTop: '0.5rem' }}>
              <Link href="/onboarding"><PillButton size="lg">Get started — free</PillButton></Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}

// ── Buttons ───────────────────────────────────────────────────────────────
function PillButton({ children, size = 'sm', onClick }: { children: React.ReactNode; size?: 'sm' | 'lg'; onClick?: () => void }) {
  const [hov, setHov] = useState(false)
  const pad = size === 'lg' ? '16px 36px' : '9px 22px'
  const fs = size === 'lg' ? 17 : 14
  return (
    <button onClick={onClick}
      style={{
        background: T.green, color: '#fff', border: 'none', borderRadius: 999,
        padding: pad, fontSize: fs, fontWeight: 700, cursor: 'pointer', fontFamily: 'Sora, sans-serif',
        boxShadow: hov ? '0 8px 28px rgba(34,197,94,0.4)' : '0 3px 14px rgba(34,197,94,0.25)',
        transform: hov ? 'translateY(-2px)' : 'translateY(0)', transition: 'all 0.18s ease',
      }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {children}
    </button>
  )
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      style={{
        background: hov ? T.container : 'transparent', color: T.darkGreen,
        border: `1.5px solid ${T.darkGreen}`, borderRadius: 999, padding: '16px 32px',
        fontSize: 17, fontWeight: 600, cursor: 'pointer', fontFamily: 'Sora, sans-serif', transition: 'all 0.18s ease',
      }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {children}
    </button>
  )
}

// ── Animated Prompt Box ───────────────────────────────────────────────────
const THOUGHTS = [
  'The concept of emergence in complex systems…',
  'Second Brain methodology by Tiago Forte…',
  'Why dopamine affects creativity at night…',
  'Latest research on attention restoration theory…',
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
      background: T.surface, borderRadius: '1.25rem', border: `1.5px solid ${T.green}`,
      boxShadow: '0 0 0 5px rgba(34,197,94,0.09), 0 12px 48px rgba(20,83,45,0.1)',
      padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.7rem',
      maxWidth: 580, width: '100%', animation: 'lp-float 4s ease-in-out infinite',
    }}>
      <Icon name="eco" size={20} color={T.green} />
      <span style={{ flex: 1, fontSize: 15, color: text ? T.text : T.text2, minHeight: 22 }}>
        {text}
        <span style={{ animation: 'lp-cursor-blink 1s step-end infinite', color: T.green }}>|</span>
        {!text && <span style={{ color: T.text2 }}>Nurture a new idea…</span>}
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

// ── Hero ──────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '7rem 2rem 5rem', background: T.bg, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-60%)',
        width: 800, height: 800, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,197,94,0.07) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{ maxWidth: 780, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: T.container,
          borderRadius: 999, padding: '5px 16px', fontSize: 12, fontWeight: 600, color: T.darkGreen,
          marginBottom: '1.75rem', letterSpacing: '0.04em', animation: 'lp-fadeUp 0.5s ease forwards',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
          Now in early access
        </div>

        <h1 style={{
          fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(44px,7.5vw,72px)', fontWeight: 400,
          color: T.darkGreen, lineHeight: 1.06, letterSpacing: '-0.01em', marginBottom: '1.5rem',
          animation: 'lp-fadeUp 0.6s 0.1s ease forwards', opacity: 0,
        }}>
          Your ideas deserve<br />
          <em style={{ color: T.green, fontStyle: 'italic' }}>to grow.</em>
        </h1>

        <p style={{
          fontSize: 19, color: T.text2, lineHeight: 1.7, maxWidth: 580, margin: '0 auto 2.5rem', fontWeight: 400,
          animation: 'lp-fadeUp 0.6s 0.2s ease forwards', opacity: 0,
        }}>
          Build your garden with your ideas. Your living laboratory — where curiosity compounds,
          knowledge decays into clarity, and your best thinking is always within reach.
        </p>

        <div style={{
          display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap',
          marginBottom: '3.5rem', animation: 'lp-fadeUp 0.6s 0.3s ease forwards', opacity: 0,
        }}>
          <Link href="/onboarding"><PillButton size="lg">Start your garden — free</PillButton></Link>
          <a href="#how-it-works"><GhostButton>See how it works</GhostButton></a>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', animation: 'lp-fadeUp 0.6s 0.45s ease forwards', opacity: 0 }}>
          <PromptBox />
        </div>
      </div>
    </section>
  )
}

// ── Feature Mockups ───────────────────────────────────────────────────────
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
        <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', animation: 'lp-fadeUp 0.4s ease' }}>
          <div style={{
            maxWidth: '82%', padding: '0.65rem 0.9rem',
            borderRadius: m.role === 'user' ? '1rem 1rem 0.2rem 1rem' : '1rem 1rem 1rem 0.2rem',
            background: m.role === 'user' ? T.darkGreen : T.container,
            color: m.role === 'user' ? '#fff' : T.darkGreen, fontSize: 12, lineHeight: 1.6,
          }}>
            {m.text}
          </div>
        </div>
      ))}
      {shown >= msgs.length && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, animation: 'lp-fadeIn 0.5s ease' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, animation: 'lp-node-pulse 1s ease infinite' }} />
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
      <div style={{ background: T.container, borderRadius: '0.6rem', padding: '0.6rem 0.9rem', fontSize: 12, color: T.darkGreen, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="mic" size={12} color={T.green} />
        "Block deep work Tue morning" — done ✓
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 4 }}>
        {days.map((d, i) => (
          <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: T.text2, textAlign: 'center', paddingBottom: 2 }}>{d}</div>
            <div style={{ flex: 1, background: '#f5f5f2', borderRadius: '0.4rem', position: 'relative', minHeight: 80 }}>
              {events.filter(e => e.day === i).map(ev => (
                <div key={ev.label} style={{
                  position: 'absolute', left: 2, right: 2, top: ev.top / 2 + '%', height: ev.h / 2 + '%',
                  background: ev.color, borderRadius: '0.3rem', opacity: 0.85,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: '#fff', fontWeight: 600, padding: '0 3px', textAlign: 'center',
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
    { x: 20, y: 25, label: 'Attention', r: 16 },
    { x: 78, y: 28, label: 'Flow', r: 16 },
    { x: 15, y: 72, label: 'Memory', r: 14 },
    { x: 82, y: 72, label: 'Habits', r: 14 },
    { x: 50, y: 82, label: 'Focus', r: 13 },
  ]
  const edges = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [2, 4]]
  const [active, setActive] = useState(0)
  useEffect(() => { const t = setInterval(() => setActive(a => (a + 1) % nodes.length), 900); return () => clearInterval(t) }, [])
  return (
    <div style={{ padding: '1rem', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: 240 }}>
        {edges.map(([a, b], i) => (
          <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={T.border} strokeWidth="0.8" opacity="0.8" />
        ))}
        {nodes.map((n, i) => (
          <g key={i}>
            {i === active && <circle cx={n.x} cy={n.y} r={n.r + 6} fill={T.green} opacity="0.1" style={{ animation: 'lp-pulse-ring 1.2s ease-out infinite' }} />}
            <circle cx={n.x} cy={n.y} r={n.r} fill={i === active ? T.green : T.container} stroke={i === active ? T.green : T.border} strokeWidth="0.8" style={{ transition: 'fill 0.4s ease' }} />
            <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle"
              fontSize={n.primary ? 5 : 4} fontWeight={n.primary ? 700 : 500}
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
        <div key={i} style={{ height: 5, background: T.border, borderRadius: 3, width: w + '%', animation: `lp-fadeIn 0.4s ${i * 0.12}s ease both` }} />
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
    return Math.max(0.08, base * (0.5 + Math.random() * 0.5))
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
        <p style={{ fontSize: 11, color: T.darkGreen, lineHeight: 1.6 }}>
          &ldquo;The concept of emergence — where complex behaviour arises from simple rules…&rdquo;
        </p>
      </div>
    </div>
  )
}

function MockupAcademic() {
  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: T.container, borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
        <Icon name="search" size={13} color={T.green} />
        <span style={{ fontSize: 12, color: T.darkGreen, fontWeight: 500 }}>&ldquo;attention restoration theory 2024&rdquo;</span>
      </div>
      {[
        { title: 'Kahneman et al. — Attention & Effort', journal: 'Nature Neurosci.', match: 97 },
        { title: 'Ophir et al. — Cognitive Control', journal: 'PNAS 2024', match: 91 },
      ].map(p => (
        <div key={p.title} style={{ border: `1px solid ${T.border}`, borderRadius: '0.6rem', padding: '0.65rem 0.8rem', background: T.surface }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.darkGreen, marginBottom: 2 }}>{p.title}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: T.text2 }}>{p.journal}</span>
            <span style={{ fontSize: 10, background: T.container, color: T.green, borderRadius: 999, padding: '1px 7px', fontWeight: 700 }}>{p.match}% match</span>
          </div>
        </div>
      ))}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', border: `1px solid ${T.green}`, borderRadius: '0.6rem', padding: '0.6rem 0.8rem', background: '#f0fdf4' }}>
        <Icon name="mail" size={13} color={T.green} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: T.darkGreen, lineHeight: 1.5 }}>Weekly digest sent — 3 papers matched your garden seeds</span>
      </div>
    </div>
  )
}

function MockupBriefings() {
  const cards = [
    { title: 'Morning Spark', body: 'Your note on stoicism connects to a new study on cognitive reappraisal…', time: '8:00 AM' },
    { title: 'Deep Dive Reminder', body: "You haven't revisited \"Flow states\" in 14 days — ready to grow it?", time: '2:00 PM' },
  ]
  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      {cards.map((c, i) => (
        <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: '0.75rem', padding: '0.85rem', background: T.surface, animation: `lp-fadeUp 0.4s ${i * 0.2}s ease both` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.darkGreen }}>{c.title}</span>
            <span style={{ fontSize: 10, color: T.text2 }}>{c.time}</span>
          </div>
          <p style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>{c.body}</p>
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
    { icon: 'file_text' as IconName, label: 'Markdown', ext: '.md', color: T.darkGreen },
    { icon: 'file_text' as IconName, label: 'PDF', ext: '.pdf', color: T.teal },
  ]
  const apps = ['WhatsApp', 'Telegram', 'Slack', 'Email']
  const [sent, setSent] = useState<string | null>(null)
  return (
    <div style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.1rem' }}>Export as</div>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        {formats.map(f => (
          <div key={f.label}
            style={{ flex: 1, border: `1.5px solid ${T.border}`, borderRadius: '0.65rem', padding: '0.65rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: T.surface, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = f.color)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = T.border)}>
            <Icon name={f.icon} size={18} color={f.color} />
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
            fontFamily: 'Sora, sans-serif', textAlign: 'left',
          }}>
            {sent === app ? '✓ ' : '→ '}{app}
          </button>
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
  const lines = [
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
  const colors: Record<string, string> = { comment: '#6a9955', key: '#569cd6', str: '#ce9178', fn: '#dcdcaa', normal: T.text2 }
  return (
    <div style={{ padding: '1.25rem', height: '100%', background: '#1e1e1e', borderRadius: '0.75rem', margin: '0.5rem', overflowY: 'hidden' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.9, fontFamily: 'monospace' }}>
        {lines.map((l, i) => <span key={i} style={{ color: colors[l.t] || T.text2 }}>{l.v}{l.t === 'normal' && l.v === '' ? <br /> : ''}</span>)}
      </div>
    </div>
  )
}

// ── Features Showcase ─────────────────────────────────────────────────────
const FEATURES = [
  { icon: 'eco' as IconName, name: 'Idea Garden', tag: 'Capture', color: T.green, desc: 'Capture fleeting thoughts as seeds. Every idea gets enriched with research and connected to your existing knowledge.', Mockup: MockupIdeaGarden },
  { icon: 'notifications' as IconName, name: 'Smart Briefings', tag: 'Reflect', color: T.teal, desc: 'Receive curated, personalised idea sparks and reflection reminders to build knowledge and encourage deep thinking.', Mockup: MockupBriefings },
  { icon: 'smart_toy' as IconName, name: 'AI Agent', tag: 'Chat', color: T.green, desc: 'Ask Greenplot anything. It searches your garden first, then the web — combining your personal knowledge with live information.', Mockup: MockupAIAgent },
  { icon: 'search' as IconName, name: 'Academic Research', tag: 'Research', color: T.teal, desc: 'Deep academic research with personalised emails and attached papers bridges the gap between what you think is possible and what\'s actually possible.', Mockup: MockupAcademic },
  { icon: 'auto_stories' as IconName, name: 'Wiki', tag: 'Compile', color: T.green, desc: 'Your seeds compile into living wiki articles — encyclopedic summaries of everything you\'ve captured and learned.', Mockup: MockupWiki },
  { icon: 'layers' as IconName, name: 'Share Knowledge', tag: 'Share', color: T.teal, desc: 'Share your garden or wiki as Markdown, PDF, or send directly to your favourite messenger app. You control what you share.', Mockup: MockupShare },
  { icon: 'calendar_month' as IconName, name: 'Calendar', tag: 'Organise', color: T.teal, desc: 'Chat to schedule. "Block two hours for deep work tomorrow" — done. Greenplot talks directly to Google Calendar.', Mockup: MockupCalendar },
  { icon: 'mic' as IconName, name: 'Voice Capture', tag: 'Record', color: T.green, desc: 'Record a voice memo on the go. Greenplot transcribes, enriches, and plants it in your garden automatically.', Mockup: MockupVoice },
  { icon: 'hub' as IconName, name: 'Knowledge Graph', tag: 'Connect', color: T.teal, desc: 'See your ideas as an interactive network. Discover unexpected connections between everything you\'ve ever captured.', Mockup: MockupKnowledgeGraph },
  { icon: 'dns' as IconName, name: 'MCP Server', tag: 'Build', color: T.green, desc: 'Expose your Garden to your favourite Agentic Coding tool and build your ideas directly into your workflow.', Mockup: MockupMCP },
]

function FeaturesShowcase() {
  const [active, setActive] = useState(0)
  const [headerRef, headerInView] = useInView()
  const feat = FEATURES[active]
  const MockupComp = feat.Mockup

  return (
    <section id="features" style={{ padding: '6rem 2rem', background: T.surface }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div ref={headerRef} style={{
          textAlign: 'center', marginBottom: '3rem',
          opacity: headerInView ? 1 : 0, transform: headerInView ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease',
        }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: T.green, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Features</p>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(28px,4vw,44px)', fontWeight: 400, color: T.darkGreen, letterSpacing: '-0.01em' }}>
            Everything Your Living Laboratory needs
          </h2>
        </div>

        <div className="lp-features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: '2rem', alignItems: 'stretch' }}>
          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {FEATURES.map((f, i) => {
              const isActive = i === active
              return (
                <button key={f.name} onClick={() => setActive(i)} style={{
                  display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1.1rem',
                  borderRadius: '0.85rem', border: `1.5px solid ${isActive ? f.color : T.border}`,
                  background: isActive ? T.container : 'transparent', cursor: 'pointer',
                  textAlign: 'left', transition: 'all 0.22s ease', fontFamily: 'Sora, sans-serif',
                  boxShadow: isActive ? '0 2px 12px rgba(34,197,94,0.12)' : 'none',
                  transform: isActive ? 'translateX(4px)' : 'translateX(0)',
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: '0.6rem', flexShrink: 0, background: isActive ? f.color + '22' : T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.22s' }}>
                    <Icon name={f.icon} size={18} color={isActive ? f.color : T.text2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? T.darkGreen : T.text, lineHeight: 1.3 }}>{f.name}</div>
                    {isActive && <div style={{ fontSize: 11, color: T.text2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.desc}</div>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? f.color : T.border, background: isActive ? f.color + '18' : 'transparent', borderRadius: 999, padding: '2px 8px', flexShrink: 0, transition: 'all 0.22s' }}>{f.tag}</span>
                </button>
              )
            })}
          </div>

          {/* Mockup panel */}
          <div className="lp-features-mockup" style={{ position: 'sticky', top: '5rem', height: 'fit-content' }}>
            <div key={active} style={{ background: T.bg, border: `1.5px solid ${T.border}`, borderRadius: '1.5rem', minHeight: 380, overflow: 'hidden', boxShadow: '0 4px 32px rgba(20,83,45,0.07)', animation: 'lp-slide-in 0.3s ease' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '0.75rem', background: T.surface }}>
                <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: feat.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={feat.icon} size={16} color={feat.color} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.darkGreen }}>{feat.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: feat.color, background: feat.color + '18', borderRadius: 999, padding: '2px 10px' }}>{feat.tag}</span>
              </div>
              <div style={{ minHeight: 340 }}>
                <MockupComp />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Flywheel ──────────────────────────────────────────────────────────────
const STEPS = [
  { icon: 'add_circle' as IconName, color: T.green, label: 'Capture', desc: 'Send a voice memo, paste a link, or type a thought. Takes 5 seconds.' },
  { icon: 'auto_awesome' as IconName, color: T.teal, label: 'Enrich', desc: 'Greenplot researches your idea, adds context, extracts entities, and connects it to related seeds.' },
  { icon: 'trending_up' as IconName, color: T.darkGreen, label: 'Grow', desc: 'Every question gets smarter. Your garden becomes a personal knowledge engine that compounds over time.' },
]

function Flywheel() {
  const [active, setActive] = useState(0)
  const [headerRef, headerInView] = useInView()
  const [bodyRef, bodyInView] = useInView()

  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % 3), 2200)
    return () => clearInterval(t)
  }, [])

  return (
    <section id="how-it-works" style={{ padding: '6rem 2rem', background: T.bg }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div ref={headerRef} style={{ textAlign: 'center', marginBottom: '3.5rem', opacity: headerInView ? 1 : 0, transform: headerInView ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.6s ease' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: T.green, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.6rem' }}>How it works</p>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(28px,4vw,44px)', fontWeight: 400, color: T.darkGreen, letterSpacing: '-0.01em' }}>
            The flywheel that makes you smarter over time
          </h2>
        </div>

        <div ref={bodyRef} style={{ opacity: bodyInView ? 1 : 0, transform: bodyInView ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.7s ease' }}>
          {/* Steps */}
          <div className="lp-flywheel-steps" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: '3rem', flexWrap: 'wrap' }}>
            {STEPS.map((step, i) => {
              const isActive = i === active
              return (
                <div key={step.label} style={{ display: 'flex', alignItems: 'center' }}>
                  <div className="lp-flywheel-card" onClick={() => setActive(i)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9rem',
                    padding: '2rem 2.5rem', borderRadius: '1.5rem', cursor: 'pointer',
                    background: isActive ? T.surface : T.bg,
                    border: `2px solid ${isActive ? step.color : T.border}`,
                    boxShadow: isActive ? `0 0 0 4px ${step.color}18, 0 8px 32px rgba(20,83,45,0.1)` : 'none',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                    minWidth: 200,
                  }}>
                    <div style={{ position: 'relative' }}>
                      {isActive && <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: `2px solid ${step.color}`, opacity: 0.3, animation: 'lp-pulse-ring 1.5s ease-out infinite' }} />}
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: isActive ? step.color + '22' : T.border + '80', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.4s ease' }}>
                        <Icon name={step.icon} size={28} color={isActive ? step.color : T.text2} strokeWidth={1.5} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isActive ? step.color : T.text2, marginBottom: '0.3rem' }}>Step {i + 1}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: isActive ? T.darkGreen : T.text, fontFamily: "'DM Serif Display', serif" }}>{step.label}</div>
                    </div>
                  </div>

                  {i < STEPS.length - 1 && (
                    <div className="lp-flywheel-arrow" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0 0.5rem', flexShrink: 0 }}>
                      <svg width="64" height="20" viewBox="0 0 64 20" fill="none" style={{ overflow: 'visible' }}>
                        <path d="M4 10 Q32 10 60 10" stroke={T.border} strokeWidth="1.5" strokeDasharray="4 3" />
                        {active > i && (
                          <path d="M4 10 Q32 10 60 10" stroke={STEPS[i + 1].color} strokeWidth="2"
                            strokeDasharray="60" strokeDashoffset="0" style={{ animation: 'lp-flow 1.8s ease infinite' }} />
                        )}
                        <path d="M54 5 L60 10 L54 15" stroke={active > i ? STEPS[i + 1].color : T.border} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Detail card */}
          <div key={active} style={{ maxWidth: 560, margin: '0 auto', background: T.surface, borderRadius: '1.25rem', padding: '1.75rem 2rem', border: `1.5px solid ${STEPS[active].color}`, boxShadow: `0 4px 24px ${STEPS[active].color}18`, animation: 'lp-fadeUp 0.35s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '0.6rem', background: STEPS[active].color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={STEPS[active].icon} size={18} color={STEPS[active].color} />
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.darkGreen }}>{STEPS[active].label}</span>
            </div>
            <p style={{ fontSize: 15, color: T.text2, lineHeight: 1.7 }}>{STEPS[active].desc}</p>
          </div>

          {/* Progress dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '2rem' }}>
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => setActive(i)} style={{ width: i === active ? 24 : 8, height: 8, borderRadius: 999, border: 'none', cursor: 'pointer', background: i === active ? STEPS[i].color : T.border, transition: 'all 0.3s ease', padding: 0 }} />
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
    <section style={{ padding: '6rem 2rem', background: T.container }}>
      <div ref={ref} style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.7s ease' }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 72, color: T.green, lineHeight: 0.7, marginBottom: '1.5rem', fontStyle: 'italic' }}>&ldquo;</div>
        <blockquote style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(20px,3vw,30px)', fontWeight: 400, color: T.darkGreen, lineHeight: 1.5, letterSpacing: '-0.01em', fontStyle: 'italic', border: 'none', margin: 0 }}>
          I used to lose my best ideas in 47 different apps, countless bookmarks and unstructured notes.
          Now they all live in one garden.
        </blockquote>
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────
function CTA() {
  const [ref, inView] = useInView()
  return (
    <section style={{ padding: '6rem 2rem', background: T.bg }}>
      <div ref={ref} style={{ maxWidth: 660, margin: '0 auto', textAlign: 'center', opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.7s ease' }}>
        <div style={{ background: T.container, borderRadius: '2rem', padding: '4rem 2.5rem', border: `1.5px solid rgba(34,197,94,0.25)`, boxShadow: '0 4px 40px rgba(34,197,94,0.1)' }}>
          <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'center' }}>
            <Icon name="eco" size={42} color={T.green} />
          </div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(28px,4vw,40px)', fontWeight: 400, color: T.darkGreen, letterSpacing: '-0.01em', marginBottom: '1rem' }}>
            Plant your first idea today.
          </h2>
          <p style={{ fontSize: 17, color: T.text2, marginBottom: '2.25rem', lineHeight: 1.65 }}>
            Free to start. Your knowledge, your garden, your control.
          </p>
          <Link href="/onboarding"><PillButton size="lg">Get started — it&apos;s free</PillButton></Link>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: T.surface, borderTop: `1px solid ${T.border}`, padding: '1.75rem 2rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <Logo />
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          {['Privacy', 'Terms', 'GitHub'].map(l => (
            <a key={l} href="#" style={{ color: T.text2, textDecoration: 'none', fontSize: 13, fontWeight: 500, transition: 'color 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.color = T.darkGreen)}
              onMouseLeave={e => (e.currentTarget.style.color = T.text2)}>{l}</a>
          ))}
        </div>
        <p style={{ fontSize: 13, color: T.text2, fontWeight: 500 }}>Built with 💚 for curious minds</p>
      </div>
    </footer>
  )
}

// ── Landing Page ──────────────────────────────────────────────────────────
export default function LandingPage() {
  // Override the app's overflow:hidden so the landing page can scroll
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtmlHeight = html.style.height
    const prevHtmlOverflow = html.style.overflow
    const prevBodyHeight = body.style.height
    const prevBodyOverflow = body.style.overflow

    html.style.height = 'auto'
    html.style.overflow = 'auto'
    body.style.height = 'auto'
    body.style.overflow = 'auto'

    return () => {
      html.style.height = prevHtmlHeight
      html.style.overflow = prevHtmlOverflow
      body.style.height = prevBodyHeight
      body.style.overflow = prevBodyOverflow
    }
  }, [])

  return (
    <>
      {/* Scoped keyframes — prefixed with lp- to avoid conflicts */}
      <style>{`
        @keyframes lp-fadeUp { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:translateY(0); } }
        @keyframes lp-fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes lp-cursor-blink { 0%,100%{opacity:1;} 50%{opacity:0;} }
        @keyframes lp-float { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-8px);} }
        @keyframes lp-flow { 0%{stroke-dashoffset:200;opacity:0;} 40%{opacity:1;} 100%{stroke-dashoffset:0;opacity:0;} }
        @keyframes lp-pulse-ring { 0%{transform:scale(1);opacity:0.6;} 100%{transform:scale(1.8);opacity:0;} }
        @keyframes lp-slide-in { from{opacity:0;transform:translateX(20px);} to{opacity:1;transform:translateX(0);} }
        @keyframes lp-node-pulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.12);} }

        /* Responsive */
        @media (max-width: 768px) {
          .landing-nav-links { display: none !important; }
          .landing-hamburger { display: flex !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-features-mockup { position: static !important; }
          .lp-flywheel-arrow { display: none !important; }
          .lp-flywheel-steps { flex-direction: column !important; align-items: stretch !important; }
          .lp-flywheel-card { min-width: unset !important; }
        }
      `}</style>

      <div style={{ fontFamily: 'Sora, sans-serif', background: T.bg, color: T.text, WebkitFontSmoothing: 'antialiased' }}>
        <Navbar />
        <main>
          <Hero />
          <FeaturesShowcase />
          <Flywheel />
          <Testimonial />
          <CTA />
        </main>
        <Footer />
      </div>
    </>
  )
}
