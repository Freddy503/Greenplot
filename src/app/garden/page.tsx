'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

// Layout
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import { SeedDetailSheet } from '@/components/seeds/seed-detail-sheet'
import { FullScreenGraph } from '@/components/seeds/full-screen-graph'

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
  _additional?: { id: string }
}

// ── Helpers ───────────────────────────────────────────

function parseSeed(raw: any): Seed {
  const text = raw.content || raw.text || ''
  // seed_metadata (Postgres) or metadata (Weaviate) both contain enrichment fields
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
    title,
    text,
    created: raw.created_at || raw.created || '',
    source: raw.source || metadata.source || '',
    domain,
    status,
    ...(summary ? { summary } : {}),
    ...(tags ? { tags } : {}),
    ...(energy ? { energy } : {}),
  }
}

function getStatusStyle(status: string) {
  if (status.toLowerCase().includes('enrich') || status.toLowerCase().includes('growing'))
    return { color: 'text-secondary', label: 'Enriched' }
  if (status.toLowerCase().includes('sprout') || status.toLowerCase().includes('seedling'))
    return { color: 'text-primary', label: 'Sprouting' }
  return { color: 'text-on-surface-variant', label: 'Dormant' }
}

function getSeedIcon(domain: string) {
  const d = domain.toLowerCase()
  if (d.includes('ai') || d.includes('tech')) return 'psychiatry'
  if (d.includes('eco') || d.includes('sustain')) return 'energy_savings_leaf'
  if (d.includes('design')) return 'eco'
  if (d.includes('business') || d.includes('logistics')) return 'potted_plant'
  return 'eco'
}

// ── Seed Row ──────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 1 ? 'Just now' : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function SeedRow({ seed, allSeeds, onClick }: { seed: Seed; allSeeds: Seed[]; onClick: () => void }) {
  const icon = getSeedIcon(seed.domain || '')
  const isFilled = icon === 'psychiatry' || icon === 'eco'
  const statusStyle = getStatusStyle(seed.status || '')
  const tags = seed.domain ? seed.domain.split(',').map((t: string) => t.trim()).filter(Boolean) : []
  const dateLabel = formatDate(seed.created)

  // Count connections: other seeds sharing at least one domain tag
  const connections = tags.length > 0
    ? allSeeds.filter(s => s.id !== seed.id && s.domain && tags.some(t => s.domain!.toLowerCase().includes(t.toLowerCase()))).length
    : 0

  return (
    <TableRow className="border-b border-outline-variant/5 hover:bg-surface-container transition-colors cursor-pointer group" onClick={onClick}>
      <TableCell className="w-12">
        <span
          className="material-symbols-outlined text-xl text-primary"
          style={{ fontVariationSettings: isFilled ? '"FILL" 1' : '"FILL" 0' }}
        >
          {icon}
        </span>
      </TableCell>
      <TableCell>
        <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors mb-1">
          {seed.title}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {dateLabel && (
            <span className="text-[9px] text-on-surface-variant/50">{dateLabel}</span>
          )}
          {tags.map((tag: string, i: number) => (
            <Badge key={i} variant="outline" className="text-[9px] px-2 py-0.5 bg-surface-container-high border-outline-variant/20">
              {tag}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-right w-20">
        <div className="flex flex-col items-end gap-0.5">
          <span className={`text-[10px] font-bold uppercase tracking-tighter ${statusStyle.color}`}>
            {statusStyle.label}
          </span>
          {connections > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] text-secondary/60">
              <span className="material-symbols-outlined" style={{ fontSize: '10px', fontVariationSettings: '"FILL" 1' }}>link</span>
              {connections}
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

// ── Page ──────────────────────────────────────────────

export default function GardenPage() {
  const router = useRouter()
  const [seeds, setSeeds] = useState<Seed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nickname, setNickname] = useState('')
  const [selectedSeed, setSelectedSeed] = useState<Seed | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    setNickname(localStorage.getItem('greenplot_nickname') || '')
    const token = localStorage.getItem('greenplot_token')
    fetch('/api/seeds?limit=200', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (r.status === 401) {
          // Token expired — redirect to login
          localStorage.removeItem('greenplot_token')
          window.location.href = '/login'
          return { seeds: [] }
        }
        return r.json()
      })
      .then((data) => {
        const raw = data.seeds || data || []
        const parsed = Array.isArray(raw) ? raw.map(parseSeed) : []
        parsed.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
        setSeeds(parsed)
      })
      .catch(() => setError('Could not load seeds'))
      .finally(() => setLoading(false))
  }, [])

  const handleSeedDeleted = (id: string) => {
    setSeeds(prev => prev.filter(s => s.id !== id))
  }

  const handleBulkDelete = async () => {
    if (!selected.size || bulkDeleting) return
    setBulkDeleting(true)
    const token = localStorage.getItem('greenplot_token')
    try {
      const res = await fetch('/api/seeds/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ seed_ids: [...selected] }),
      })
      if (res.ok) {
        setSeeds(prev => prev.filter(s => !selected.has(s.id)))
        setSelected(new Set())
        setSelectMode(false)
      }
    } catch {}
    setBulkDeleting(false)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const focusSeed = seeds[0]

  return (
    <div className="h-dvh flex flex-col bg-background">
      <Header />

      <main className="flex-1 overflow-y-auto px-4 max-w-4xl mx-auto w-full animate-fade-rise" style={{ paddingTop: 'calc(var(--header-height) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8rem)' }}>
        {/* Hero */}
        <section className="mb-3 px-2">
          <div className="flex items-center justify-between mb-2">
            <h1 className="display-lg text-on-surface">
              Knowledge <span className="text-primary">Garden</span>
            </h1>
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-full">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-full transition-all ${viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/50'}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: viewMode === 'list' ? '"FILL" 1' : '"FILL" 0' }}>view_list</span>
              </button>
              <button
                onClick={() => setViewMode('graph')}
                className={`p-2 rounded-full transition-all ${viewMode === 'graph' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/50'}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: viewMode === 'graph' ? '"FILL" 1' : '"FILL" 0' }}>hub</span>
              </button>
            </div>
          </div>
          <p className="text-sm leading-relaxed max-w-xs text-on-surface-variant">
            {viewMode === 'list'
              ? 'Cultivating intelligence through structured organic seeds of thought.'
              : 'Visualize the connections between your ideas.'}
          </p>
        </section>

        {/* View Graph Button */}
        {!loading && !error && seeds.length > 0 && (
          <button
            onClick={() => setGraphOpen(true)}
            className="w-full mb-6 flex items-center justify-center gap-3 py-4 rounded-2xl bg-surface-container border border-outline-variant/10 hover:bg-surface-container-high hover:border-primary/20 transition-all active:scale-[0.98] group"
          >
            <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform" style={{ fontSize: '22px', fontVariationSettings: '"FILL" 1' }}>hub</span>
            <div className="text-left">
              <p className="text-sm font-bold text-on-surface">View Knowledge Graph</p>
              <p className="text-[10px] text-on-surface-variant">{seeds.length} seeds connected</p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant/40 ml-auto">open_in_new</span>
          </button>
        )}

        {/* Seed Table — list view only */}
        {viewMode === 'list' && (loading ? (
          <div className="space-y-1.5">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 px-2">
                <Skeleton className="w-6 h-6 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 rounded-full" />
                  <Skeleton className="h-3 w-1/2 rounded-full" />
                </div>
                <Skeleton className="h-3 w-14 rounded-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <span className="material-symbols-outlined">cloud_off</span>
              </EmptyMedia>
              <EmptyTitle>Connection Error</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : seeds.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="default">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant">search_off</span>
              </EmptyMedia>
              <EmptyTitle>No seeds yet</EmptyTitle>
              <EmptyDescription>
                Capture ideas in the chat to grow your garden.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" className="rounded-full" onClick={() => router.push('/chat')}>
                Start Chatting
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
          {/* Bulk action bar */}
          {selectMode && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-xs text-on-surface-variant flex-1">{selected.size} selected</span>
              <button
                onClick={() => { setSelectMode(false); setSelected(new Set()) }}
                className="text-xs text-on-surface-variant/60 hover:text-on-surface px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={!selected.size || bulkDeleting}
                className="text-xs font-bold text-error border border-error/30 rounded-full px-3 py-1 hover:bg-error/10 disabled:opacity-40"
              >
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
              </button>
            </div>
          )}
          <Card className="bg-surface-container-low border-outline-variant/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-outline-variant/10">
                  <TableHead className="w-12 text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bold">
                    <button onClick={() => { setSelectMode(m => !m); setSelected(new Set()) }} title="Toggle select mode">
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: selectMode ? '"FILL" 1' : '"FILL" 0' }}>
                        {selectMode ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                    </button>
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bold">
                    <button onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} className="flex items-center gap-1 hover:text-primary transition-colors">
                      Seed · Date Added
                      <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{sortDir === 'desc' ? 'arrow_downward' : 'arrow_upward'}</span>
                    </button>
                  </TableHead>
                  <TableHead className="text-right w-20 text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...seeds].sort((a, b) => {
                  const ta = new Date(a.created).getTime()
                  const tb = new Date(b.created).getTime()
                  return sortDir === 'desc' ? tb - ta : ta - tb
                }).map((seed) => (
                  selectMode ? (
                    <TableRow
                      key={seed.id}
                      className={`border-b border-outline-variant/5 cursor-pointer transition-colors ${selected.has(seed.id) ? 'bg-error/5' : 'hover:bg-surface-container'}`}
                      onClick={() => toggleSelect(seed.id)}
                    >
                      <TableCell className="w-12">
                        <span className="material-symbols-outlined text-xl" style={{ color: selected.has(seed.id) ? 'var(--error)' : 'var(--on-surface-variant)', fontVariationSettings: selected.has(seed.id) ? '"FILL" 1' : '"FILL" 0' }}>
                          {selected.has(seed.id) ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                      </TableCell>
                      <TableCell colSpan={2}>
                        <p className="text-sm font-bold text-on-surface">{seed.title}</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <SeedRow key={seed.id} seed={seed} allSeeds={seeds} onClick={() => { setSelectedSeed(seed); setDetailOpen(true) }} />
                  )
                ))}
              </TableBody>
            </Table>
          </Card>
          </>
        ))}

        {/* Focus Seed Card — always visible */}
        {focusSeed && (
          <Card className="mt-10 relative overflow-hidden bg-surface-container border-primary/10">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl" />
            <CardContent className="relative z-10 p-6">
              <Badge className="bg-secondary/20 text-secondary text-[10px] font-bold uppercase tracking-widest mb-4 border-0">
                Focus Seed
              </Badge>
              <h4 className="heading text-on-surface mb-2">{focusSeed.title}</h4>
              <p className="text-xs leading-relaxed text-on-surface-variant mb-4">
                Your garden is currently enriching this seed. Estimated bloom soon.
              </p>
              <Progress value={65} className="h-1.5 mt-4 bg-surface-container-low [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-primary-container [&>div]:shadow-green-500/30 [&>div]:shadow-sm" />
            </CardContent>
          </Card>
        )}

        {/* Seed Connections */}
        {seeds.length > 1 && (() => {
          // Group seeds by domain
          const domainMap = new Map<string, Seed[]>()
          seeds.forEach(s => {
            const domains = s.domain ? s.domain.split(',').map(d => d.trim()).filter(Boolean) : ['Uncategorized']
            domains.forEach(d => {
              if (!domainMap.has(d)) domainMap.set(d, [])
              domainMap.get(d)!.push(s)
            })
          })
          const clusters = [...domainMap.entries()]
            .filter(([, s]) => s.length > 1)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 5)

          if (clusters.length === 0) return null

          return (
            <Card className="mt-10 relative overflow-hidden bg-surface-container border-secondary/10">
              <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-secondary/5 rounded-full blur-3xl" />
              <CardContent className="relative z-10 p-6">
                <div className="flex items-center gap-1.5 mb-5">
                  <span
                    className="material-symbols-outlined text-secondary"
                    style={{ fontSize: '18px', fontVariationSettings: '"FILL" 1' }}
                  >
                    hub
                  </span>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-secondary">
                    Seed Connections
                  </h3>
                </div>
                <p className="text-xs text-on-surface-variant mb-4">
                  Seeds that share domains and themes. Your second brain is forming patterns.
                </p>
                <div className="space-y-4">
                  {clusters.map(([domain, clusterSeeds]) => (
                    <div key={domain} className="group">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Badge className="bg-primary/10 text-primary text-[10px] font-bold border-0">
                          {domain}
                        </Badge>
                        <span className="text-[10px] text-on-surface-variant/50">
                          {clusterSeeds.length} seeds
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 ml-1">
                        {clusterSeeds.slice(0, 4).map(s => (
                          <span
                            key={s.id}
                            className="text-[11px] text-on-surface-variant bg-surface-container-low rounded-full px-2.5 py-1 border border-outline-variant/10 hover:border-primary/20 transition-colors cursor-default"
                          >
                            {s.title.length > 30 ? s.title.slice(0, 30) + '…' : s.title}
                          </span>
                        ))}
                        {clusterSeeds.length > 4 && (
                          <span className="text-[10px] text-on-surface-variant/40 self-center">
                            +{clusterSeeds.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })()}
      </main>

      {/* FAB — moved up to not overlap bottom nav */}
      <Button
        size="icon"
        className="fixed bottom-24 right-4 w-14 h-14 bg-secondary text-on-secondary rounded-full shadow-lg shadow-secondary/30 z-40 md:bottom-8"
        onClick={() => router.push('/chat')}
      >
        <span className="material-symbols-outlined text-2xl font-bold">add</span>
      </Button>

      <SeedDetailSheet
        seed={selectedSeed}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDeleted={handleSeedDeleted}
      />

      <FullScreenGraph
        seeds={seeds}
        open={graphOpen}
        onClose={() => setGraphOpen(false)}
        onNodeClick={(seed) => {
          setGraphOpen(false)
          setSelectedSeed(seed as Seed)
          setDetailOpen(true)
        }}
      />

      <BottomNav />
    </div>
  )
}
