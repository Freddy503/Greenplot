'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

interface SeedDetail {
  id: string
  title: string
  content?: string
  text?: string
  domain?: string
  tags?: string
  energy?: string
  summary?: string
  entities?: string
  source?: string
  url?: string
  created_at?: string
  created?: string
}

interface RelatedLink {
  id: string
  title: string
  url: string
  domain: string
  summary: string
}

interface SeedDetailSheetProps {
  seed: SeedDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: (id: string) => void
}

function getEnergyColor(energy: string) {
  const e = energy?.toLowerCase() || ''
  if (e.includes('hot') || e.includes('fire')) return 'bg-secondary/20 text-secondary'
  if (e.includes('flow') || e.includes('water')) return 'bg-primary/20 text-primary'
  if (e.includes('grow') || e.includes('seedling')) return 'bg-primary-container/20 text-primary'
  return 'bg-surface-container-high text-on-surface-variant'
}

function getDomainIcon(domain: string) {
  const d = domain?.toLowerCase() || ''
  if (d.includes('tech') || d.includes('ai') || d.includes('agentic')) return 'psychology'
  if (d.includes('enterprise') || d.includes('business')) return 'business'
  if (d.includes('career') || d.includes('fde')) return 'work'
  if (d.includes('creativ')) return 'auto_awesome'
  if (d.includes('system') || d.includes('architecture')) return 'hub'
  return 'eco'
}

function exportSeedMd(seed: SeedDetail) {
  const lines = [
    `# ${seed.title}`,
    '',
    seed.domain ? `**Domain:** ${seed.domain}` : '',
    seed.tags ? `**Tags:** ${seed.tags}` : '',
    seed.energy ? `**Energy:** ${seed.energy}` : '',
    seed.created_at || seed.created ? `**Created:** ${new Date(seed.created_at || seed.created || '').toLocaleDateString()}` : '',
    '',
    '## Content',
    '',
    seed.content || seed.text || seed.summary || '',
    seed.url ? `\n## Source\n\n${seed.url}` : '',
  ].filter(l => l !== '').join('\n')

  const blob = new Blob([lines], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${seed.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function shareSeed(seed: SeedDetail) {
  const text = `${seed.title}\n\n${(seed.content || seed.text || seed.summary || '').slice(0, 500)}`
  if (navigator.share) {
    navigator.share({ title: seed.title, text })
  } else {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }
}

export function SeedDetailSheet({ seed, open, onOpenChange, onDeleted }: SeedDetailSheetProps) {
  const router = useRouter()
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [relatedLinks, setRelatedLinks] = useState<RelatedLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Derive these before hooks so they're available in useEffect
  const tags = seed?.tags ? seed.tags.split(',').map(t => t.trim()).filter(Boolean) : []
  const domain = seed?.domain || ''
  const energy = seed?.energy || ''

  // Fetch related Sources links when sheet opens
  useEffect(() => {
    if (!open || !seed) return
    setLoadingLinks(true)
    const token = localStorage.getItem('greenplot_token')

    // Use server-side search with domain or title keywords
    const searchQuery = domain || tags[0] || seed.title?.split(' ').slice(0, 3).join(' ') || ''
    if (!searchQuery) {
      setLoadingLinks(false)
      return
    }

    fetch(`/api/links?search=${encodeURIComponent(searchQuery)}&limit=5`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : { links: [] })
      .then(data => {
        setRelatedLinks(data.links || [])
      })
      .catch(() => setRelatedLinks([]))
      .finally(() => setLoadingLinks(false))
  }, [open, seed?.id])

  // All hooks above — safe to return early now
  if (!seed) return null

  const entities = seed.entities ? seed.entities.split(',').map(e => e.trim()).filter(Boolean) : []

  const handleDelete = async () => {
    if (!seed) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    const token = localStorage.getItem('greenplot_token')
    try {
      const res = await fetch(`/api/seeds/${seed.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        toast.success('Seed deleted')
        onOpenChange(false)
        onDeleted?.(seed.id)
      } else {
        toast.error('Failed to delete seed')
      }
    } catch {
      toast.error('Could not reach server')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleArchive = async () => {
    if (!seed) return
    setArchiving(true)
    const token = localStorage.getItem('greenplot_token')
    try {
      const res = await fetch(`/api/seeds/${seed.id}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.archived ? 'Seed archived — hidden from Garden' : 'Seed restored to Garden')
        onOpenChange(false)
        onDeleted?.(seed.id)
      } else {
        toast.error('Failed to archive seed')
      }
    } catch {
      toast.error('Could not reach server')
    } finally {
      setArchiving(false)
    }
  }

  const handleWebSearch = async () => {
    setLoadingSearch(true)
    try {
      const res = await fetch('/api/seeds/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: seed.title, limit: 3 }),
      })
      const data = await res.json()
      if (data.seeds) {
        setSearchResults(data.seeds.map((s: { title: string }) => s.title))
      }
    } catch {}
    setLoadingSearch(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-[2rem] glass-card border-outline-variant/10 overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontSize: '22px', fontVariationSettings: '"FILL" 1' }}
              >
                {getDomainIcon(domain)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              {domain && (
                <Badge className="bg-primary/10 text-primary text-[9px] font-bold border-0 mb-1">
                  {domain}
                </Badge>
              )}
              <SheetTitle className="text-lg font-extrabold text-on-surface leading-tight">
                {seed.title}
              </SheetTitle>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => shareSeed(seed)}
                className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant/50 hover:text-primary transition-colors"
                title="Share"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>share</span>
              </button>
              <button
                onClick={() => exportSeedMd(seed)}
                className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant/50 hover:text-primary transition-colors"
                title="Export as Markdown"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>download</span>
              </button>
            </div>
          </div>
          {energy && (
            <Badge className={`${getEnergyColor(energy)} text-[10px] font-bold border-0 w-fit`}>
              {energy}
            </Badge>
          )}
        </SheetHeader>

        {/* Full Content */}
        <div className="mb-4">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Content</h3>
          <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/10">
            <p className="text-sm leading-relaxed text-on-surface whitespace-pre-wrap">
              {seed.content || seed.text || seed.summary || 'No content available'}
            </p>
          </div>
        </div>

        {/* Develop into a spec — thinking-partner nudge */}
        <button
          onClick={() => {
            try {
              localStorage.setItem('greenplot_spec_prefill', JSON.stringify({
                id: seed.id,
                title: seed.title,
                content: seed.content || seed.text || seed.summary || '',
              }))
            } catch {}
            router.push('/chat?mode=spec')
          }}
          className="w-full mb-6 flex items-center gap-3 p-4 rounded-2xl bg-primary/8 border border-primary/20 hover:bg-primary/12 transition-colors text-left"
        >
          <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: '22px', fontVariationSettings: '"FILL" 1' }}>draft</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-on-surface">Develop into a spec</p>
            <p className="text-[11px] text-on-surface-variant/70">Turn this idea into a structured PRD with guided questions</p>
          </div>
          <span className="material-symbols-outlined text-primary/60 shrink-0" style={{ fontSize: '18px' }}>arrow_forward</span>
        </button>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, i) => (
                <Badge key={i} variant="outline" className="text-xs px-3 py-1 bg-surface-container border-outline-variant/20 text-on-surface-variant">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Entities */}
        {entities.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Entities</h3>
            <div className="flex flex-wrap gap-2">
              {entities.map((entity, i) => (
                <Badge key={i} className="text-xs px-3 py-1 bg-tertiary/10 text-tertiary border-0">
                  {entity}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Source URL */}
        {seed.url && (
          <div className="mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Source</h3>
            <a
              href={seed.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all"
            >
              {seed.url}
            </a>
          </div>
        )}

        {/* Cross-Tab: Related Sources Links */}
        <div className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>link</span>
            From Sources
          </h3>
          {loadingLinks ? (
            <div className="h-10 bg-surface-container-high rounded-xl animate-pulse" />
          ) : relatedLinks.length > 0 ? (
            <div className="space-y-2">
              {relatedLinks.map((link, i) => (
                <Card key={i} className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all">
                  <CardContent className="p-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-400 shrink-0" style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}>link</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-on-surface truncate">{link.title}</p>
                      <p className="text-[10px] text-on-surface-variant/60">{link.domain}</p>
                    </div>
                    {link.url && (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant/40 hover:text-primary transition-colors">
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant/40 italic">No Sources links connected yet.</p>
          )}
        </div>

        {/* Related Seeds (from garden search) */}
        <div className="mb-6">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">
            Related from Garden
          </h3>
          {searchResults.length > 0 ? (
            <div className="space-y-2">
              {searchResults.map((title, i) => (
                <div key={i} className="flex items-center gap-2 bg-surface-container-low rounded-full px-4 py-2 border border-outline-variant/10">
                  <span className="material-symbols-outlined text-primary/40" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 1' }}>eco</span>
                  <span className="text-xs text-on-surface-variant">{title}</span>
                </div>
              ))}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs"
              onClick={handleWebSearch}
              disabled={loadingSearch}
            >
              {loadingSearch ? (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
                  Searching…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>search</span>
                  Find related seeds
                </span>
              )}
            </Button>
          )}
        </div>

        {/* Metadata */}
        {seed.created_at || seed.created && (
          <div className="text-[10px] text-on-surface-variant/40 text-center pb-4">
            Created {new Date(seed.created_at || seed.created).toLocaleDateString()}
          </div>
        )}

        {/* Destructive actions */}
        <div className="flex gap-2 pt-2 pb-6 border-t border-outline-variant/10 mt-2">
          <button
            onClick={handleArchive}
            disabled={archiving}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-outline-variant/20 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-40"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>archive</span>
            {archiving ? 'Archiving…' : 'Archive'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors disabled:opacity-40 ${
              confirmDelete
                ? 'bg-error text-on-error'
                : 'border border-error/30 text-error hover:bg-error/10'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
            {deleting ? 'Deleting…' : confirmDelete ? 'Confirm delete?' : 'Delete'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
