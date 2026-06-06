'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Leaf, Share2, Filter, Link2 } from 'lucide-react'
import { toast } from 'sonner'

import Hero from '@/components/layout/hero'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import Segmented from '@/components/ui/v2/segmented'
import Pill from '@/components/ui/v2/pill'
import SectionHeader from '@/components/ui/v2/section-header'
import { SeedDetailSheet } from '@/components/seeds/seed-detail-sheet'
import KnowledgeGraph from '@/components/focus/knowledge-graph'

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
  return {
    id: raw.id || raw._additional?.id || raw.notion_id || '',
    title, text,
    created: raw.created_at || raw.created || '',
    source: raw.source || metadata.source || '',
    domain, status,
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

function getStatusInfo(status: string): { label: string; color: string } {
  const s = (status || '').toLowerCase()
  if (s.includes('enrich') || s.includes('growing')) return { label: 'Enriched', color: 'var(--green)' }
  if (s.includes('sprout') || s.includes('seedling')) return { label: 'Sprouting', color: '#7dd3a0' }
  return { label: 'Dormant', color: 'var(--ink-3)' }
}

// ── Seed Row ──────────────────────────────────────────

function SeedRow({ seed, allSeeds, onClick }: { seed: Seed; allSeeds: Seed[]; onClick: () => void }) {
  const statusInfo = getStatusInfo(seed.status || '')
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

export default function GardenPage() {
  const router = useRouter()
  const [seeds, setSeeds] = useState<Seed[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSeed, setSelectedSeed] = useState<Seed | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [graphOpen, setGraphOpen] = useState(false)
  const [linkCount, setLinkCount] = useState(0)

  useEffect(() => {
    const token = localStorage.getItem('greenplot_token')
    if (!token) { router.push('/login'); return }

    fetch('/api/seeds?limit=200', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) { localStorage.removeItem('greenplot_token'); window.location.href = '/login'; return { seeds: [] } }
        return r.json()
      })
      .then(data => {
        const raw = data.seeds || data || []
        const parsed = Array.isArray(raw) ? raw.map(parseSeed) : []
        parsed.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
        setSeeds(parsed)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    // Fetch link count for stats
    fetch('/api/links?limit=1', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setLinkCount(d.total || d.links?.length || 0))
      .catch(() => {})
  }, [router])

  const handleSeedDeleted = (id: string) => setSeeds(prev => prev.filter(s => s.id !== id))

  const sprouting = seeds.filter(s => getStatusInfo(s.status || '').label === 'Sprouting').length
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
        eyebrow={seeds.length > 0 ? `${seeds.length} SEEDS GROWING` : 'YOUR GARDEN'}
        title="Knowledge"
        accent="Garden"
        tall
        subtitle="Cultivating intelligence through structured, organic seeds of thought."
      >
        <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
          {[
            { n: seeds.length, l: 'Seeds' },
            { n: linkCount, l: 'Links' },
            { n: sprouting, l: 'Sprouting' },
          ].map(({ n, l }) => (
            <div key={l} className="glass-dark" style={{ flex: 1, borderRadius: 15, padding: '11px 12px' }}>
              <div className="serif" style={{ fontSize: 24, color: '#fff', lineHeight: 1 }}>{n}</div>
              <div className="ui" style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(180,240,205,0.85)', marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
      </Hero>

      {/* Workspace */}
      <div style={{ position: 'relative', zIndex: 3, marginTop: -18, padding: '0 18px', paddingBottom: 120 }}>
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
            Sort
          </button>
        </div>

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
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
