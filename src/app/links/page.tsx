'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'

// ── Types ─────────────────────────────────────────────

interface LinkItem {
  id: string
  url: string
  title: string
  summary: string
  domain: string
  tags: string[]
  favicon: string
  addedAt: string
  starred: boolean
}

// ── Helpers ───────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return 'unknown'
  }
}

function getFavicon(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
}

function getDomainColor(domain: string): string {
  const d = domain.toLowerCase()
  if (d.includes('github')) return 'bg-gray-500/10 text-gray-400'
  if (d.includes('youtube')) return 'bg-red-500/10 text-red-400'
  if (d.includes('twitter') || d.includes('x.com')) return 'bg-blue-500/10 text-blue-400'
  if (d.includes('arxiv') || d.includes('scholar')) return 'bg-purple-500/10 text-purple-400'
  if (d.includes('notion')) return 'bg-amber-500/10 text-amber-400'
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

// ── Link Card ─────────────────────────────────────────

function LinkCard({ link, onStar, onDelete }: { link: LinkItem; onStar: () => void; onDelete: () => void }) {
  const domainColor = getDomainColor(link.domain)
  return (
    <Card className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all group">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Favicon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden">
            <img
              src={link.favicon || getFavicon(link.domain)}
              alt=""
              className="w-5 h-5"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
            <span className="material-symbols-outlined text-sm text-on-surface-variant/50" style={{ display: 'none' }}>language</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-on-surface hover:text-primary transition-colors line-clamp-2 leading-snug"
              >
                {link.title || link.url}
              </a>
              <button
                onClick={onStar}
                className="flex-shrink-0 p-1 rounded-full hover:bg-primary/10 transition-colors"
              >
                <span
                  className="material-symbols-outlined text-lg"
                  style={{
                    fontVariationSettings: link.starred ? '"FILL" 1' : '"FILL" 0',
                    color: link.starred ? '#fbbf24' : undefined,
                  }}
                >
                  {link.starred ? 'star' : 'star'}
                </span>
              </button>
            </div>

            {link.summary && (
              <p className="text-xs text-on-surface-variant/70 mt-1.5 line-clamp-2 leading-relaxed">
                {link.summary}
              </p>
            )}

            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <Badge variant="outline" className={`text-[9px] px-2 py-0.5 border-0 ${domainColor}`}>
                {link.domain}
              </Badge>
              {link.tags.slice(0, 3).map((tag, i) => (
                <Badge key={i} variant="outline" className="text-[9px] px-2 py-0.5 bg-surface-container-high border-outline-variant/20">
                  {tag}
                </Badge>
              ))}
              <span className="text-[9px] text-on-surface-variant/40 ml-auto">
                {timeAgo(link.addedAt)}
              </span>
            </div>
          </div>

          {/* Delete */}
          <button
            onClick={onDelete}
            className="flex-shrink-0 p-1.5 rounded-full text-on-surface-variant/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────

export default function LinksPage() {
  const router = useRouter()
  const [links, setLinks] = useState<LinkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'all' | 'starred'>('all')
  const [search, setSearch] = useState('')

  // Load from API
  useEffect(() => {
    const token = localStorage.getItem('greenplot_token')
    fetch('/api/links', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => {
        setLinks(data.links || [])
      })
      .catch(() => {
        // Fallback to localStorage
        const stored = localStorage.getItem('greenplot_links')
        if (stored) { try { setLinks(JSON.parse(stored)) } catch {} }
      })
      .finally(() => setLoading(false))
  }, [])

  // Save to localStorage as cache
  const saveLinksCache = useCallback((updated: LinkItem[]) => {
    localStorage.setItem('greenplot_links', JSON.stringify(updated))
  }, [])

  // Add link via backend API
  const handleAdd = async () => {
    if (!newUrl.trim()) return
    setAdding(true)

    try {
      const token = localStorage.getItem('greenplot_token')
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: newUrl }),
      })

      if (res.ok) {
        const data = await res.json()
        const newLink: LinkItem = {
          id: data.id,
          url: data.url,
          title: data.title || extractDomain(data.url),
          summary: data.summary || '',
          domain: data.domain || extractDomain(data.url),
          tags: [],
          favicon: getFavicon(data.domain || extractDomain(data.url)),
          addedAt: new Date().toISOString(),
          starred: false,
        }
        const updated = [newLink, ...links]
        setLinks(updated)
        saveLinksCache(updated)
      } else {
        // Fallback: local add
        const url = newUrl.startsWith('http') ? newUrl : `https://${newUrl}`
        const domain = extractDomain(url)
        const newLink: LinkItem = {
          id: crypto.randomUUID(),
          url,
          title: domain,
          summary: '',
          domain,
          tags: [],
          favicon: getFavicon(domain),
          addedAt: new Date().toISOString(),
          starred: false,
        }
        const updated = [newLink, ...links]
        setLinks(updated)
        saveLinksCache(updated)
      }
    } catch {
      // Fallback: local add
      const url = newUrl.startsWith('http') ? newUrl : `https://${newUrl}`
      const domain = extractDomain(url)
      const newLink: LinkItem = {
        id: crypto.randomUUID(),
        url,
        title: domain,
        summary: '',
        domain,
        tags: [],
        favicon: getFavicon(domain),
        addedAt: new Date().toISOString(),
        starred: false,
      }
      const updated = [newLink, ...links]
      setLinks(updated)
      saveLinksCache(updated)
    }

    setNewUrl('')
    setAddOpen(false)
    setAdding(false)
  }

  const toggleStar = async (id: string) => {
    const link = links.find(l => l.id === id)
    if (!link) return
    const newStarred = !link.starred

    // Optimistic update
    const updated = links.map(l => l.id === id ? { ...l, starred: newStarred } : l)
    setLinks(updated)
    saveLinksCache(updated)

    // Backend sync
    try {
      const token = localStorage.getItem('greenplot_token')
      await fetch(`/api/links/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ starred: newStarred }),
      })
    } catch {}
  }

  const deleteLink = async (id: string) => {
    // Optimistic delete
    const updated = links.filter(l => l.id !== id)
    setLinks(updated)
    saveLinksCache(updated)

    // Backend sync
    try {
      const token = localStorage.getItem('greenplot_token')
      await fetch(`/api/links/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch {}
  }

  // Filter
  const filtered = links
    .filter(l => filter === 'starred' ? l.starred : true)
    .filter(l => {
      if (!search) return true
      const q = search.toLowerCase()
      return l.title.toLowerCase().includes(q) || l.domain.toLowerCase().includes(q) || l.tags.some(t => t.toLowerCase().includes(q))
    })

  const starredCount = links.filter(l => l.starred).length

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="pt-20 pb-28 px-4 max-w-2xl mx-auto w-full">
        {/* Hero */}
        <section className="mb-6 px-2">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-extrabold tracking-tight leading-tight text-on-surface">
              Link <span className="text-primary">Hub</span>
            </h1>
            <Button
              onClick={() => setAddOpen(true)}
              className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold text-sm px-5"
            >
              <span className="material-symbols-outlined text-lg mr-1" style={{ fontVariationSettings: '"FILL" 1' }}>add_link</span>
              Add
            </Button>
          </div>
          <p className="text-sm leading-relaxed max-w-xs text-on-surface-variant">
            Drop links. Auto-enrich. Grow your knowledge garden.
          </p>
        </section>

        {/* Search + Filter */}
        <div className="flex items-center gap-2 mb-5 px-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-lg">search</span>
            <Input
              placeholder="Search links..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 rounded-full bg-surface-container-low border-outline-variant/10 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-full">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                filter === 'all' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/60'
              }`}
            >
              All ({links.length})
            </button>
            <button
              onClick={() => setFilter('starred')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                filter === 'starred' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/60'
              }`}
            >
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>star</span>
              ({starredCount})
            </button>
          </div>
        </div>

        {/* Links */}
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
                <span className="material-symbols-outlined text-5xl text-on-surface-variant">link</span>
              </EmptyMedia>
              <EmptyTitle>{filter === 'starred' ? 'No starred links' : 'No links yet'}</EmptyTitle>
              <EmptyDescription>
                {filter === 'starred'
                  ? 'Star your favorite links to find them quickly.'
                  : 'Drop URLs here to start building your link collection.'}
              </EmptyDescription>
            </EmptyHeader>
            {filter !== 'starred' && (
              <EmptyContent>
                <Button variant="outline" className="rounded-full" onClick={() => setAddOpen(true)}>
                  <span className="material-symbols-outlined text-lg mr-1">add_link</span>
                  Add First Link
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <div className="space-y-3">
            {filtered.map(link => (
              <LinkCard
                key={link.id}
                link={link}
                onStar={() => toggleStar(link.id)}
                onDelete={() => deleteLink(link.id)}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav />

      {/* Add Link Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md bg-surface-container border-outline-variant/10">
          <DialogHeader>
            <DialogTitle className="text-on-surface font-extrabold">Add Link</DialogTitle>
            <DialogDescription className="text-on-surface-variant">
              Paste a URL and we'll fetch the title, summary, and tags automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="https://example.com/article"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="rounded-xl bg-surface-container-low border-outline-variant/10"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!newUrl.trim() || adding}
              className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold"
            >
              {adding ? (
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg mr-1" style={{ fontVariationSettings: '"FILL" 1' }}>add</span>
                  Add Link
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
