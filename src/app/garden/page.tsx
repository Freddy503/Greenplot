'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import BottomNav from '@/components/layout/bottom-nav'

// ── Types ─────────────────────────────────────────────

interface Seed {
  id: string
  title: string
  text: string
  created: string
  source: string
  domain?: string
  status?: string
  _additional?: { id: string }
}

// ── Parse seed metadata ───────────────────────────────

function parseSeed(raw: any): Seed {
  const text = raw.text || ''
  const domain = raw.domain || text.match(/Domain:\s*(.+)/)?.[1]?.trim() || ''
  const status = raw.status || text.match(/Status:\s*(.+)/)?.[1]?.trim() || ''
  const title = raw.title || text.split('\n')[0]?.slice(0, 60) || 'Untitled'
  return {
    id: raw._additional?.id || raw.notion_id || '',
    title,
    text,
    created: raw.created || '',
    source: raw.source || '',
    domain,
    status,
  }
}

// ── Status helpers ────────────────────────────────────

function getStatusStyle(status: string) {
  if (status.toLowerCase().includes('enrich') || status.toLowerCase().includes('growing'))
    return { color: '#f8a010', label: 'Enriched' }
  if (status.toLowerCase().includes('sprout') || status.toLowerCase().includes('seedling'))
    return { color: '#69f6b8', label: 'Sprouting' }
  return { color: '#9ab0a5', label: 'Dormant' }
}

function getSeedIcon(domain: string) {
  const d = domain.toLowerCase()
  if (d.includes('ai') || d.includes('tech')) return 'psychiatry'
  if (d.includes('eco') || d.includes('sustain')) return 'energy_savings_leaf'
  if (d.includes('design')) return 'eco'
  if (d.includes('business') || d.includes('logistics')) return 'potted_plant'
  return 'eco'
}

// ── Seed Row Component ────────────────────────────────

function SeedRow({ seed, onClick }: { seed: Seed; onClick: () => void }) {
  const icon = getSeedIcon(seed.domain || '')
  const isFilled = icon === 'psychiatry' || icon === 'eco'
  const statusStyle = getStatusStyle(seed.status || '')
  const tags = seed.domain ? seed.domain.split(',').map((t: string) => t.trim()).filter(Boolean) : []

  return (
    <div
      className="grid grid-cols-[48px_1fr_80px] items-center px-4 py-5 cursor-pointer group active:scale-[0.99] transition-all duration-200"
      style={{ borderBottom: '1px solid rgba(56,76,67,0.05)' }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#051e15')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div className="flex items-center justify-center">
        <span
          className="material-symbols-outlined text-xl"
          style={{
            color: '#69f6b8',
            fontVariationSettings: isFilled ? '"FILL" 1' : '"FILL" 0',
          }}
        >
          {icon}
        </span>
      </div>
      <div className="pr-4">
        <h3
          className="text-sm font-bold mb-1 transition-colors"
          style={{ color: '#e4fcf0' }}
        >
          {seed.title}
        </h3>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag: string, i: number) => (
              <span
                key={i}
                className="text-[9px] px-2 py-0.5 rounded-full"
                style={{
                  background: '#09241b',
                  color: '#9ab0a5',
                  border: '1px solid rgba(56,76,67,0.20)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="text-right">
        <span
          className="text-[10px] font-bold uppercase tracking-tighter"
          style={{ color: statusStyle.color }}
        >
          {statusStyle.label}
        </span>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────

export default function GardenPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [seeds, setSeeds] = useState<Seed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nickname, setNickname] = useState('')

  useEffect(() => {
    setNickname(localStorage.getItem('greenplot_nickname') || '')
    const token = localStorage.getItem('greenplot_token')
    fetch('/api/seeds?limit=50', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        const raw = data.seeds || data || []
        setSeeds(Array.isArray(raw) ? raw.map(parseSeed) : [])
      })
      .catch(() => setError('Could not load seeds'))
      .finally(() => setLoading(false))
  }, [])

  // Pick a "focus seed" — the most recent one
  const focusSeed = seeds[0]

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#01120b' }}>
      {/* ── Header ───────────────────────────────────── */}
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16"
        style={{ background: 'rgba(1,18,11,0.8)', backdropFilter: 'blur(24px)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
            style={{ background: '#0d2b21', color: '#69f6b8' }}
          >
            {nickname.charAt(0).toUpperCase() || 'G'}
          </div>
          <span
            className="text-xl font-bold tracking-tighter"
            style={{ color: '#69f6b8' }}
          >
            Greenplot
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            className="p-2 rounded-full transition-colors"
            style={{ color: '#9ab0a5' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#0d2b21')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="material-symbols-outlined">search</span>
          </button>
          <button
            className="text-sm uppercase tracking-widest px-3 py-1 rounded-full transition-colors font-medium"
            style={{ color: '#9ab0a5' }}
            onClick={() => router.push('/chat')}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#0d2b21')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Chat
          </button>
        </div>
      </header>

      <main className="pt-20 pb-32 px-4 max-w-2xl mx-auto w-full">
        {/* ── Chat/Garden Toggle ─────────────────────── */}
        <div className="flex justify-center mb-8">
          <div
            className="p-1.5 rounded-full flex items-center w-full max-w-[280px]"
            style={{ background: '#021710' }}
          >
            <button
              className="flex-1 py-2 px-4 rounded-full text-sm font-bold transition-all"
              style={{ color: '#9ab0a5' }}
              onClick={() => router.push('/chat')}
            >
              Chat
            </button>
            <button
              className="flex-1 py-2 px-4 rounded-full text-sm font-bold shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #69f6b8, #06b77f)',
                color: '#005a3c',
              }}
            >
              Garden
            </button>
          </div>
        </div>

        {/* ── Hero ───────────────────────────────────── */}
        <section className="mb-8 px-2">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 leading-tight" style={{ color: '#e4fcf0' }}>
            Knowledge <span style={{ color: '#69f6b8' }}>Garden</span>
          </h1>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: '#9ab0a5' }}>
            Cultivating intelligence through structured organic seeds of thought.
          </p>
        </section>

        {/* ── Seed Table ─────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span
              className="material-symbols-outlined text-3xl animate-spin"
              style={{ color: '#69f6b8' }}
            >
              progress_activity
            </span>
          </div>
        ) : error ? (
          <div
            className="rounded-lg p-6 text-center text-sm"
            style={{ background: 'rgba(255,113,108,0.1)', color: '#ff716c' }}
          >
            <span className="material-symbols-outlined text-2xl mb-2 block">cloud_off</span>
            {error}
          </div>
        ) : seeds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="material-symbols-outlined text-5xl mb-4" style={{ color: '#9ab0a5' }}>
              search_off
            </span>
            <p className="text-sm" style={{ color: '#9ab0a5' }}>
              No seeds yet. Capture ideas in the chat to grow your garden.
            </p>
          </div>
        ) : (
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: '#021710', border: '1px solid rgba(56,76,67,0.10)' }}
          >
            {/* Table Header */}
            <div
              className="grid grid-cols-[48px_1fr_80px] px-4 py-3 text-[10px] uppercase tracking-[0.1em] font-bold"
              style={{ color: '#9ab0a5', borderBottom: '1px solid rgba(56,76,67,0.10)' }}
            >
              <div>Type</div>
              <div>Seed Title</div>
              <div className="text-right">Status</div>
            </div>
            {/* Seed Rows */}
            <div>
              {seeds.map((seed) => (
                <SeedRow
                  key={seed.id}
                  seed={seed}
                  onClick={() => {}}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Focus Seed Card ────────────────────────── */}
        {focusSeed && (
          <div
            className="mt-10 relative overflow-hidden rounded-lg p-6"
            style={{
              background: '#051e15',
              border: '1px solid rgba(105,246,184,0.10)',
            }}
          >
            <div
              className="absolute -right-10 -top-10 w-40 h-40 rounded-full"
              style={{ background: 'rgba(105,246,184,0.05)', filter: 'blur(48px)' }}
            />
            <div className="relative z-10">
              <span
                className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
                style={{ background: 'rgba(248,160,16,0.20)', color: '#f8a010' }}
              >
                Focus Seed
              </span>
              <h4 className="text-xl font-bold mb-2" style={{ color: '#e4fcf0' }}>
                {focusSeed.title}
              </h4>
              <p className="text-xs leading-relaxed mb-4" style={{ color: '#9ab0a5' }}>
                Your garden is currently enriching this seed. Estimated bloom soon.
              </p>
              <div
                className="w-full h-1.5 rounded-full overflow-hidden"
                style={{ background: '#021710' }}
              >
                <div
                  className="h-full w-[65%] rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #69f6b8, #06b77f)',
                    boxShadow: '0 0 8px rgba(105,246,184,0.4)',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── FAB ──────────────────────────────────────── */}
      <button
        className="fixed bottom-28 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-transform z-40"
        style={{
          background: '#f8a010',
          color: '#4a2c00',
          boxShadow: '0 8px 24px rgba(248,160,16,0.30)',
        }}
        onClick={() => router.push('/chat')}
      >
        <span className="material-symbols-outlined text-2xl font-bold">add</span>
      </button>

      {/* ── Bottom Nav ───────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-2"
        style={{
          background: 'rgba(2,23,16,0.80)',
          backdropFilter: 'blur(24px)',
          borderRadius: '32px 32px 0 0',
          boxShadow: '0 -10px 40px -10px rgba(0,0,0,0.4)',
        }}
      >
        <button className="flex flex-col items-center justify-center p-3 transition-transform active:scale-90" style={{ color: '#9ab0a5' }}>
          <span className="material-symbols-outlined">home</span>
        </button>
        <button
          className="flex flex-col items-center justify-center rounded-full p-3 transition-transform active:scale-90"
          style={{
            background: 'linear-gradient(135deg, #69f6b8, #06b77f)',
            color: '#005a3c',
          }}
          onClick={() => router.push('/chat')}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>chat_bubble</span>
        </button>
        <button className="flex flex-col items-center justify-center p-3 transition-transform active:scale-90" style={{ color: '#9ab0a5' }}>
          <span className="material-symbols-outlined">search</span>
        </button>
        <button className="flex flex-col items-center justify-center p-3 transition-transform active:scale-90" style={{ color: '#9ab0a5' }}>
          <span className="material-symbols-outlined">settings</span>
        </button>
      </nav>
    </div>
  )
}
