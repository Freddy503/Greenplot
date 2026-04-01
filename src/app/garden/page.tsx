'use client'

import { useEffect, useState, useMemo } from 'react'
import Header from '@/components/layout/header'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────

interface Seed {
  id: string
  title: string
  text: string
  created: string
  source: string
  url: string
  notion_id: string
  // Parsed from text when enrichment fields are empty
  domain?: string
  status?: string
  energy?: string
  rating?: number
  connections?: string[]
  summary?: string
}

type StatusFilter = 'all' | 'Seedling 🌱' | 'Growing 🌿'
type ViewMode = 'grid' | 'list'

// ── Helpers ───────────────────────────────────────────

function parseSeedMeta(seed: RawSeed): Seed {
  const text = seed.text || ''
  const domainMatch = text.match(/Domain:\s*(.+)/)
  const statusMatch = text.match(/Status:\s*(.+)/)
  const energyMatch = text.match(/Energy:\s*(.+)/)
  const ratingMatch = text.match(/Rating:\s*(⭐+)/)
  const connectionsMatch = text.match(/Connections:\s*(.+)/)

  // Use enrichment fields if available, otherwise parse from text
  const domain = seed.domain || (domainMatch ? domainMatch[1].trim() : '')
  const status = seed.status || (statusMatch ? statusMatch[1].trim() : '')
  const energy = seed.energy || (energyMatch ? energyMatch[1].trim() : '')
  const rating = ratingMatch ? ratingMatch[1].length : 0
  const connections = connectionsMatch
    ? connectionsMatch[1].split(',').map((s: string) => s.trim())
    : []

  // Clean text: strip metadata lines for display
  const summaryLines = text
    .split('\n')
    .filter((l: string) =>
      l.trim() &&
      !l.match(/^(Rating|Energy|Domain|Status|Connections|Source):/) &&
      !l.match(/^---/)
    )
    .slice(0, 3)
    .join(' ')
  const summary = summaryLines.length > 200
    ? summaryLines.slice(0, 200) + '…'
    : summaryLines

  return {
    id: seed._additional?.id || seed.notion_id || '',
    title: seed.title || 'Untitled',
    text,
    created: seed.created || '',
    source: seed.source || '',
    url: seed.url || '',
    notion_id: seed.notion_id || '',
    domain,
    status,
    energy,
    rating,
    connections,
    summary,
  }
}

interface RawSeed {
  title?: string
  text?: string
  created?: string
  source?: string
  url?: string
  notion_id?: string
  domain?: string | null
  status?: string | null
  energy?: string | null
  _additional?: { id: string }
}

// ── Components ────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = status.includes('Growing')
    ? 'var(--primary)'
    : 'var(--secondary)'
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color,
      }}
    >
      {status}
    </span>
  )
}

function EnergyDot({ energy }: { energy: string }) {
  return (
    <span className="text-xs" title={energy}>
      {energy}
    </span>
  )
}

function StarRating({
  rating,
  onRate,
  seedId,
}: {
  rating: number
  onRate: (id: string, r: number) => void
  seedId: string
}) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className="text-sm transition-transform hover:scale-110"
          style={{
            color: star <= (hover || rating)
              ? 'var(--secondary)'
              : 'var(--muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '1px',
          }}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onRate(seedId, star)}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function SeedCard({
  seed,
  onRate,
  viewMode,
}: {
  seed: Seed
  onRate: (id: string, r: number) => void
  viewMode: ViewMode
}) {
  const [expanded, setExpanded] = useState(false)

  if (viewMode === 'list') {
    return (
      <div
        className="rounded-xl p-4 border transition-colors hover:border-primary/30 cursor-pointer"
        style={{
          background: 'var(--card)',
          borderColor: 'var(--border)',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {seed.domain && (
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--primary)' }}
                >
                  {seed.domain}
                </span>
              )}
              {seed.status && <StatusBadge status={seed.status} />}
              {seed.energy && <EnergyDot energy={seed.energy} />}
            </div>
            <h3
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--foreground)' }}
            >
              {seed.title}
            </h3>
            {!expanded && seed.summary && (
              <p
                className="text-xs mt-1 line-clamp-1"
                style={{ color: 'var(--muted-foreground)' }}
              >
                {seed.summary}
              </p>
            )}
          </div>
          <StarRating rating={seed.rating || 0} onRate={onRate} seedId={seed.id} />
        </div>
        {expanded && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <p
              className="text-xs whitespace-pre-wrap leading-relaxed"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {seed.text.slice(0, 800)}
            </p>
            {(seed.connections?.length ?? 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {seed.connections?.map((c, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--muted)',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    🔗 {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Grid view
  return (
    <div
      className="rounded-xl p-4 border transition-all hover:border-primary/30 hover:shadow-lg cursor-pointer flex flex-col"
      style={{
        background: 'var(--card)',
        borderColor: 'var(--border)',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Domain + Status row */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {seed.domain && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wider truncate"
              style={{ color: 'var(--primary)' }}
            >
              {seed.domain}
            </span>
          )}
        </div>
        <StarRating rating={seed.rating || 0} onRate={onRate} seedId={seed.id} />
      </div>

      {/* Title */}
      <h3
        className="text-sm font-semibold mb-1.5 line-clamp-2"
        style={{ color: 'var(--foreground)' }}
      >
        {seed.title}
      </h3>

      {/* Summary or expanded text */}
      <p
        className="text-xs flex-1 leading-relaxed"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {expanded ? (
          <span className="whitespace-pre-wrap">{seed.text.slice(0, 600)}</span>
        ) : (
          seed.summary
        )}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          {seed.status && <StatusBadge status={seed.status} />}
          {seed.energy && <EnergyDot energy={seed.energy} />}
        </div>
        <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
          {seed.created}
        </span>
      </div>

      {/* Connections (expanded) */}
      {expanded && (seed.connections?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {seed.connections?.map((c, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: 'var(--muted)',
                color: 'var(--muted-foreground)',
              }}
            >
              🔗 {c}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────

export default function GardenPage() {
  const [seeds, setSeeds] = useState<Seed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // Fetch seeds
  useEffect(() => {
    const token = localStorage.getItem('seedify_token')
    fetch('/api/seeds?limit=100', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
        }
        const raw: RawSeed[] = data.seeds || data || []
        setSeeds(Array.isArray(raw) ? raw.map(parseSeedMeta) : [])
      })
      .catch(() => setError('Could not load seeds'))
      .finally(() => setLoading(false))
  }, [])

  // Rate a seed
  const handleRate = (seedId: string, rating: number) => {
    setSeeds((prev) =>
      prev.map((s) => (s.id === seedId ? { ...s, rating } : s))
    )
    const token = localStorage.getItem('seedify_token')
    fetch(`/api/seeds/${seedId}/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ rating }),
    }).catch(() => {
      // Silently fail — rating is optimistic
    })
  }

  // Extract unique domains
  const domains = useMemo(() => {
    const d = new Set<string>()
    seeds.forEach((s) => {
      if (s.domain) {
        s.domain.split(',').forEach((part) => d.add(part.trim()))
      }
    })
    return ['all', ...Array.from(d).sort()]
  }, [seeds])

  // Filter
  const filtered = useMemo(() => {
    return seeds.filter((s) => {
      if (search) {
        const q = search.toLowerCase()
        if (
          !s.title.toLowerCase().includes(q) &&
          !(s.summary || '').toLowerCase().includes(q) &&
          !(s.domain || '').toLowerCase().includes(q)
        ) return false
      }
      if (domainFilter !== 'all' && !(s.domain || '').includes(domainFilter)) return false
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      return true
    })
  }, [seeds, search, domainFilter, statusFilter])

  // Stats
  const stats = useMemo(() => ({
    total: seeds.length,
    seedlings: seeds.filter((s) => (s.status || '').includes('Seedling')).length,
    growing: seeds.filter((s) => (s.status || '').includes('Growing')).length,
    rated: seeds.filter((s) => (s.rating ?? 0) > 0).length,
  }), [seeds])

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--background)' }}>
      <Header />

      <main className="pt-16 pb-8 px-4 md:max-w-5xl md:mx-auto w-full flex-1">
        {/* ── Garden Header ──────────────────────────────── */}
        <div className="py-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="material-symbols-outlined text-2xl" style={{ color: 'var(--primary)' }}>
              eco
            </span>
            <h2 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
              Idea Garden
            </h2>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Your living knowledge base — enriched ideas, connected by meaning.
          </p>
        </div>

        {/* ── Stats Row ──────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Seeds', value: stats.total, icon: 'local_florist', color: 'var(--primary)' },
            { label: 'Seedlings', value: stats.seedlings, icon: 'seedling', color: 'var(--secondary)' },
            { label: 'Growing', value: stats.growing, icon: 'trending_up', color: 'var(--primary)' },
            { label: 'Rated', value: stats.rated, icon: 'star', color: 'var(--secondary)' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl p-3 border text-center"
              style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
            >
              <span className="material-symbols-outlined text-lg" style={{ color: stat.color }}>
                {stat.icon}
              </span>
              <div className="text-lg font-bold mt-1" style={{ color: 'var(--foreground)' }}>
                {stat.value}
              </div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Filters ────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative">
            <span
              className="material-symbols-outlined text-sm absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--muted-foreground)' }}
            >
              search
            </span>
            <input
              type="text"
              placeholder="Search seeds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none"
              style={{
                background: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            />
          </div>

          {/* Domain filter */}
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border outline-none"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
            }}
          >
            {domains.map((d) => (
              <option key={d} value={d}>
                {d === 'all' ? 'All Domains' : d}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 rounded-lg text-sm border outline-none"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
            }}
          >
            <option value="all">All Status</option>
            <option value="Seedling 🌱">Seedling 🌱</option>
            <option value="Growing 🌿">Growing 🌿</option>
          </select>

          {/* View toggle */}
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {(['grid', 'list'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="px-3 py-2 text-sm transition-colors"
                style={{
                  background: viewMode === mode ? 'var(--accent)' : 'var(--card)',
                  color: viewMode === mode ? 'var(--primary)' : 'var(--muted-foreground)',
                }}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {mode === 'grid' ? 'grid_view' : 'view_list'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span
              className="material-symbols-outlined text-3xl animate-spin"
              style={{ color: 'var(--primary)' }}
            >
              progress_activity
            </span>
          </div>
        ) : error ? (
          <div
            className="rounded-xl p-6 text-center text-sm"
            style={{
              background: 'color-mix(in srgb, var(--destructive) 10%, transparent)',
              color: 'var(--destructive)',
            }}
          >
            <span className="material-symbols-outlined text-2xl mb-2 block">cloud_off</span>
            {error}
            <p className="mt-1 text-xs opacity-70">
              The backend may be unreachable. Check the Cloudflare tunnel.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span
              className="material-symbols-outlined text-5xl mb-4"
              style={{ color: 'var(--muted-foreground)' }}
            >
              search_off
            </span>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {seeds.length === 0
                ? 'No seeds yet. Capture ideas in the chat to grow your garden.'
                : 'No seeds match your filters.'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((seed) => (
              <SeedCard
                key={seed.id}
                seed={seed}
                onRate={handleRate}
                viewMode="grid"
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((seed) => (
              <SeedCard
                key={seed.id}
                seed={seed}
                onRate={handleRate}
                viewMode="list"
              />
            ))}
          </div>
        )}

        {/* Results count */}
        {!loading && !error && filtered.length > 0 && (
          <p className="text-center text-xs mt-6" style={{ color: 'var(--muted-foreground)' }}>
            Showing {filtered.length} of {seeds.length} seeds
          </p>
        )}
      </main>
    </div>
  )
}
