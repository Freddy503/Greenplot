'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'

import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { THINKING_MODES } from '@/lib/thinking-modes'

// ── Types ─────────────────────────────────────────────

interface PRDItem {
  id: string
  title: string
  content: string
  createdAt: string
  source?: string
  local?: boolean
}

interface RawSeed {
  id?: string
  notion_id?: string
  title?: string
  content?: string
  text?: string
  summary?: string
  seed_type?: string
  type?: string
  tags?: string | string[]
  seed_metadata?: { tags?: string[] }
  metadata?: { tags?: string[] }
  created_at?: string
  created?: string
}

// ── Helpers ───────────────────────────────────────────

const SPEC_TAGS = ['spec', 'prd', 'strategy-paper', 'agent-output']

function normalizeTags(s: RawSeed): string[] {
  const raw = s.tags ?? s.seed_metadata?.tags ?? s.metadata?.tags ?? []
  const arr = Array.isArray(raw) ? raw : String(raw).split(',')
  return arr.map(t => t.trim().toLowerCase()).filter(Boolean)
}

function isSpecSeed(s: RawSeed): boolean {
  const type = (s.seed_type || s.type || '').toLowerCase()
  if (type === 'spec') return true
  return normalizeTags(s).some(t => SPEC_TAGS.includes(t))
}

function seedToPRD(s: RawSeed): PRDItem {
  const content = s.content || s.text || s.summary || ''
  return {
    id: s.id || s.notion_id || `seed_${Math.random().toString(36).slice(2)}`,
    title: s.title || content.split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 80) || 'Untitled spec',
    content,
    createdAt: s.created_at || s.created || new Date().toISOString(),
    source: 'garden',
  }
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(mins, 0)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function loadLocalPRDs(): PRDItem[] {
  try {
    const raw = localStorage.getItem('greenplot_prds')
    if (!raw) return []
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.map((p: PRDItem) => ({ ...p, local: true })) : []
  } catch {
    return []
  }
}

// ── PRD detail view ───────────────────────────────────

function PRDDetail({ prd, onBack, onDeleted }: { prd: PRDItem; onBack: () => void; onDeleted: (id: string) => void }) {
  const copyForAgent = () => {
    const framed = `# ${prd.title}\n\n${prd.content}\n\n---\nUse this PRD as the spec for the task I'm about to describe. Implement it faithfully, asking before making scope decisions not covered above.`
    navigator.clipboard.writeText(framed)
    toast.success('Copied — paste into Claude Code')
  }

  const downloadMd = () => {
    const md = `# ${prd.title}\n\n${prd.content}\n`
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prd.title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 60)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteLocal = () => {
    try {
      const raw = localStorage.getItem('greenplot_prds')
      const list = raw ? JSON.parse(raw) : []
      localStorage.setItem('greenplot_prds', JSON.stringify((list as PRDItem[]).filter(p => p.id !== prd.id)))
    } catch {}
    toast.success('PRD deleted')
    onDeleted(prd.id)
  }

  return (
    <div className="animate-in slide-in-from-right duration-200 px-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8rem)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          <span className="font-bold">PRDs</span>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={copyForAgent} className="flex items-center gap-1 text-[11px] font-bold text-primary px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors" title="Copy for Claude Code">
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>smart_toy</span>
            Copy for Claude Code
          </button>
          <button onClick={downloadMd} className="p-2 rounded-full text-on-surface-variant/60 hover:text-primary hover:bg-surface-container transition-colors" title="Download .md">
            <span className="material-symbols-outlined text-lg">download</span>
          </button>
          {prd.local && (
            <button onClick={deleteLocal} className="p-2 rounded-full text-on-surface-variant/60 hover:text-error hover:bg-error/10 transition-colors" title="Delete">
              <span className="material-symbols-outlined text-lg">delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <h1 className="display-md text-on-surface mb-1">{prd.title}</h1>
      <p className="text-[11px] text-on-surface-variant/50 mb-5">
        {prd.local ? 'Saved from Spec mode' : 'From your garden'} · {timeAgo(prd.createdAt)}
      </p>

      {/* Content */}
      <Card className="glass-card border-0">
        <CardContent className="p-5">
          <div className="prose prose-sm max-w-none
            prose-headings:font-display prose-headings:italic prose-headings:font-normal prose-headings:text-on-surface
            prose-p:text-on-surface-variant prose-li:text-on-surface-variant
            prose-strong:text-on-surface
            prose-table:my-4 prose-table:border-collapse
            prose-th:py-2 prose-th:px-3 prose-th:text-left prose-th:font-bold
            prose-td:py-2 prose-td:px-3 prose-td:border prose-td:border-border/20
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-code:bg-surface-container prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-surface-container-high prose-pre:text-on-surface
            prose-blockquote:border-l-primary prose-blockquote:text-on-surface-variant">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{prd.content}</ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────

export default function StudioPage() {
  const router = useRouter()
  const [prds, setPrds] = useState<PRDItem[]>([])
  const [ideas, setIdeas] = useState<RawSeed[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PRDItem | null>(null)

  const launchMode = useCallback((id: string) => {
    router.push(`/chat?mode=${id}`)
  }, [router])

  const developSeed = useCallback((seed: RawSeed) => {
    try {
      localStorage.setItem('greenplot_spec_prefill', JSON.stringify({
        id: seed.id,
        title: seed.title,
        content: seed.content || seed.text || seed.summary || '',
      }))
    } catch {}
    router.push('/chat?mode=spec')
  }, [router])

  useEffect(() => {
    const local = loadLocalPRDs()
    setPrds(local)

    const token = localStorage.getItem('greenplot_token')
    fetch('/api/seeds?limit=200', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => {
        if (r.status === 401) {
          localStorage.removeItem('greenplot_token')
          window.location.href = '/login'
          return { seeds: [] }
        }
        return r.json()
      })
      .then((data: { seeds?: RawSeed[] }) => {
        const seeds = data.seeds || []
        const specSeeds = seeds.filter(isSpecSeed).map(seedToPRD)
        // Merge: local first, then backend specs not already present (dedup by id)
        const seen = new Set(local.map(p => p.id))
        const merged = [...local, ...specSeeds.filter(p => !seen.has(p.id))]
        setPrds(merged)
        // "Ideas ready to develop": recent non-spec seeds with real content
        setIdeas(seeds.filter(s => !isSpecSeed(s) && (s.content || s.text || s.summary)).slice(0, 4))
      })
      .catch(() => {/* keep local PRDs */})
      .finally(() => setLoading(false))
  }, [])

  const handleDeleted = (id: string) => {
    setPrds(prev => prev.filter(p => p.id !== id))
    setSelected(null)
  }

  // Detail view
  if (selected) {
    return (
      <div className="h-dvh flex flex-col bg-background">
        <Header />
        <main className="flex-1 overflow-y-auto" style={{ paddingTop: 'var(--header-height)' }}>
          <PRDDetail prd={selected} onBack={() => setSelected(null)} onDeleted={handleDeleted} />
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="h-dvh flex flex-col bg-background">
      <Header />

      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 'var(--header-height)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)' }}
      >
        <div className="max-w-2xl mx-auto px-4 pt-2 space-y-8">
          {/* Hero */}
          <section>
            <h1 className="display-lg text-on-surface">
              The <span className="text-primary">Studio</span>
            </h1>
            <p className="text-sm leading-relaxed text-on-surface-variant mt-2 max-w-md">
              Your thinking partner. Brainstorm, pressure-test, and spec ideas into PRDs you can
              hand straight to Claude Code.
            </p>
          </section>

          {/* Thinking Partner modes */}
          <section>
            <h2 className="heading text-on-surface mb-3">Thinking partner</h2>
            <div className="grid grid-cols-2 gap-3">
              {THINKING_MODES.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => launchMode(mode.id)}
                  className="flex flex-col gap-2 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/25 hover:bg-surface-container transition-all text-left group"
                >
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode.accentBg}`}>
                    <span className={`material-symbols-outlined ${mode.accentText}`} style={{ fontSize: '22px', fontVariationSettings: '"FILL" 1' }}>
                      {mode.icon}
                    </span>
                  </span>
                  <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{mode.label}</p>
                  <p className="text-[11px] leading-relaxed text-on-surface-variant/70">{mode.blurb}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Ideas ready to develop */}
          {ideas.length > 0 && (
            <section>
              <h2 className="heading text-on-surface mb-3">Ideas ready to develop</h2>
              <div className="space-y-2">
                {ideas.map(seed => (
                  <div
                    key={seed.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/10"
                  >
                    <span className="material-symbols-outlined text-primary/50 shrink-0" style={{ fontSize: '18px', fontVariationSettings: '"FILL" 1' }}>eco</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {seed.title || (seed.content || seed.text || '').split('\n')[0]?.slice(0, 60) || 'Untitled'}
                      </p>
                    </div>
                    <button
                      onClick={() => developSeed(seed)}
                      className="flex items-center gap-1 shrink-0 text-[10px] font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>draft</span>
                      Spec it
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* PRDs & Specs library */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="heading text-on-surface">PRDs &amp; Specs</h2>
              {prds.length > 0 && (
                <button
                  onClick={() => router.push('/chat?mode=spec')}
                  className="flex items-center gap-1 text-[11px] font-bold text-primary px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span>
                  New spec
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <Card key={i} className="bg-surface-container-low border-outline-variant/10">
                    <CardContent className="p-4 flex gap-3">
                      <Skeleton className="w-10 h-10 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4 rounded-full" />
                        <Skeleton className="h-3 w-full rounded-full" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : prds.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="default">
                    <span className="material-symbols-outlined text-5xl text-on-surface-variant">draft</span>
                  </EmptyMedia>
                  <EmptyTitle>No PRDs yet</EmptyTitle>
                  <EmptyDescription>
                    Spec out an idea and it lands here as a structured PRD — ready to copy straight into Claude Code.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold" onClick={() => router.push('/chat?mode=spec')}>
                    <span className="material-symbols-outlined text-lg mr-1">draft</span>
                    Spec out your first idea
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="space-y-2">
                {prds.map(prd => (
                  <Card
                    key={prd.id}
                    className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all cursor-pointer"
                    onClick={() => setSelected(prd)}
                  >
                    <CardContent className="p-4 flex gap-3">
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1' }}>draft</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-on-surface truncate">{prd.title}</p>
                        <p className="text-xs text-on-surface-variant/60 mt-0.5 line-clamp-2 leading-relaxed">
                          {prd.content.replace(/[#*_`>-]/g, '').replace(/\n+/g, ' ').slice(0, 140)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {prd.local && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">SPEC MODE</span>
                          )}
                          <span className="text-[9px] text-on-surface-variant/40">{timeAgo(prd.createdAt)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}
