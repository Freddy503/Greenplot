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
  seedIds: string[]
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

  return (
    <div className="animate-in slide-in-from-right duration-200">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary transition-colors mb-4 px-2"
      >
        <span className="material-symbols-outlined text-lg">arrow_back</span>
        <span className="font-bold">Wiki</span>
      </button>

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

  // Load wiki articles from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('greenplot_wiki')
    if (stored) {
      try {
        setArticles(JSON.parse(stored))
      } catch {}
    }
    setLoading(false)
  }, [])

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
          <h1 className="text-3xl font-extrabold tracking-tight leading-tight text-on-surface">
            Knowledge <span className="text-primary">Wiki</span>
          </h1>
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

        {/* Search + Category filter */}
        <div className="flex items-center gap-2 mb-5 px-2 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-lg">search</span>
            <input
              placeholder="Search wiki..."
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
              <EmptyTitle>No wiki articles yet</EmptyTitle>
              <EmptyDescription>
                Wiki articles are compiled automatically from your enriched garden seeds. Drop some links and ideas first, then let the agents synthesize them.
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
