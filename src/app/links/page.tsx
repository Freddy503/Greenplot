'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import { LinkDetailSheet } from '@/components/links/link-detail-sheet'
import { toast } from 'sonner'

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

function LinkCard({ link, onStar, onDelete, onClick, onSaveToGarden }: { link: LinkItem; onStar: () => void; onDelete: () => void; onClick: () => void; onSaveToGarden: () => void }) {
 const domainColor = getDomainColor(link.domain)
 return (
 <Card className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all group cursor-pointer" onClick={onClick}>
 <CardContent className="p-4">
 <div className="flex gap-3">
  {/* Favicon */}
  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden relative">
  <span className="material-symbols-outlined text-sm text-on-surface-variant/50 absolute">language</span>
  <img
  src={link.favicon || getFavicon(link.domain)}
  alt=""
  className="w-5 h-5 relative z-10 bg-surface-container-high"
  onError={(e) => {
  (e.target as HTMLImageElement).style.display = 'none'
  }}
  />
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
  onClick={(e) => { e.stopPropagation(); onStar() }}
  className="flex-shrink-0 p-1 rounded-full hover:bg-primary/10 transition-colors"
  >
  <span
   className="material-symbols-outlined text-lg"
   style={{ fontVariationSettings: link.starred ? '"FILL" 1' : '"FILL" 0', color: link.starred ? 'var(--color-primary)' : undefined }}
  >
   star
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
  {/* Save to Garden */}
  {link.garden_seed_id ? (
  <span className="flex items-center gap-0.5 text-[9px] text-primary/70">
   <span className="material-symbols-outlined" style={{ fontSize: '12px', fontVariationSettings: '"FILL" 1' }}>eco</span>
   in garden
  </span>
  ) : (
  <button
   onClick={(e) => { e.stopPropagation(); onSaveToGarden() }}
   className="flex items-center gap-0.5 text-[9px] text-on-surface-variant/50 hover:text-primary transition-colors"
   title="Save to Garden"
  >
   <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>eco</span>
   save
  </button>
  )}
  <span className="text-[9px] text-on-surface-variant/40 ml-auto">
  {timeAgo(link.addedAt)}
  </span>
  </div>
  </div>

  {/* Delete */}
  <button
  onClick={(e) => { e.stopPropagation(); onDelete() }}
  className="flex-shrink-0 p-1.5 rounded-full text-on-surface-variant/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
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

 const [links, setLinks] = useState<LinkItem[]>([])
 const [loading, setLoading] = useState(true)
 const [fetchError, setFetchError] = useState<string | null>(null)
 const [addOpen, setAddOpen] = useState(false)
 const [bulkText, setBulkText] = useState('')
 const [bulkImporting, setBulkImporting] = useState(false)
 const [newUrl, setNewUrl] = useState('')
 const [adding, setAdding] = useState(false)
 const [filter, setFilter] = useState<'all' | 'starred'>('all')
 const [search, setSearch] = useState('')
 const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
 const [selectedLink, setSelectedLink] = useState<LinkItem | null>(null)
 const [detailOpen, setDetailOpen] = useState(false)

 // Fetch links from API — shared by initial load and polling
 const fetchLinks = useCallback(async (silent = false) => {
 if (!silent) setLoading(true)
 const token = localStorage.getItem('greenplot_token')
 try {
  const r = await fetch('/api/links', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const data = await r.json()
  const allLinks = data.links || []
  setLinks(allLinks)

  // Badge: count new sources since last visit
  const lastSeen = parseInt(localStorage.getItem('greenplot_last_sources_visit') || '0', 10)
  const newCount = allLinks.filter((l: any) => {
  const ts = new Date(l.created_at || l.addedAt).getTime()
  return ts > lastSeen
  }).length
  if (newCount > 0) localStorage.setItem('greenplot_new_sources', newCount.toString())
  localStorage.setItem('greenplot_last_sources_visit', Date.now().toString())
  localStorage.setItem('greenplot_new_sources', '0')
 } catch (err) {
  if (!silent) {
  const stored = localStorage.getItem('greenplot_links')
  if (stored) {
    try { setLinks(JSON.parse(stored)) } catch {}
  } else {
    const msg = err instanceof Error ? err.message : 'Could not load links'
    setFetchError(msg)
    toast.error('Could not load your sources — check your connection')
  }
  }
 } finally {
  if (!silent) setLoading(false)
 }
 }, [])

 // Initial load
 useEffect(() => { fetchLinks() }, [fetchLinks])

 // Poll every 20s — picks up backend enrichment (title, summary, tags)
 // without the user needing to refresh
 const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
 useEffect(() => {
 pollRef.current = setInterval(() => fetchLinks(true), 20_000)
 return () => { if (pollRef.current) clearInterval(pollRef.current) }
 }, [fetchLinks])

 // Save to localStorage as cache
 const saveLinksCache = useCallback((updated: LinkItem[]) => {
 localStorage.setItem('greenplot_links', JSON.stringify(updated))
 }, [])

 // Add link via backend API
 const handleAdd = async () => {
   if (!newUrl.trim()) return
   setAdding(true)
   const toastId = toast.loading('Adding link…')
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
     const data = await res.json()
     if (res.ok) {
       if (data.status === 'exists') {
         toast.info('Already in your sources', { id: toastId })
       } else {
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
         setLinks(prev => [newLink, ...prev])
         saveLinksCache([newLink, ...links])
         toast.success('Link added!', { id: toastId })
       }
     } else {
       toast.error(data.error || 'Failed to add link', { id: toastId })
     }
   } catch {
     toast.error('Could not reach backend', { id: toastId })
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

 const toastId = toast.loading(`Importing ${urls.length} URL${urls.length !== 1 ? 's' : ''}…`)
 try {
   const token = localStorage.getItem('greenplot_token')
   const res = await fetch('/api/links/bulk', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       ...(token ? { Authorization: `Bearer ${token}` } : {}),
     },
     body: JSON.stringify({ urls }),
   })
   const data = await res.json()
   if (res.ok) {
     toast.success(`Imported ${data.created ?? urls.length} link${(data.created ?? urls.length) !== 1 ? 's' : ''}${data.skipped ? ` · ${data.skipped} duplicates skipped` : ''}`, { id: toastId })
     // Refresh list
     const listRes = await fetch('/api/links', {
       headers: token ? { Authorization: `Bearer ${token}` } : {},
     })
     const listData = await listRes.json()
     if (listData.links) {
       setLinks(listData.links)
       saveLinksCache(listData.links)
     }
   } else {
     toast.error(data.error || 'Import failed', { id: toastId })
   }
 } catch {
   toast.error('Could not reach backend', { id: toastId })
 }

 setBulkText('')
 setAddOpen(false)
 setBulkImporting(false)
 }

 const saveToGarden = async (link: LinkItem) => {
  const token = localStorage.getItem('greenplot_token') || ''
  const toastId = toast.loading(`Saving "${link.title || link.domain}" to Garden…`)
  try {
   const res = await fetch('/api/seeds', {
    method: 'POST',
    headers: {
     'Content-Type': 'application/json',
     ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
     content: [link.title, link.summary, link.url].filter(Boolean).join('\n\n').slice(0, 4000),
     source: 'link',
    }),
   })
   if (res.ok) {
    toast.success('Saved to Garden!', { id: toastId })
    // Mark the link as in-garden locally
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, garden_seed_id: 'local' } : l))
   } else {
    toast.error('Failed to save', { id: toastId })
   }
  } catch {
   toast.error('Could not reach backend', { id: toastId })
  }
 }

 // Filter
 const filtered = links
 .filter(l => filter === 'starred' ? l.starred : true)
 .filter(l => {
 if (!search) return true
 const q = search.toLowerCase()
 return l.title.toLowerCase().includes(q) || l.domain.toLowerCase().includes(q) || l.tags.some(t => t.toLowerCase().includes(q))
 })
 .sort((a, b) => {
 const ta = new Date(a.addedAt || 0).getTime()
 const tb = new Date(b.addedAt || 0).getTime()
 return sortDir === 'desc' ? tb - ta : ta - tb
 })

 const starredCount = links.filter(l => l.starred).length

 return (
 <div className="h-dvh flex flex-col bg-background">
 <Header />

 <main className="flex-1 overflow-y-auto animate-fade-rise" style={{ paddingTop: 'var(--header-height)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}>
 {/* Hero */}
 <section className="px-2">
   <div className="flex items-center justify-between">
     <h1 className="text-3xl font-normal tracking-tight leading-tight text-on-surface">
       Link <span className="text-primary">Sources</span>
     </h1>
     <Button
       onClick={() => setAddOpen(true)}
       className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold text-sm px-5"
     >
       <span className="material-symbols-outlined text-lg mr-1">add_link</span>
       Add
     </Button>
   </div>
   <p className="text-sm leading-relaxed max-w-xs text-on-surface-variant mt-1">
     Drop links. Auto-enrich. Grow your knowledge garden.
   </p>
 </section>

 {/* Search */}
 <div className="px-2">
   <div className="relative">
     <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 pointer-events-none" style={{ fontSize: '18px' }}>search</span>
     <Input
       placeholder="Search links..."
       value={search}
       onChange={(e) => setSearch(e.target.value)}
       className="pl-10 rounded-full bg-surface-container-low border-outline-variant/10 text-sm"
     />
   </div>
   {/* Filter + Sort row */}
   <div className="flex items-center gap-2 mt-2">
     <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-full flex-1">
       <button
         onClick={() => setFilter('all')}
         className={`flex-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filter === 'all' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/60'}`}
       >
         All ({links.length})
       </button>
       <button
         onClick={() => setFilter('starred')}
         className={`flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${filter === 'starred' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/60'}`}
       >
         <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 1' }}>star</span>
         ({starredCount})
       </button>
     </div>
     <button
       onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
       className="flex items-center gap-1 px-3 py-2 rounded-full bg-surface-container-low border border-outline-variant/10 hover:border-primary/30 text-[10px] font-bold text-on-surface-variant/60 hover:text-primary transition-colors flex-shrink-0"
     >
       <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{sortDir === 'desc' ? 'arrow_downward' : 'arrow_upward'}</span>
       {sortDir === 'desc' ? 'Newest' : 'Oldest'}
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
  <span className="material-symbols-outlined text-5xl text-on-surface-variant">{fetchError ? 'wifi_off' : 'link'}</span>
  </EmptyMedia>
  <EmptyTitle>{fetchError ? 'Could not load sources' : filter === 'starred' ? 'No starred links' : 'No links yet'}</EmptyTitle>
  <EmptyDescription>
  {fetchError
   ? fetchError
   : filter === 'starred'
    ? 'Star your favorite links to find them quickly.'
    : 'Drop URLs here to start building your link collection.'}
  </EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
  {fetchError ? (
  <Button variant="outline" className="rounded-full" onClick={() => { setFetchError(null); fetchLinks() }}>
   <span className="material-symbols-outlined text-lg mr-1">refresh</span>
   Retry
  </Button>
  ) : filter !== 'starred' ? (
  <Button variant="outline" className="rounded-full" onClick={() => setAddOpen(true)}>
   <span className="material-symbols-outlined text-lg mr-1">add_link</span>
   Add First Link
  </Button>
  ) : null}
  </EmptyContent>
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
  onSaveToGarden={() => saveToGarden(link)}
  />
  ))}
  </div>
 )}
 </main>

 <BottomNav />

 {/* Add / Import Dialog */}
 <Dialog open={addOpen} onOpenChange={setAddOpen}>
   <DialogContent className="sm:max-w-lg bg-surface-container border-outline-variant/10">
     <DialogHeader>
       <DialogTitle className="text-on-surface font-extrabold">Add Link</DialogTitle>
       <DialogDescription className="sr-only">Add a single URL or import multiple links at once.</DialogDescription>
     </DialogHeader>
     <Tabs defaultValue="single" className="mt-1">
       <TabsList className="w-full bg-surface-container-high rounded-xl p-1 h-auto grid grid-cols-2 mb-4">
         <TabsTrigger value="single" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm py-2">Single URL</TabsTrigger>
         <TabsTrigger value="bulk" className="rounded-lg text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm py-2">Bulk Import</TabsTrigger>
       </TabsList>

       <TabsContent value="single" className="mt-0 space-y-4">
         <p className="text-xs text-on-surface-variant">Paste a URL and we'll fetch the title, summary, and tags automatically.</p>
         <Input
           placeholder="https://example.com/article"
           value={newUrl}
           onChange={(e) => setNewUrl(e.target.value)}
           onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
           className="rounded-xl bg-surface-container-low border-outline-variant/10"
           autoFocus
         />
         <div className="flex gap-2 justify-end">
           <Button variant="ghost" onClick={() => setAddOpen(false)} className="rounded-full">Cancel</Button>
           <Button onClick={handleAdd} disabled={!newUrl.trim() || adding} className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold">
             {adding
               ? <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
               : <><span className="material-symbols-outlined text-lg mr-1">add</span>Add Link</>}
           </Button>
         </div>
       </TabsContent>

       <TabsContent value="bulk" className="mt-0 space-y-4">
         <p className="text-xs text-on-surface-variant">Paste URLs (one per line) or a Chrome bookmark JSON export.</p>
         <textarea
           placeholder={"https://example.com/article\nhttps://another-link.com\n\nOr paste Chrome bookmarks JSON..."}
           value={bulkText}
           onChange={(e) => setBulkText(e.target.value)}
           className="w-full h-36 px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30 transition-colors resize-none font-mono"
         />
         <p className="text-[10px] text-on-surface-variant/50 -mt-2">
           {bulkText.split('\n').filter(l => l.trim()).length} URLs detected · Max 20 per batch
         </p>
         <div className="flex gap-2 justify-end">
           <Button variant="ghost" onClick={() => setAddOpen(false)} className="rounded-full">Cancel</Button>
           <Button onClick={handleBulkImport} disabled={!bulkText.trim() || bulkImporting} className="rounded-full bg-primary text-on-primary hover:bg-primary/90 font-bold">
             {bulkImporting
               ? <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
               : <><span className="material-symbols-outlined text-lg mr-1">upload</span>Import</>}
           </Button>
         </div>
       </TabsContent>
     </Tabs>
   </DialogContent>
 </Dialog>

 {/* Link Detail Sheet */}
 <LinkDetailSheet
 link={selectedLink}
 open={detailOpen}
 onOpenChange={setDetailOpen}
 onStarChange={(id, starred) => {
  const updated = links.map(l => l.id === id ? { ...l, starred } : l)
  setLinks(updated)
  saveLinksCache(updated)
 }}
 />
 </div>
 )
}
