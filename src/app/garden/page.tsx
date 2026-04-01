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

// ── Helpers ───────────────────────────────────────────

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

function SeedRow({ seed }: { seed: Seed }) {
  const icon = getSeedIcon(seed.domain || '')
  const isFilled = icon === 'psychiatry' || icon === 'eco'
  const statusStyle = getStatusStyle(seed.status || '')
  const tags = seed.domain ? seed.domain.split(',').map((t: string) => t.trim()).filter(Boolean) : []

  return (
    <TableRow className="border-b border-outline-variant/5 hover:bg-surface-container transition-colors cursor-pointer group">
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
        <span className={`text-[10px] font-bold uppercase tracking-tighter ${statusStyle.color}`}>
          {statusStyle.label}
        </span>
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

  const focusSeed = seeds[0]

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-surface-container-highest text-primary text-xs font-bold">
              {nickname.charAt(0).toUpperCase() || 'G'}
            </AvatarFallback>
          </Avatar>
          <span className="text-xl font-bold tracking-tighter text-primary">Greenplot</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-on-surface-variant rounded-full">
            <span className="material-symbols-outlined">search</span>
          </Button>
          <Button
            variant="ghost"
            className="text-on-surface-variant text-sm uppercase tracking-widest font-medium rounded-full"
            onClick={() => router.push('/chat')}
          >
            Chat
          </Button>
        </div>
      </header>

      <main className="pt-20 pb-32 px-4 max-w-2xl mx-auto w-full">
        {/* Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-surface-container-low p-1.5 rounded-full flex items-center w-full max-w-[280px]">
            <Button
              variant="ghost"
              className="flex-1 rounded-full text-sm font-bold text-on-surface-variant"
              onClick={() => router.push('/chat')}
            >
              Chat
            </Button>
            <Button
              className="flex-1 rounded-full text-sm font-bold bg-gradient-to-br from-primary to-primary-container text-primary-foreground shadow-lg"
            >
              Garden
            </Button>
          </div>
        </div>

        {/* Hero */}
        <section className="mb-8 px-2">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 leading-tight text-on-surface">
            Knowledge <span className="text-primary">Garden</span>
          </h1>
          <p className="text-sm leading-relaxed max-w-xs text-on-surface-variant">
            Cultivating intelligence through structured organic seeds of thought.
          </p>
        </section>

        {/* Seed Table */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
          </div>
        ) : error ? (
          <div className="rounded-lg p-6 text-center text-sm bg-error/10 text-error">
            <span className="material-symbols-outlined text-2xl mb-2 block">cloud_off</span>
            {error}
          </div>
        ) : seeds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="material-symbols-outlined text-5xl mb-4 text-on-surface-variant">search_off</span>
            <p className="text-sm text-on-surface-variant">
              No seeds yet. Capture ideas in the chat to grow your garden.
            </p>
          </div>
        ) : (
          <Card className="bg-surface-container-low border-outline-variant/10 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-outline-variant/10">
                  <TableHead className="w-12 text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bold">Type</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bold">Seed Title</TableHead>
                  <TableHead className="text-right w-20 text-[10px] uppercase tracking-[0.1em] text-on-surface-variant font-bold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seeds.map((seed) => (
                  <SeedRow key={seed.id} seed={seed} />
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Focus Seed Card */}
        {focusSeed && (
          <Card className="mt-10 relative overflow-hidden bg-surface-container border-primary/10">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl" />
            <CardContent className="relative z-10 p-6">
              <Badge className="bg-secondary/20 text-secondary text-[10px] font-bold uppercase tracking-widest mb-4 border-0">
                Focus Seed
              </Badge>
              <h4 className="text-xl font-bold text-on-surface mb-2">{focusSeed.title}</h4>
              <p className="text-xs leading-relaxed text-on-surface-variant mb-4">
                Your garden is currently enriching this seed. Estimated bloom soon.
              </p>
              <div className="w-full bg-surface-container-low h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full w-[65%] rounded-full bg-gradient-to-r from-primary to-primary-container shadow-[0_0_8px_rgba(105,246,184,0.4)]"
                />
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* FAB */}
      <Button
        size="icon"
        className="fixed bottom-28 right-6 w-14 h-14 bg-secondary text-on-secondary rounded-full shadow-lg shadow-secondary/30 z-40"
        onClick={() => router.push('/chat')}
      >
        <span className="material-symbols-outlined text-2xl font-bold">add</span>
      </Button>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-2 bg-surface-container-low/80 backdrop-blur-xl rounded-t-[32px] shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.4)]">
        <Button variant="ghost" size="icon" className="text-on-surface-variant rounded-full p-3">
          <span className="material-symbols-outlined">home</span>
        </Button>
        <Button
          size="icon"
          className="rounded-full p-3 bg-gradient-to-br from-primary to-primary-container text-primary-foreground"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>chat_bubble</span>
        </Button>
        <Button variant="ghost" size="icon" className="text-on-surface-variant rounded-full p-3">
          <span className="material-symbols-outlined">search</span>
        </Button>
        <Button variant="ghost" size="icon" className="text-on-surface-variant rounded-full p-3">
          <span className="material-symbols-outlined">settings</span>
        </Button>
      </nav>
    </div>
  )
}
