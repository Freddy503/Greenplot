'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'

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

function getStatusStyle(status: string): { colorClass: string; label: string } {
  const s = status.toLowerCase()
  if (s.includes('enrich') || s.includes('growing'))
    return { colorClass: 'text-secondary', label: 'Enriched' }
  if (s.includes('sprout') || s.includes('seedling'))
    return { colorClass: 'text-primary', label: 'Sprouting' }
  return { colorClass: 'text-on-surface-variant', label: 'Dormant' }
}

function getSeedIcon(domain: string) {
  const d = domain.toLowerCase()
  if (d.includes('ai') || d.includes('tech')) return { icon: 'psychiatry', filled: true }
  if (d.includes('eco') || d.includes('sustain')) return { icon: 'energy_savings_leaf', filled: false }
  if (d.includes('design')) return { icon: 'eco', filled: true }
  if (d.includes('business') || d.includes('logistics')) return { icon: 'potted_plant', filled: false }
  return { icon: 'eco', filled: true }
}

// ── Seed Row Component ────────────────────────────────

function SeedRow({ seed, onClick }: { seed: Seed; onClick: () => void }) {
  const { icon, filled } = getSeedIcon(seed.domain || '')
  const { colorClass, label } = getStatusStyle(seed.status || '')
  const tags = seed.domain
    ? seed.domain.split(',').map((t: string) => t.trim()).filter(Boolean)
    : []

  return (
    <TableRow
      className="cursor-pointer border-b border-outline-variant/5 hover:bg-surface-container transition-colors"
      onClick={onClick}
    >
      {/* Icon */}
      <TableCell className="w-12 px-4 py-5">
        <span
          className="material-symbols-outlined text-xl text-primary"
          style={{ fontVariationSettings: filled ? '"FILL" 1' : '"FILL" 0' }}
        >
          {icon}
        </span>
      </TableCell>

      {/* Title + tags */}
      <TableCell className="pr-4 py-5">
        <p className="text-sm font-bold text-on-surface mb-1 truncate">{seed.title}</p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag: string, i: number) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[9px] px-2 py-0.5 rounded-full border-outline-variant/20 bg-surface-container-high text-on-surface-variant"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </TableCell>

      {/* Status */}
      <TableCell className="text-right px-4 py-5 w-20">
        <span className={`text-[10px] font-bold uppercase tracking-tighter ${colorClass}`}>
          {label}
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
  const initial = nickname.charAt(0).toUpperCase() || 'G'

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* ── Header ───────────────────────────────────── */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-background/80 backdrop-blur-2xl border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <Avatar className="bg-primary ring-0 after:hidden">
            <AvatarFallback className="bg-primary text-on-primary font-bold text-xs">
              {initial}
            </AvatarFallback>
          </Avatar>
          <span className="text-xl font-bold tracking-tighter text-primary">Greenplot</span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-on-surface-variant rounded-full hover:bg-surface-container">
            <span className="material-symbols-outlined text-[20px]">search</span>
          </Button>
          <Button
            variant="ghost"
            className="text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-full hover:bg-surface-container"
            onClick={() => router.push('/chat')}
          >
            Chat
          </Button>
        </div>
      </header>

      <main className="pt-20 pb-32 px-4 max-w-2xl mx-auto w-full">

        {/* ── Chat/Garden Toggle (Tabs) ─────────────── */}
        <div className="flex justify-center mb-8">
          <Tabs defaultValue="garden" className="w-full max-w-[280px]">
            <TabsList className="w-full rounded-full bg-surface-container-low p-1.5 h-auto gap-0">
              <TabsTrigger
                value="chat"
                className="flex-1 rounded-full text-sm font-bold py-2 text-on-surface-variant data-active:bg-transparent data-active:text-on-surface-variant data-active:shadow-none hover:text-on-surface transition-colors"
                onClick={() => router.push('/chat')}
              >
                Chat
              </TabsTrigger>
              <TabsTrigger
                value="garden"
                className="flex-1 rounded-full text-sm font-bold py-2 text-on-primary data-active:bg-gradient-to-br data-active:from-primary data-active:to-primary-container data-active:shadow-lg data-active:text-on-primary"
              >
                Garden
              </TabsTrigger>
            </TabsList>
            <TabsContent value="garden" />
            <TabsContent value="chat" />
          </Tabs>
        </div>

        {/* ── Hero ───────────────────────────────────── */}
        <section className="mb-8 px-2">
          <h1 className="text-3xl font-extrabold tracking-tight mb-2 leading-tight text-on-surface">
            Knowledge <span className="text-primary">Garden</span>
          </h1>
          <p className="text-sm leading-relaxed max-w-xs text-on-surface-variant">
            Cultivating intelligence through structured organic seeds of thought.
          </p>
        </section>

        {/* ── Seed Table ─────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="material-symbols-outlined text-3xl animate-spin text-primary">
              progress_activity
            </span>
          </div>
        ) : error ? (
          <div className="rounded-lg p-6 text-center text-sm bg-error/10 text-error">
            <span className="material-symbols-outlined text-2xl mb-2 block">cloud_off</span>
            {error}
          </div>
        ) : seeds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="material-symbols-outlined text-5xl mb-4 text-on-surface-variant">
              search_off
            </span>
            <p className="text-sm text-on-surface-variant">
              No seeds yet. Capture ideas in the chat to grow your garden.
            </p>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden bg-surface-container-low border border-outline-variant/10">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-outline-variant/10 hover:bg-transparent">
                  <TableHead className="w-12 px-4 py-3 text-[10px] uppercase tracking-[0.1em] font-bold text-on-surface-variant">
                    Type
                  </TableHead>
                  <TableHead className="py-3 text-[10px] uppercase tracking-[0.1em] font-bold text-on-surface-variant">
                    Seed Title
                  </TableHead>
                  <TableHead className="text-right px-4 py-3 w-20 text-[10px] uppercase tracking-[0.1em] font-bold text-on-surface-variant">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {seeds.map((seed) => (
                  <SeedRow key={seed.id} seed={seed} onClick={() => {}} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* ── Focus Seed Card ────────────────────────── */}
        {focusSeed && (
          <Card className="mt-10 bg-surface-container border-primary/10 ring-primary/10 overflow-hidden">
            {/* Decorative glow blob */}
            <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

            <CardHeader className="relative z-10 pb-0">
              <div>
                <Badge className="mb-3 rounded-full bg-secondary/20 text-secondary border-0 text-[10px] font-bold uppercase tracking-widest px-3 py-1 h-auto">
                  Focus Seed
                </Badge>
                <CardTitle className="text-xl font-bold text-on-surface">
                  {focusSeed.title}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed text-on-surface-variant mt-1">
                  Your garden is currently enriching this seed. Estimated bloom soon.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="relative z-10 pt-4">
              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full bg-surface-container-low overflow-hidden">
                <div className="h-full w-[65%] rounded-full bg-gradient-to-r from-primary to-primary-container shadow-[0_0_8px_rgba(105,246,184,0.4)]" />
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* ── FAB ──────────────────────────────────────── */}
      <Button
        size="icon"
        className="fixed bottom-28 right-6 w-14 h-14 rounded-full bg-secondary text-on-secondary shadow-lg shadow-secondary/30 active:scale-90 transition-transform z-40"
        onClick={() => router.push('/chat')}
      >
        <span className="material-symbols-outlined text-2xl font-bold">add</span>
      </Button>

      {/* ── Bottom Nav ───────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-2 bg-surface-container-low/80 backdrop-blur-xl rounded-t-[32px] shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.4)]">
        <Button variant="ghost" size="icon" className="text-on-surface-variant rounded-full hover:bg-surface-container">
          <span className="material-symbols-outlined">home</span>
        </Button>

        <Button
          size="icon"
          className="rounded-full bg-gradient-to-br from-primary to-primary-container text-on-primary shadow-md hover:opacity-90"
          onClick={() => router.push('/chat')}
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>
            chat_bubble
          </span>
        </Button>

        <Button variant="ghost" size="icon" className="text-on-surface-variant rounded-full hover:bg-surface-container">
          <span className="material-symbols-outlined">search</span>
        </Button>

        <Button variant="ghost" size="icon" className="text-on-surface-variant rounded-full hover:bg-surface-container">
          <span className="material-symbols-outlined">settings</span>
        </Button>
      </nav>
    </div>
  )
}
