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
import { LinkDetailSheet } from '@/components/links/link-detail-sheet'

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
 status?: string
 connection_count?: number
 garden_seed_id?: string
 enrichedAt?: string
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

function LinkCard({ link, onStar, onDelete, onClick }: { link: LinkItem; onStar: () => void; onDelete: () => void; onClick: () => void }) {
 const domainColor = getDomainColor(link.domain)
 return (
 <Card className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all group cursor-pointer" onClick={onClick}>
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
  <span className="material-symbols-outlined text-sm text-on-surface-variant/50" >language</span>
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
  {/* Cross-tab connections */}
  {link.garden_seed_id && (
  <span className="flex items-center gap-0.5 text-[9px] text-primary/70">
   <span className="material-symbols-outlined" >eco</span>
   in garden
  </span>
  )}
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
 const [bulkOpen, setBulkOpen] = useState(false)
 const [bulkText, setBulkText] = useState('')
 const [bulkImporting, setBulkImporting] = useState(false)
 const [newUrl, setNewUrl] = useState('')
 const [adding, setAdding] = useState(false)
 const [filter, setFilter] = useState<'all' | 'starred'>('all')
 const [search, setSearch] = useState('')
 const [selectedLink, setSelectedLink] = useState<LinkItem | null>(null)
 const [detailOpen, setDetailOpen] = useState(false)

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

 // Bulk import: parse URLs from text (one per line or Chrome bookmark JSON)
 const handleBulkImport = async () => {
 if (!bulkText.trim()) return
 setBulkImporting(true)

 let urls: string[] = []

 // Try parsing as Chrome bookmark JSON
 try {
 const json = JSON.parse(bulkText)
 const extractUrls = (node: any): string[] => {
 const result: string[] = []
 if (node.url) result.push(node.url)
 if (node.children) node.children.forEach((c: any) => result.push(...extractUrls(c)))
 return result
 }
 if (json.roots) {
 Object.values(json.roots).forEach((root: any) => urls.push(...extractUrls(root)))
 } else if (Array.isArray(json)) {
 json.forEach((item: any) => { if (item.url) urls.push(item.url) })
 }
 } catch {
 // Plain text: one URL per line
 urls = bulkText.split('\n').map(l => l.trim()).filter(l => l && (l.startsWith('http') || l.includes('.')))
 }

 if (urls.length === 0) {
 setBulkImporting(false)
 return
 }

 // Cap at 20
 urls = urls.slice(0, 20)

 try {
 const token = localStorage.getItem('greenplot_token')
 const res = await fetch('/api/links', {
 method: 'POST',
 headers: {
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
 },
 body: JSON.stringify({ urls }), // Will hit bulk endpoint
 })

 if (res.ok) {
 // Refresh links
 const listRes = await fetch('/api/links', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
 })
 const data = await listRes.json()
 if (data.links) {
  setLinks(data.links)
  saveLinksCache(data.links)
 }
 }
 } catch {}

 setBulkText('')
 setBulkOpen(false)
 setBulkImporting(false)
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
 <div className="h-screen flex flex-col bg-background">
 <Header />

 <main className="flex-1 overflow-y-auto">
 {/* Hero */}
 <section className=" px-2">
  <div className="flex items-center justify-between ">
  <h1 className="text-3xl font-extrabold tracking-tight leading-tight text-on-surface">
  Link <span className="text-primary">Sources</span>
  </h1>
  <div className="flex items-center gap-2">
  <Button
  onClick={() => setBulkOpen(true)}
  variant="outline"
  className="rounded-full text-sm px-4"
  >
  <span className="material-symbols-outlined text-lg mr-1">upload</span>
  Import
  </Button>
  <Button
  onClick={() => setAddOpen(true)}
  className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold text-sm px-5"
  >
  <span className="material-symbols-outlined text-lg mr-1" >add_link</span>
  Add
  </Button>
  </div>
  </div>
  <p className="text-sm leading-relaxed max-w-xs text-on-surface-variant">
  Drop links. Auto-enrich. Grow your knowledge garden.
  </p>
 </section>

 {/* Search + Filter */}
 <div className="flex items-center gap-2 px-2">
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
  <span className="material-symbols-outlined text-sm" >star</span>
  ({starredCount})
  </button>
  </div>
 </div>

 {/* Links */}
 {loading ? (
  <div className="space-y-2">
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
  <div className="space-y-2">
  {filtered.map(link => (
  <LinkCard
  key={link.id}
  link={link}
  onStar={() => toggleStar(link.id)}
  onDelete={() => deleteLink(link.id)}
  onClick={() => { setSelectedLink(link); setDetailOpen(true) }}
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
   <span className="material-symbols-outlined text-lg mr-1" >add</span>
   Add Link
  </>
  )}
  </Button>
  </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Bulk Import Dialog */}
 <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
 <DialogContent className="sm:max-w-2xl bg-surface-container border-outline-variant/10">
  <DialogHeader>
  <DialogTitle className="text-on-surface font-extrabold">Import Links</DialogTitle>
  <DialogDescription className="text-on-surface-variant">
  Paste URLs (one per line) or Chrome bookmark JSON export.
  </DialogDescription>
  </DialogHeader>
  <div className="py-4">
  <textarea
  placeholder={"https://example.com/article\nhttps://another-link.com\n\nOr paste Chrome bookmarks JSON..."}
  value={bulkText}
  onChange={(e) => setBulkText(e.target.value)}
  className="w-full h-40 px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30 transition-colors resize-none font-mono"
  />
  <p className="text-[10px] text-on-surface-variant/50 mt-2">
  {bulkText.split('\n').filter(l => l.trim()).length} URLs detected · Max 20 per batch
  </p>
  </div>
  <DialogFooter>
  <Button variant="ghost" onClick={() => setBulkOpen(false)} className="rounded-full">
  Cancel
  </Button>
  <Button
  onClick={handleBulkImport}
  disabled={!bulkText.trim() || bulkImporting}
  className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold"
  >
  {bulkImporting ? (
  <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
  ) : (
  <>
   <span className="material-symbols-outlined text-lg mr-1" >upload</span>
   Import
  </>
  )}
  </Button>
  </DialogFooter>
 </DialogContent>
 </Dialog>

 {/* Link Detail Sheet */}
 <LinkDetailSheet
 link={selectedLink}
 open={detailOpen}
 onOpenChange={setDetailOpen}
 />
 </div>
 )
}
