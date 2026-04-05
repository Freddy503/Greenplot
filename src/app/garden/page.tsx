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
  const metadata = raw.metadata || {}
  const domain = raw.domain || metadata.domain || text.match(/Domain:\s*(.+)/)?.[1]?.trim() || ''
  const status = raw.status || metadata.status || text.match(/Status:\s*(.+)/)?.[1]?.trim() || ''
  const title = raw.title || text.split('\n')[0]?.slice(0, 60) || 'Untitled'
  return {
    id: raw.id || raw._additional?.id || raw.notion_id || '',
    title,
    text,
    created: raw.created_at || raw.created || '',
    source: raw.source || metadata.source || '',
    domain,
    status,
    // Carry enrichment data for the detail sheet
    ...(metadata.summary ? { summary: metadata.summary } : {}),
    ...(metadata.tags ? { tags: metadata.tags } : {}),
    ...(metadata.energy ? { energy: metadata.energy } : {}),
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

function SeedRow({ seed, allSeeds, onClick }: { seed: Seed; allSeeds: Seed[]; onClick: () => void }) {
  const icon = getSeedIcon(seed.domain || '')
  const isFilled = icon === 'psychiatry' || icon === 'eco'
  const statusStyle = getStatusStyle(seed.status || '')
  const tags = seed.domain ? seed.domain.split(',').map((t: string) => t.trim()).filter(Boolean) : []

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
        <p className="text-sm font-bnew text-on-surface group-hover:text-primary transition-colors mb-1">
          {seed.title}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag: string, i: number) => (
              <Badge key={i} variant="outline" className="text-[9px] px-2 py-0.5 bg-surface-container-high border-outline-variant/20">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right w-20">
        <div className="flex flex-col items-end gap-0.5">
          <span className={`text-[10px] font-bnew uppercase tracking-tighter ${statusStyle.color}`}>
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

  useEffect(() => {
    setNickname(localStorage.getItem('greenplot_nickname') || '')
    const token = localStorage.getItem('greenplot_token')
    fetch('/api/seeds?limit=50', {
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
        setSeeds(Array.isArray(raw) ? raw.map(parseSeed) : [])
      })
      .catch(() => setError('Could not load seeds'))
      .finally(() => setLoading(false))
  }, [])

  const focusSeed = seeds[0]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="pt-20 pb-32 md:pb-8 px-4 max-w-4xl mx-auto w-full">
        {/* Hero */}
        <section className="mb-6 px-2">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-extrabnew tracking-tight leading-tight text-on-surface">
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
              <p className="text-sm font-bnew text-on-surface">View Knowledge Graph</p>
              <p className="text-[10px] text-on-surface-variant">{seeds.length} seeds connected</p>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant/40 ml-auto">open_in_new</span>
          </button>
        )}

        {/* Seed Table — list view only */}
        {viewMode === 'list' && (loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 px-2">
                <Skeleton className="w-8 h-8 rounded-full" />
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
          <Card className="bg-surface-container-low border-outline-variant/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-outline-variant/10">
                  <TableHead className="w-12 text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bnew">Type</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bnew">Seed Title</TableHead>
                  <TableHead className="text-right w-20 text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bnew">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seeds.map((seed) => (
                  <SeedRow key={seed.id} seed={seed} allSeeds={seeds} onClick={() => { setSelectedSeed(seed); setDetailOpen(true) }} />
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}

        {/* Focus Seed Card — always visible */}
        {focusSeed && (
          <Card className="mt-10 relative overflow-hidden bg-surface-container border-primary/10">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl" />
            <CardContent className="relative z-10 p-6">
              <Badge className="bg-secondary/20 text-secondary text-[10px] font-bnew uppercase tracking-widest mb-4 border-0">
                Focus Seed
              </Badge>
              <h4 className="text-xl font-bnew text-on-surface mb-2">{focusSeed.title}</h4>
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
                <div className="flex items-center gap-2 mb-5">
                  <span
                    className="material-symbols-outlined text-secondary"
                    style={{ fontSize: '18px', fontVariationSettings: '"FILL" 1' }}
                  >
                    hub
                  </span>
                  <h3 className="text-sm font-bnew uppercase tracking-wider text-secondary">
                    Seed Connections
                  </h3>
                </div>
                <p className="text-xs text-on-surface-variant mb-4">
                  Seeds that share domains and themes. Your second brain is forming patterns.
                </p>
                <div className="space-y-4">
                  {clusters.map(([domain, clusterSeeds]) => (
                    <div key={domain} className="group">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-primary/10 text-primary text-[10px] font-bnew border-0">
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
        <span className="material-symbols-outlined text-2xl font-bnew">add</span>
      </Button>

      <SeedDetailSheet
        seed={selectedSeed}
        open={detailOpen}
        onOpenChange={setDetailOpen}
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
