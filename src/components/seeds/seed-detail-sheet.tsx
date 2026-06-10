'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Leaf, Globe, Share2, Bookmark, Sparkles, ChevronRight, Link2, Clock, Trash2, Archive, Search, FileText, Plus, MoreHorizontal } from 'lucide-react'
import DetailHero, { DetailHeroBtn } from '@/components/ui/v2/detail-hero'
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

function timeAgo(dateStr?: string): string {
  if (!dateStr) return ''
  const ms = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(ms / 86400000)
  if (days < 1) return 'Today'
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
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

function SectionHeader({ children, action, onAction }: { children: React.ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 0 10px' }}>
      <span className="caps" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>{children}</span>
      {action && (
        <button onClick={onAction} className="tap ui" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--green-700)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
          {action}
        </button>
      )}
    </div>
  )
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
  const [showActions, setShowActions] = useState(false)

  const tags = seed?.tags ? seed.tags.split(',').map(t => t.trim()).filter(Boolean) : []
  const domain = seed?.domain || ''

  // Reset per-seed state when a different seed opens — otherwise the previous
  // seed's "find similar" results bleed into the next one
  useEffect(() => {
    setSearchResults([])
    setLoadingSearch(false)
    setConfirmDelete(false)
    setShowActions(false)
  }, [seed?.id, open])

  useEffect(() => {
    if (!open || !seed) return
    setLoadingLinks(true)
    const token = localStorage.getItem('greenplot_token')
    const searchQuery = domain || tags[0] || seed.title?.split(' ').slice(0, 3).join(' ') || ''
    if (!searchQuery) { setLoadingLinks(false); return }

    fetch(`/api/links?search=${encodeURIComponent(searchQuery)}&limit=5`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : { links: [] })
      .then(data => setRelatedLinks(data.links || []))
      .catch(() => setRelatedLinks([]))
      .finally(() => setLoadingLinks(false))
  }, [open, seed?.id])

  if (!seed) return null

  const entities = seed.entities ? seed.entities.split(',').map(e => e.trim()).filter(Boolean) : []
  const bodyText = seed.summary || seed.content || seed.text || ''
  const plantedAgo = timeAgo(seed.created_at || seed.created)
  const connectionCount = relatedLinks.length + searchResults.length
  const eyebrow = [seed.summary ? 'Sprouting' : 'Seed', domain].filter(Boolean).join(' · ')

  const handleDelete = async () => {
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
    setArchiving(true)
    const token = localStorage.getItem('greenplot_token')
    try {
      const res = await fetch(`/api/seeds/${seed.id}`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(data.archived ? 'Seed archived' : 'Seed restored')
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
      const token = localStorage.getItem('greenplot_token')
      const res = await fetch('/api/seeds/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ query: seed.title, limit: 6 }),
      })
      const data = await res.json()
      const self = seed.title.toLowerCase().trim()
      const titles = (data.seeds || [])
        .map((s: { title: string }) => s.title)
        .filter((t: string) => t && t.toLowerCase().trim() !== self)
        .slice(0, 5)
      setSearchResults(titles)
      if (titles.length === 0) toast.info('No related seeds found yet — plant more in this area')
    } catch {
      toast.error('Could not search related seeds')
    }
    setLoadingSearch(false)
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflowY: 'auto', zIndex: 50 }}>
      <DetailHero
        eyebrow={eyebrow}
        title={seed.title}
        onClose={() => onOpenChange(false)}
        right={
          <div style={{ position: 'relative' }}>
            <DetailHeroBtn name="more" onClick={() => setShowActions(p => !p)} />
            {showActions && (
              <div className="glass" style={{ position: 'absolute', top: 44, right: 0, borderRadius: 14, overflow: 'hidden', minWidth: 160, boxShadow: '0 8px 24px rgba(8,22,14,0.18)', background: 'rgba(255,255,255,0.96)', zIndex: 10 }}>
                <button onClick={() => { shareSeed(seed); setShowActions(false) }} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid var(--hairline)', textAlign: 'left' }}>
                  <Share2 size={16} color="var(--ink-2)" strokeWidth={1.75} />
                  <span className="ui" style={{ fontSize: 13.5, color: 'var(--ink)' }}>Share</span>
                </button>
                <button onClick={() => { exportSeedMd(seed); setShowActions(false) }} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid var(--hairline)', textAlign: 'left' }}>
                  <FileText size={16} color="var(--ink-2)" strokeWidth={1.75} />
                  <span className="ui" style={{ fontSize: 13.5, color: 'var(--ink)' }}>Export .md</span>
                </button>
                <button onClick={() => { handleArchive(); setShowActions(false) }} disabled={archiving} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid var(--hairline)', textAlign: 'left', opacity: archiving ? 0.5 : 1 }}>
                  <Archive size={16} color="var(--ink-2)" strokeWidth={1.75} />
                  <span className="ui" style={{ fontSize: 13.5, color: 'var(--ink)' }}>{archiving ? 'Archiving…' : 'Archive'}</span>
                </button>
                <button onClick={() => { handleDelete(); setShowActions(false) }} disabled={deleting} className="tap" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', opacity: deleting ? 0.5 : 1 }}>
                  <Trash2 size={16} color="rgba(212,80,62,0.9)" strokeWidth={1.75} />
                  <span className="ui" style={{ fontSize: 13.5, color: 'rgba(212,80,62,0.9)' }}>{confirmDelete ? 'Confirm delete?' : 'Delete'}</span>
                </button>
              </div>
            )}
          </div>
        }
      >
        {/* Meta chips in hero */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {connectionCount > 0 && (
            <div className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 11, padding: '7px 11px' }}>
              <Link2 size={13} color="#7ef0a8" strokeWidth={1.75} />
              <span className="ui" style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{connectionCount} connection{connectionCount !== 1 ? 's' : ''}</span>
            </div>
          )}
          {plantedAgo && (
            <div className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 11, padding: '7px 11px' }}>
              <Clock size={13} color="#7ef0a8" strokeWidth={1.75} />
              <span className="ui" style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Planted {plantedAgo}</span>
            </div>
          )}
          <div className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 11, padding: '7px 11px' }}>
            <Leaf size={13} color="#7ef0a8" strokeWidth={1.75} />
            <span className="ui" style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>Seed</span>
          </div>
        </div>
      </DetailHero>

      {/* Body content */}
      <div style={{ position: 'relative', zIndex: 3, marginTop: -16, padding: '0 18px 120px' }}>

        {/* Action row */}
        <div className="glass" style={{ borderRadius: 18, padding: 8, display: 'flex', gap: 8 }}>
          <button
            onClick={() => router.push('/garden?graph=1')}
            className="tap"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'var(--green-tint)', border: 'none', borderRadius: 13, padding: '11px 8px', cursor: 'pointer' }}
          >
            <Share2 size={18} color="var(--green-700)" strokeWidth={1.75} />
            <span className="ui" style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-deep)' }}>In graph</span>
          </button>
          <button
            onClick={() => router.push(`/chat?prompt=${encodeURIComponent(`Enrich my seed "${seed.title}" — search the web for the latest information, then update it with richer tags, domain context, and key insights.`)}`)}
            className="tap"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'var(--surface-sunk)', border: 'none', borderRadius: 13, padding: '11px 8px', cursor: 'pointer' }}
          >
            <Sparkles size={18} color="var(--ink-2)" strokeWidth={1.75} />
            <span className="ui" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>Enrich</span>
          </button>
          <button
            onClick={() => exportSeedMd(seed)}
            className="tap"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'var(--surface-sunk)', border: 'none', borderRadius: 13, padding: '11px 8px', cursor: 'pointer' }}
          >
            <Bookmark size={18} color="var(--ink-2)" strokeWidth={1.75} />
            <span className="ui" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>Save</span>
          </button>
          <button
            onClick={() => shareSeed(seed)}
            className="tap"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'var(--surface-sunk)', border: 'none', borderRadius: 13, padding: '11px 8px', cursor: 'pointer' }}
          >
            <Share2 size={18} color="var(--ink-2)" strokeWidth={1.75} />
            <span className="ui" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>Share</span>
          </button>
        </div>

        {/* Note body */}
        <div style={{ marginTop: 22 }}>
          <div className="caps" style={{ fontSize: 10.5, color: 'var(--green-700)', marginBottom: 9 }}>Captured thought</div>
          <p className="serif" style={{ fontSize: 21, lineHeight: 1.35, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            "{seed.title}"
          </p>
          {bodyText && (
            <p className="body-text" style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-2)', marginTop: 16 }}>
              {bodyText}
            </p>
          )}
        </div>

        {/* Tags & entities */}
        {(tags.length > 0 || entities.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 16 }}>
            {[...tags, ...entities].map((t, i) => (
              <span key={i} className="ui" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)', background: 'var(--surface-sunk)', borderRadius: 99, padding: '5px 11px', border: '1px solid var(--hairline)' }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Source URL */}
        {seed.url && (
          <a
            href={seed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="tap"
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 14px', background: 'var(--surface-sunk)', borderRadius: 12, border: '1px solid var(--hairline)', textDecoration: 'none' }}
          >
            <Globe size={14} color="var(--ink-3)" strokeWidth={1.75} />
            <span className="body-text" style={{ fontSize: 12, color: 'var(--ink-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seed.url}</span>
            <ChevronRight size={14} color="var(--ink-3)" strokeWidth={1.75} />
          </a>
        )}

        {/* Connections — from Sources links */}
        {(relatedLinks.length > 0 || searchResults.length > 0) && (
          <>
            <SectionHeader action="Open graph" onAction={() => router.push('/garden?graph=1')}>
              Connections · {connectionCount}
            </SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {relatedLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 14, padding: '12px 14px', textDecoration: 'none' }}
                >
                  <span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: 'var(--surface-sunk)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Globe size={17} color="var(--ink-3)" strokeWidth={1.75} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ui" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link.title}</div>
                    <div className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{link.domain}</div>
                  </div>
                  <span className="ui" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-3)', background: 'var(--surface-sunk)', borderRadius: 99, padding: '3px 9px' }}>Source</span>
                </a>
              ))}
              {searchResults.map((title, i) => (
                <div key={i} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 14, padding: '12px 14px' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Leaf size={17} color="var(--green-700)" strokeWidth={1.75} />
                  </span>
                  <span className="ui" style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{title}</span>
                  <span className="ui" style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--green-700)', background: 'var(--green-tint)', borderRadius: 99, padding: '3px 9px' }}>Seed</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Find connections button when empty */}
        {!loadingLinks && relatedLinks.length === 0 && searchResults.length === 0 && (
          <button
            onClick={handleWebSearch}
            disabled={loadingSearch}
            className="tap"
            style={{ marginTop: 22, width: '100%', display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface-sunk)', border: '1px solid var(--hairline)', borderRadius: 13, padding: '11px 16px', cursor: 'pointer' }}
          >
            <Search size={16} color="var(--ink-3)" strokeWidth={1.75} />
            <span className="ui" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
              {loadingSearch ? 'Finding connections…' : 'Find related seeds'}
            </span>
          </button>
        )}

        {/* Develop into spec */}
        <button
          onClick={() => {
            try {
              localStorage.setItem('greenplot_spec_prefill', JSON.stringify({
                id: seed.id, title: seed.title,
                content: seed.content || seed.text || seed.summary || '',
              }))
            } catch {}
            router.push('/chat?mode=spec')
          }}
          className="tap"
          style={{ marginTop: 22, width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--green-tint)', border: '1px solid var(--green-tint-2)', borderRadius: 14, padding: '13px 16px', cursor: 'pointer' }}
        >
          <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={18} color="#fff" strokeWidth={1.75} />
          </span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--green-deep)' }}>Develop into a spec</div>
            <div className="body-text" style={{ fontSize: 11.5, color: 'var(--green-700)', opacity: 0.8 }}>Turn this idea into a structured PRD</div>
          </div>
          <ChevronRight size={17} color="var(--green-700)" strokeWidth={1.75} />
        </button>

        {/* Grow into an article */}
        <button
          onClick={() => router.push(`/chat?prompt=${encodeURIComponent(`Write a comprehensive article about: ${seed.title}`)}`)}
          className="tap"
          style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--green)', border: 'none', borderRadius: 15, padding: '13px 16px', cursor: 'pointer', boxShadow: '0 8px 20px -8px rgba(34,197,94,0.7)' }}
        >
          <Plus size={19} color="#fff" strokeWidth={2} />
          <span className="ui" style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Grow into an article</span>
          <ChevronRight size={18} color="rgba(255,255,255,0.85)" strokeWidth={1.75} style={{ marginLeft: 'auto' }} />
        </button>

        {/* Metadata */}
        {(seed.created_at || seed.created) && (
          <div className="body-text" style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 24, opacity: 0.6 }}>
            Planted {new Date(seed.created_at || seed.created || '').toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  )
}
