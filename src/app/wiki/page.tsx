'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'

// ── Types ─────────────────────────────────────────────

interface WikiArticle {
  id: string
  title: string
  content: string
  category: string
  backlinks: string[]
  createdAt: string
  updatedAt: string
  seedIds?: string[]
  sourceSeedIds?: string[]
  sourceLinkIds?: string[]
  summary?: string
}

// ── Helpers ───────────────────────────────────────────

function getCategoryIcon(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('concept') || c.includes('idea')) return 'lightbulb'
  if (c.includes('project') || c.includes('plan')) return 'rocket_launch'
  if (c.includes('research') || c.includes('study') || c.includes('science')) return 'science'
  if (c.includes('design') || c.includes('creative')) return 'palette'
  if (c.includes('tech') || c.includes('code') || c.includes('dev')) return 'terminal'
  if (c.includes('brand') || c.includes('marketing')) return 'campaign'
  if (c.includes('product') || c.includes('feature')) return 'widgets'
  return 'article'
}

function getCategoryColor(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('concept') || c.includes('idea')) return 'bg-amber-500/10 text-amber-400'
  if (c.includes('project') || c.includes('plan')) return 'bg-blue-500/10 text-blue-400'
  if (c.includes('research') || c.includes('study')) return 'bg-purple-500/10 text-purple-400'
  if (c.includes('design')) return 'bg-pink-500/10 text-pink-400'
  if (c.includes('tech') || c.includes('dev')) return 'bg-green-500/10 text-green-400'
  if (c.includes('brand')) return 'bg-red-500/10 text-red-400'
  if (c.includes('product')) return 'bg-cyan-500/10 text-cyan-400'
  return 'bg-primary/10 text-primary'
}

function timeAgo(date: string): string {
  const now = new Date()
  const d = new Date(date)
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

// ── Wiki Card ─────────────────────────────────────────

function WikiCard({ article, onClick }: { article: WikiArticle; onClick: () => void }) {
  const icon = getCategoryIcon(article.category)
  const color = getCategoryColor(article.category)
  const preview = truncate(article.content.replace(/[#*_`]/g, ''), 120)

  return (
    <Card
      className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
            <span
              className="material-symbols-outlined text-lg"
              style={{ fontVariationSettings: '"FILL" 1' }}
            >
              {icon}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors leading-snug">
              {article.title}
            </h3>
            <p className="text-xs text-on-surface-variant/60 mt-1 leading-relaxed line-clamp-2">
              {preview}
            </p>

            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <Badge variant="outline" className={`text-[9px] px-2 py-0.5 border-0 ${color}`}>
                {article.category}
              </Badge>
              {article.backlinks.length > 0 && (
                <span className="flex items-center gap-0.5 text-[9px] text-secondary/60">
                  <span className="material-symbols-outlined" style={{ fontSize: '10px', fontVariationSettings: '"FILL" 1' }}>link</span>
                  {article.backlinks.length} backlinks
                </span>
              )}
              <span className="text-[9px] text-on-surface-variant/40 ml-auto">
                {timeAgo(article.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Article Detail View ───────────────────────────────

function ArticleDetail({ article, onBack, allArticles }: { article: WikiArticle; onBack: () => void; allArticles: WikiArticle[] }) {
  const icon = getCategoryIcon(article.category)
  const color = getCategoryColor(article.category)

  // Find linked articles
  const linked = allArticles.filter(a => article.backlinks.includes(a.id))

  // Source Hub links + Garden seeds
  const [sourceLinks, setSourceLinks] = useState<Array<{id: string; title: string; url: string; domain: string}>>([])
  const [sourceSeeds, setSourceSeeds] = useState<Array<{id: string; title: string}>>([])
  const [loadingSources, setLoadingSources] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('greenplot_token')
    const linkIds = article.sourceLinkIds || []
    const seedIds = article.sourceSeedIds || []

    if (linkIds.length === 0 && seedIds.length === 0) return

    setLoadingSources(true)

    const fetches: Promise<void>[] = []

    if (linkIds.length > 0) {
      fetches.push(
        fetch('/api/links', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then(r => r.ok ? r.json() : { links: [] })
          .then(data => {
            const matched = (data.links || []).filter((l: any) => linkIds.includes(l.id))
            setSourceLinks(matched.map((l: any) => ({ id: l.id, title: l.title, url: l.url, domain: l.domain })))
          })
          .catch(() => {})
      )
    }

    if (seedIds.length > 0) {
      fetches.push(
        fetch(`/api/seeds?limit=50`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then(r => r.ok ? r.json() : { seeds: [] })
          .then(data => {
            const seeds = data.seeds || data || []
            const matched = Array.isArray(seeds) ? seeds.filter((s: any) => seedIds.includes(s.id || s._additional?.id)) : []
            setSourceSeeds(matched.map((s: any) => ({ id: s.id || s._additional?.id, title: s.title || s.content?.split('\n')[0]?.slice(0, 60) || 'Untitled' })))
          })
          .catch(() => {})
      )
    }

    Promise.all(fetches).finally(() => setLoadingSources(false))
  }, [article.id])

  return (
    <div className="animate-in slide-in-from-right duration-200">
      {/* Back button */}
      <div className="flex items-center justify-between mb-4 px-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          <span className="font-bold">Plants</span>
        </button>
        <button
          onClick={() => {
            const token = localStorage.getItem('greenplot_token')
            window.open(`/api/wiki/${article.id}/export?token=${token}`, '_blank')
          }}
          className="flex items-center gap-1 text-sm text-on-surface-variant/60 hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container"
          title="Download as Markdown"
        >
          <span className="material-symbols-outlined text-lg">download</span>
        </button>
      </div>

      {/* Article header */}
      <div className="flex items-start gap-3 mb-6 px-2">
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
          <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>
            {icon}
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-on-surface leading-tight">
            {article.title}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border-0 ${color}`}>
              {article.category}
            </Badge>
            <span className="text-[10px] text-on-surface-variant/50">
              Updated {timeAgo(article.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Article content */}
      <Card className="bg-surface-container-low border-outline-variant/10 mb-6">
        <CardContent className="p-5">
          <div className="prose prose-sm prose-invert max-w-none">
            {article.content.split('\n').map((line, i) => {
              if (line.startsWith('# ')) return <h2 key={i} className="text-lg font-extrabold text-on-surface mt-4 mb-2">{line.slice(2)}</h2>
              if (line.startsWith('## ')) return <h3 key={i} className="text-base font-bold text-on-surface mt-3 mb-1.5">{line.slice(3)}</h3>
              if (line.startsWith('- ')) return <li key={i} className="text-sm text-on-surface-variant ml-4 mb-1">{line.slice(2)}</li>
              if (line.trim() === '') return <div key={i} className="h-2" />
              return <p key={i} className="text-sm text-on-surface-variant leading-relaxed mb-2">{line}</p>
            })}
          </div>
        </CardContent>
      </Card>

      {/* Backlinks */}
      {linked.length > 0 && (
        <section className="px-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>link</span>
            Backlinks
          </h3>
          <div className="space-y-2">
            {linked.map(a => (
              <div
                key={a.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm text-on-surface-variant/40">{getCategoryIcon(a.category)}</span>
                <span className="text-sm font-medium text-on-surface">{a.title}</span>
                <span className="text-[9px] text-on-surface-variant/40 ml-auto">{a.category}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cross-Tab: Source Hub Links */}
      {sourceLinks.length > 0 && (
        <section className="px-2 mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>language</span>
            Source Links (from Sources)
          </h3>
          <div className="space-y-2">
            {sourceLinks.map(link => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/10 hover:border-blue-400/20 transition-all"
              >
                <span className="material-symbols-outlined text-blue-400 shrink-0" style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}>link</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-on-surface truncate">{link.title}</p>
                  <p className="text-[10px] text-on-surface-variant/60">{link.domain}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Cross-Tab: Source Garden Seeds */}
      {sourceSeeds.length > 0 && (
        <section className="px-2 mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>eco</span>
            Source Seeds (from Garden)
          </h3>
          <div className="space-y-2">
            {sourceSeeds.map(seed => (
              <div
                key={seed.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/10"
              >
                <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}>eco</span>
                <span className="text-xs font-medium text-on-surface">{seed.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────

export default function WikiPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<WikiArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedArticle, setSelectedArticle] = useState<WikiArticle | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Health dashboard state
  const [health, setHealth] = useState<any>(null)
  const [healthOpen, setHealthOpen] = useState(false)

  // Ask Garden state
  const [askQuestion, setAskQuestion] = useState('')
  const [askAnswer, setAskAnswer] = useState('')
  const [askSources, setAskSources] = useState<any[]>([])
  const [asking, setAsking] = useState(false)
  const [askOpen, setAskOpen] = useState(false)

  // Load wiki articles from API
  useEffect(() => {
    const token = localStorage.getItem('greenplot_token')
    fetch('/api/wiki', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => {
        setArticles(data.articles || [])
      })
      .catch(() => {
        const stored = localStorage.getItem('greenplot_wiki')
        if (stored) { try { setArticles(JSON.parse(stored)) } catch {} }
      })
      .finally(() => setLoading(false))

    // Load health data
    fetch('/api/garden/health', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => { if (!data.error) setHealth(data) })
      .catch(() => {})
  }, [])

  // Ask garden
  const handleAsk = async () => {
    if (!askQuestion.trim()) return
    setAsking(true)
    setAskAnswer('')
    setAskSources([])

    try {
      const token = localStorage.getItem('greenplot_token')
      const res = await fetch('/api/garden/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: askQuestion }),
      })
      const data = await res.json()
      setAskAnswer(data.answer || 'No answer found.')
      setAskSources(data.sources || [])
    } catch {
      setAskAnswer('Could not reach the garden. Try again later.')
    }
    setAsking(false)
  }

  // Get unique categories
  const categories = Array.from(new Set(articles.map(a => a.category)))

  // Filter
  const filtered = articles
    .filter(a => filter === 'all' || a.category === filter)
    .filter(a => {
      if (!search) return true
      const q = search.toLowerCase()
      return a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  // Selected article detail
  if (selectedArticle) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="pt-20 pb-28 px-4 max-w-2xl mx-auto w-full">
          <ArticleDetail
            article={selectedArticle}
            onBack={() => setSelectedArticle(null)}
            allArticles={articles}
          />
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="pt-20 pb-28 px-4 max-w-2xl mx-auto w-full">
        {/* Hero */}
        <section className="mb-6 px-2">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-3xl font-extrabold tracking-tight leading-tight text-on-surface">
              Knowledge <span className="text-primary">Plants</span>
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const token = localStorage.getItem('greenplot_token')
                  window.open(`/api/wiki/export/obsidian?token=${token}`, '_blank')
                }}
                className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant/60 hover:text-primary"
                title="Export as Obsidian vault"
              >
                <span className="material-symbols-outlined text-lg">folder_zip</span>
              </button>
              <button
                onClick={() => {
                  const token = localStorage.getItem('greenplot_token')
                  window.open(`/api/garden/export-training?token=${token}`, '_blank')
                }}
                className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant/60 hover:text-primary"
                title="Export training data"
              >
                <span className="material-symbols-outlined text-lg">model_training</span>
              </button>
            </div>
          </div>
          <p className="text-sm leading-relaxed max-w-xs text-on-surface-variant mt-1">
            Compiled articles from your garden seeds. Auto-maintained by your agents.
          </p>
        </section>

        {/* Stats bar */}
        {!loading && articles.length > 0 && (
          <div className="flex items-center gap-3 mb-5 px-2">
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>auto_stories</span>
              <span className="font-bold">{articles.length}</span> articles
            </div>
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>link</span>
              <span className="font-bold">{articles.reduce((sum, a) => sum + a.backlinks.length, 0)}</span> connections
            </div>
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>folder</span>
              <span className="font-bold">{categories.length}</span> categories
            </div>
          </div>
        )}

        {/* Garden Health Dashboard (P1) */}
        {health && (
          <div className="mb-5">
            <button
              onClick={() => setHealthOpen(!healthOpen)}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/20 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: '"FILL" 1' }}>monitoring</span>
                <div className="text-left">
                  <p className="text-sm font-bold text-on-surface">Garden Health</p>
                  <p className="text-[10px] text-on-surface-variant">
                    {health.coverage?.enrichment || 0}% enriched · {health.coverage?.wiki || 0}% in wiki · {health.summary?.orphan_links || 0} orphans
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant/40 transition-transform" style={{ transform: healthOpen ? 'rotate(180deg)' : '' }}>
                expand_more
              </span>
            </button>

            {healthOpen && (
              <div className="mt-3 space-y-3 animate-in slide-in-from-top duration-200">
                {/* Coverage bars */}
                <Card className="bg-surface-container-low border-outline-variant/10">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-on-surface-variant">Enrichment Coverage</span>
                        <span className="font-bold text-primary">{health.coverage?.enrichment || 0}%</span>
                      </div>
                      <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${health.coverage?.enrichment || 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-on-surface-variant">Plants Coverage</span>
                        <span className="font-bold text-secondary">{health.coverage?.wiki || 0}%</span>
                      </div>
                      <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                        <div className="h-full bg-secondary rounded-full transition-all" style={{ width: `${health.coverage?.wiki || 0}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick stats grid */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Links', value: health.summary?.total_links || 0, icon: 'link', color: 'text-primary' },
                    { label: 'Enriched', value: health.summary?.enriched_links || 0, icon: 'auto_fix_high', color: 'text-secondary' },
                    { label: 'Starred', value: health.summary?.starred_links || 0, icon: 'star', color: 'text-amber-400' },
                    { label: 'Articles', value: health.summary?.total_articles || 0, icon: 'auto_stories', color: 'text-blue-400' },
                  ].map((stat, i) => (
                    <Card key={i} className="bg-surface-container-low border-outline-variant/10">
                      <CardContent className="p-3 text-center">
                        <span className={`material-symbols-outlined text-lg ${stat.color}`} style={{ fontVariationSettings: '"FILL" 1' }}>{stat.icon}</span>
                        <p className="text-lg font-extrabold text-on-surface mt-1">{stat.value}</p>
                        <p className="text-[9px] text-on-surface-variant uppercase tracking-wider">{stat.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Top domains */}
                {health.top_domains?.length > 0 && (
                  <Card className="bg-surface-container-low border-outline-variant/10">
                    <CardContent className="p-4">
                      <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Top Domains</p>
                      <div className="space-y-2">
                        {health.top_domains.slice(0, 5).map((d: any, i: number) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-sm text-on-surface">{d.domain}</span>
                            <Badge variant="outline" className="text-[10px] bg-surface-container-high border-outline-variant/20">{d.count}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Suggestions */}
                {health.suggestions?.length > 0 && (
                  <div className="space-y-2">
                    {health.suggestions.map((s: any, i: number) => (
                      <Card key={i} className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all cursor-pointer">
                        <CardContent className="p-3 flex items-center gap-3">
                          <span className="material-symbols-outlined text-primary">{s.icon}</span>
                          <span className="text-sm text-on-surface flex-1">{s.text}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full ${
                            s.priority === 'high' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>{s.priority}</span>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ask Garden (P2) */}
        <div className="mb-5">
          <button
            onClick={() => setAskOpen(!askOpen)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/20 transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: '"FILL" 1' }}>psychology</span>
              <div className="text-left">
                <p className="text-sm font-bold text-on-surface">Ask Your Garden</p>
                <p className="text-[10px] text-on-surface-variant">Questions grounded in your knowledge base</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant/40 transition-transform" style={{ transform: askOpen ? 'rotate(180deg)' : '' }}>
              expand_more
            </span>
          </button>

          {askOpen && (
            <div className="mt-3 space-y-3 animate-in slide-in-from-top duration-200">
              {/* Input */}
              <div className="flex gap-2">
                <input
                  placeholder="What do I know about X?"
                  value={askQuestion}
                  onChange={(e) => setAskQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                  className="flex-1 px-4 py-2.5 rounded-full bg-surface-container-low border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30 transition-colors"
                />
                <Button
                  onClick={handleAsk}
                  disabled={!askQuestion.trim() || asking}
                  className="rounded-full bg-secondary text-on-primary hover:bg-secondary/90 font-bold px-5"
                >
                  {asking ? (
                    <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: '"FILL" 1' }}>search</span>
                  )}
                </Button>
              </div>

              {/* Answer */}
              {askAnswer && (
                <Card className="bg-surface-container-low border-outline-variant/10">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-secondary mt-0.5" style={{ fontVariationSettings: '"FILL" 1' }}>psychology</span>
                      <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap flex-1">{askAnswer}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sources */}
              {askSources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 px-2">Sources</p>
                  {askSources.map((src, i) => (
                    <Card key={i} className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all cursor-pointer">
                      <CardContent className="p-3 flex items-center gap-3">
                        <Badge variant="outline" className={`text-[9px] border-0 ${
                          src.type === 'wiki' ? 'bg-blue-500/10 text-blue-400' : 'bg-primary/10 text-primary'
                        }`}>{src.type === 'wiki' ? 'plant' : src.type}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-on-surface truncate">{src.title}</p>
                          <p className="text-[10px] text-on-surface-variant/60 truncate">{src.summary}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search + Category filter */}
        <div className="flex items-center gap-2 mb-5 px-2 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-lg">search</span>
            <input
              placeholder="Search plants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-full bg-surface-container-low border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30 transition-colors"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-full flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                  filter === 'all' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/60'
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                    filter === cat ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/60'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Articles */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="bg-surface-container-low border-outline-variant/10">
                <CardContent className="p-4 flex gap-3">
                  <Skeleton className="w-10 h-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4 rounded-full" />
                    <Skeleton className="h-3 w-full rounded-full" />
                    <Skeleton className="h-3 w-1/2 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="default">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant">auto_stories</span>
              </EmptyMedia>
              <EmptyTitle>No plants yet</EmptyTitle>
              <EmptyDescription>
                Plants are compiled automatically from your enriched garden seeds. Drop some links and ideas first, then let the agents synthesize them.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" className="rounded-full" onClick={() => router.push('/links')}>
                <span className="material-symbols-outlined text-lg mr-1">link</span>
                Add Links First
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-3">
            {filtered.map(article => (
              <WikiCard
                key={article.id}
                article={article}
                onClick={() => setSelectedArticle(article)}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
