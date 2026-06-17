'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Leaf, Share2, Filter, Link2, Telescope, Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

import Hero from '@/components/layout/hero'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import Segmented from '@/components/ui/v2/segmented'
import Pill from '@/components/ui/v2/pill'
import SectionHeader from '@/components/ui/v2/section-header'
import { SeedDetailSheet } from '@/components/seeds/seed-detail-sheet'
import KnowledgeGraph from '@/components/focus/knowledge-graph'
import { readCache, writeCache } from '@/lib/swr-cache'

// ── Types ─────────────────────────────────────────────

interface Seed {
  id: string
  title: string
  text: string
  created: string
  source: string
  domain?: string
  status?: string
  summary?: string
  tags?: string
  energy?: string
  isPaper?: boolean
  parseStatus?: string
  linkCount?: number
}

// ── Helpers ───────────────────────────────────────────

function parseSeed(raw: any): Seed {
  const text = raw.content || raw.text || ''
  const metadata = raw.seed_metadata || raw.metadata || {}
  const domain = raw.domain || metadata.domain || text.match(/Domain:\s*(.+)/)?.[1]?.trim() || ''
  const status = raw.status || metadata.status || text.match(/Status:\s*(.+)/)?.[1]?.trim() || ''
  const energy = metadata.energy || text.match(/Energy:\s*(.+)/)?.[1]?.trim() || ''
  const rawTags = metadata.tags || text.match(/Tags:\s*(.+)/)?.[1]?.trim() || domain
  const tags = Array.isArray(rawTags) ? rawTags.join(', ') : rawTags
  const summary = metadata.summary || ''
  const title = raw.title || text.split('\n')[0]?.slice(0, 60) || 'Untitled'
  const isPaper = (raw.seed_type || metadata.seed_type) === 'paper'
  return {
    id: raw.id || raw._additional?.id || raw.notion_id || '',
    title, text,
    created: raw.created_at || raw.created || '',
    source: raw.source || metadata.source || '',
    domain, status,
    isPaper,
    parseStatus: metadata.parse_status || '',
    linkCount: metadata.link_count,
    ...(summary ? { summary } : {}),
    ...(tags ? { tags } : {}),
    ...(energy ? { energy } : {}),
  }
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 1 ? 'Just now' : `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getStatusInfo(seed: Seed): { label: string; color: string } {
  // Papers being indexed show live progress; once parsed, fall through to the
  // normal enriched status (and surface how many seeds it connected to).
  if (seed.isPaper) {
    const ps = (seed.parseStatus || '').toLowerCase()
    if (ps === 'queued' || ps === 'pending') return { label: 'Queued', color: '#a16207' }
    if (ps === 'parsing') return { label: 'Indexing…', color: '#a16207' }
    if (ps === 'failed') return { label: 'Index failed', color: 'var(--ink-3)' }
    if (ps === 'parsed' && seed.linkCount) return { label: `Connected · ${seed.linkCount}`, color: 'var(--green)' }
  }
  const s = (seed.status || '').toLowerCase()
  if (s.includes('enrich') || s.includes('growing')) return { label: 'Enriched', color: 'var(--green)' }
  if (s.includes('sprout') || s.includes('seedling')) return { label: 'Sprouting', color: '#7dd3a0' }
  // The backend rarely sends an explicit status — infer from enrichment
  // artifacts (summary/domain are written by the enricher) and age.
  if (seed.summary || seed.domain) return { label: 'Enriched', color: 'var(--green)' }
  const ageHrs = (Date.now() - new Date(seed.created).getTime()) / 3_600_000
  if (!isNaN(ageHrs) && ageHrs < 48) return { label: 'Sprouting', color: '#7dd3a0' }
  return { label: 'Dormant', color: 'var(--ink-3)' }
}

// ── Seed Row ──────────────────────────────────────────

function SeedRow({ seed, allSeeds, onClick }: { seed: Seed; allSeeds: Seed[]; onClick: () => void }) {
  const statusInfo = getStatusInfo(seed)
  const tags = seed.domain ? seed.domain.split(',').map(t => t.trim()).filter(Boolean) : []
  const connections = tags.length > 0
    ? allSeeds.filter(s => s.id !== seed.id && s.domain && tags.some(t => s.domain!.toLowerCase().includes(t.toLowerCase()))).length
    : 0

  return (
    <div onClick={onClick} className="v2-card tap rise" style={{ borderRadius: 16, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer' }}>
      <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Leaf size={19} color="var(--green-700)" strokeWidth={1.75} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ui" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {seed.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{formatDate(seed.created)}</span>
          {seed.domain && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: 99, background: 'var(--border-2)' }} />
              <Pill tone="neutral" size="xs">{seed.domain.split(',')[0].trim()}</Pill>
            </>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: statusInfo.color, display: 'inline-block' }} />
          <span className="ui" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-2)' }}>{statusInfo.label}</span>
        </span>
        {connections > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Link2 size={11} color="var(--ink-3)" strokeWidth={1.75} />
            <span className="ui" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{connections}</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────

type ResearchRun = {
  run_id: string
  status: string
  theme: string | null
  finding_count: number
  result_seed_id: string | null
  created_at: string | null
}

const RUN_ACTIVE = new Set(['queued', 'scoping', 'scouting', 'synthesizing', 'reporting'])

function DeepResearchLauncher({ onOpenSeed }: { onOpenSeed: (seedId: string) => void }) {
  const [theme, setTheme] = useState('')
  const [launching, setLaunching] = useState(false)
  const [runs, setRuns] = useState<ResearchRun[]>([])
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const authHeader = (): Record<string, string> => {
    const t = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  const loadRuns = useCallback(async () => {
    try {
      const r = await fetch('/api/research/runs', { headers: authHeader() })
      if (!r.ok) return
      const d = await r.json()
      setRuns(Array.isArray(d.runs) ? d.runs : [])
    } catch { /* offline ok */ }
  }, [])

  // Poll while any run is active (push handles the off-page notification).
  useEffect(() => {
    loadRuns()
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [loadRuns])

  useEffect(() => {
    const active = runs.some(r => RUN_ACTIVE.has(r.status))
    if (pollRef.current) clearTimeout(pollRef.current)
    if (active) pollRef.current = setTimeout(loadRuns, 8000)
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [runs, loadRuns])

  const launch = async () => {
    if (launching) return
    setLaunching(true)
    try {
      const r = await fetch('/api/research/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(theme.trim() ? { theme: theme.trim() } : {}),
      })
      if (!r.ok) throw new Error()
      setTheme('')
      toast.success('Deep research started — I\'ll push + email you when the report\'s ready.', { duration: 6000 })
      loadRuns()
    } catch {
      toast.error('Could not start the run — backend update pending')
    } finally {
      setLaunching(false)
    }
  }

  const activeRun = runs.find(r => RUN_ACTIVE.has(r.status))
  const lastDone = runs.find(r => r.status === 'done' && r.result_seed_id)

  return (
    <div className="v2-card" style={{ borderRadius: 20, padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Telescope size={16} color="var(--green-700)" strokeWidth={1.75} />
        </span>
        <div>
          <div className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Deep Research</div>
          <div className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)' }}>Send agents across your garden + the latest sources to find a gap.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') launch() }}
          placeholder="Focus (optional) — e.g. small language model deployment"
          className="ui"
          style={{ flex: 1, minWidth: 0, fontSize: 13, background: 'var(--surface-sunk)', border: '1px solid var(--hairline)', borderRadius: 12, padding: '10px 13px', color: 'var(--ink)', outline: 'none' }}
        />
        <button
          onClick={launch}
          disabled={launching || !!activeRun}
          className="tap ui"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--green)', color: '#06281a', border: 'none', borderRadius: 9999, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: (launching || activeRun) ? 'default' : 'pointer', opacity: (launching || activeRun) ? 0.6 : 1, flexShrink: 0 }}
        >
          {launching ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Telescope size={14} strokeWidth={2} />}
          {launching ? 'Starting…' : 'Go deep'}
        </button>
      </div>

      {activeRun && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: 'var(--green-tint)', borderRadius: 12, padding: '9px 12px' }}>
          <Loader2 size={13} strokeWidth={2} className="animate-spin" color="var(--green-700)" />
          <span className="ui" style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-deep)' }}>
            {activeRun.theme || 'Research'} — {activeRun.status}…
          </span>
        </div>
      )}

      {!activeRun && lastDone && (
        <button
          onClick={() => lastDone.result_seed_id && onOpenSeed(lastDone.result_seed_id)}
          className="tap"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, background: 'var(--surface-sunk)', border: '1px solid var(--hairline)', borderRadius: 12, padding: '10px 13px', cursor: 'pointer', textAlign: 'left' }}
        >
          <Leaf size={15} color="var(--green-700)" strokeWidth={1.75} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ui" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastDone.theme || 'Deep Research'}</div>
            <div className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>Latest report · {lastDone.finding_count} sources</div>
          </div>
          <ArrowRight size={15} color="var(--ink-3)" strokeWidth={1.75} />
        </button>
      )}
    </div>
  )
}

export default function GardenPage() {
  const router = useRouter()
  const [seeds, setSeeds] = useState<Seed[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSeed, setSelectedSeed] = useState<Seed | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [graphOpen, setGraphOpen] = useState(false)
  const [totalSeeds, setTotalSeeds] = useState<number | null>(null)

  const fetchSeeds = useCallback((silent = false) => {
    const token = localStorage.getItem('greenplot_token')
    if (!token) { router.push('/login'); return }

    // Stale-while-revalidate: paint cached seeds instantly, refresh in background
    if (!silent) {
      const cached = readCache<{ seeds: unknown[]; total?: number }>('seeds')
      if (cached?.seeds?.length) {
        setSeeds((cached.seeds as Parameters<typeof parseSeed>[0][]).map(parseSeed))
        if (typeof cached.total === 'number') setTotalSeeds(cached.total)
        setLoading(false)
      } else {
        setLoading(true)
      }
    }

    fetch('/api/seeds?limit=200', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) { localStorage.removeItem('greenplot_token'); window.location.href = '/login'; return { seeds: [] } }
        return r.json()
      })
      .then(data => {
        const raw = data.seeds || data || []
        const parsed = Array.isArray(raw) ? raw.map(parseSeed) : []
        // Do NOT sort here — let the `sorted` computed array own all ordering
        setSeeds(parsed)
        if (typeof data.total === 'number') setTotalSeeds(data.total)
        if (parsed.length) writeCache('seeds', { seeds: raw, total: data.total })
      })
      .catch(() => {})
      .finally(() => { if (!silent) setLoading(false) })
  }, [router])

  // Initial load
  useEffect(() => { fetchSeeds() }, [fetchSeeds])

  // Re-fetch when user returns to the tab/window (catches seeds created in chat)
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchSeeds(true) }
    const onFocus = () => fetchSeeds(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    // Also poll every 20s so the count stays fresh even without a focus change
    const iv = setInterval(() => fetchSeeds(true), 20_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      clearInterval(iv)
    }
  }, [fetchSeeds])

  const handleSeedDeleted = (id: string) => setSeeds(prev => prev.filter(s => s.id !== id))

  // Deep link: /garden?seed=<id> opens that seed's detail directly
  // (used by chat result cards and Library source/seed chips)
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (deepLinkHandled.current || seeds.length === 0) return
    const id = new URLSearchParams(window.location.search).get('seed')
    if (!id) { deepLinkHandled.current = true; return }
    const match = seeds.find(s => s.id === id)
    if (match) {
      deepLinkHandled.current = true
      setSelectedSeed(match)
      setDetailOpen(true)
    }
  }, [seeds])

  // Stat chips: Seeds count + unique non-generic domains
  const _GENERIC_DOMAINS = new Set(['', 'general', 'none', 'untagged', 'idea', 'note', 'misc'])
  const domainCount = new Set(
    seeds.map(s => (s.domain || '').toLowerCase().trim()).filter(d => !_GENERIC_DOMAINS.has(d))
  ).size

  const focusSeed = seeds[0]

  const sorted = [...seeds].sort((a, b) => {
    const ta = new Date(a.created).getTime()
    const tb = new Date(b.created).getTime()
    return sortDir === 'desc' ? tb - ta : ta - tb
  })

  return (
    <div style={{ background: 'var(--bg)', height: '100dvh', overflowY: 'auto', overflowX: 'hidden' }}>
      <Header />

      {/* Dark forest hero — tall variant with stat chips */}
      <Hero
        eyebrow={(totalSeeds ?? seeds.length) > 0 ? `${totalSeeds ?? seeds.length} SEEDS GROWING` : 'YOUR GARDEN'}
        title="Knowledge"
        accent="Garden"
        tall
        subtitle="Cultivating intelligence through structured, organic seeds of thought."
      >
        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          {[
            { n: totalSeeds ?? seeds.length, l: 'Seeds' },
            { n: domainCount, l: 'Domains' },
          ].map(({ n, l }) => (
            <div key={l} className="glass-dark" style={{ flex: 1, borderRadius: 15, padding: '11px 12px' }}>
              <div className="serif" style={{ fontSize: 24, color: '#fff', lineHeight: 1 }}>{n}</div>
              <div className="ui" style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(180,240,205,0.85)', marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
      </Hero>

      {/* Workspace */}
      <div className="desk-wrap" style={{ position: 'relative', zIndex: 3, marginTop: -18, padding: '0 18px', paddingBottom: 120 }}>
        {/* View toggle + sort */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Segmented
            value={viewMode}
            onChange={(k) => {
              if (k === 'graph') setGraphOpen(true)
              else setViewMode(k as 'list' | 'graph')
            }}
            items={[
              { key: 'list', label: 'List' },
              { key: 'graph', label: 'Graph', Icon: Share2 },
            ]}
          />
          <button
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="tap"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--border-2)', borderRadius: 9999, padding: '7px 13px', fontSize: 12, fontFamily: 'var(--ui)', fontWeight: 500, cursor: 'pointer' }}
          >
            <Filter size={14} color="var(--ink-2)" strokeWidth={1.75} />
            {sortDir === 'desc' ? '↓ Newest' : '↑ Oldest'}
          </button>
        </div>

        {/* Deep Research launcher */}
        <DeepResearchLauncher onOpenSeed={(seedId) => {
          const s = seeds.find(x => x.id === seedId)
          if (s) { setSelectedSeed(s); setDetailOpen(true) }
          else router.push(`/garden?seed=${seedId}`)
        }} />

        {/* Focus Seed */}
        {!loading && focusSeed && (
          <div
            onClick={() => { setSelectedSeed(focusSeed); setDetailOpen(true) }}
            className="glass tap"
            style={{ borderRadius: 22, padding: 18, marginTop: 16, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
          >
            <div style={{ position: 'absolute', top: -30, right: -20, width: 130, height: 130, borderRadius: 99, background: 'radial-gradient(circle, rgba(34,197,94,0.18), transparent 70%)' }} />
            <div style={{ position: 'relative' }}>
              <Pill tone="green" size="xs">FOCUS SEED</Pill>
              <h3 className="serif" style={{ fontSize: 22, color: 'var(--ink)', marginTop: 10, lineHeight: 1.15 }}>
                {focusSeed.title}
              </h3>
              <p className="body-text" style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.55 }}>
                {focusSeed.summary || focusSeed.text?.slice(0, 120) || 'Your garden is enriching this seed — pulling related ideas and connections.'}
              </p>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--surface-sunk)', overflow: 'hidden' }}>
                  <div style={{
                    width: '65%', height: '100%', borderRadius: 99,
                    background: 'linear-gradient(90deg, var(--green), #7ef0a8)',
                    transformOrigin: 'left',
                    animation: 'growbar 0.9s cubic-bezier(0.16,1,0.3,1) both',
                  }} />
                </div>
                <span className="ui" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--green-700)' }}>65%</span>
              </div>
            </div>
          </div>
        )}

        <SectionHeader action="View graph" onAction={() => setGraphOpen(true)}>Recent seeds</SectionHeader>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 9 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: 72, borderRadius: 16, background: 'var(--surface-sunk)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
            <Leaf size={48} strokeWidth={1} color="var(--ink-3)" style={{ margin: '0 auto 12px' }} />
            <p className="serif" style={{ fontSize: 22, color: 'var(--ink-2)' }}>Empty garden</p>
            <p className="body-text" style={{ fontSize: 13, marginTop: 8 }}>Plant your first idea in Chat</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 9 }}>
            {sorted.map((seed, i) => (
              <SeedRow
                key={seed.id}
                seed={seed}
                allSeeds={seeds}
                onClick={() => { setSelectedSeed(seed); setDetailOpen(true) }}
              />
            ))}
          </div>
        )}
      </div>

      <BottomNav />

      {/* Seed detail */}
      {selectedSeed && (
        <SeedDetailSheet
          seed={selectedSeed}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onDeleted={handleSeedDeleted}
        />
      )}

      {/* Knowledge Graph overlay */}
      {graphOpen && (
        <KnowledgeGraph onClose={() => { setGraphOpen(false); setViewMode('list') }} />
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes growbar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      `}</style>
    </div>
  )
}
