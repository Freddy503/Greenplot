'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Leaf, Link2, BookOpen, Sparkles, ChevronRight, Plus, Globe, ArrowLeft, Download, Share2, ArrowUp, GraduationCap, Loader2, Pencil, Printer } from 'lucide-react'
import { readCache } from '@/lib/swr-cache'
import DetailHero, { DetailHeroBtn } from '@/components/ui/v2/detail-hero'
import { toast } from 'sonner'

import Hero from '@/components/layout/hero'
import BottomNav from '@/components/layout/bottom-nav'
import Header from '@/components/layout/header'
import Segmented from '@/components/ui/v2/segmented'
import Pill from '@/components/ui/v2/pill'
import SectionHeader from '@/components/ui/v2/section-header'

// ── Types ─────────────────────────────────────────────

interface Article {
  id: string
  title: string
  content: string
  summary?: string
  category?: string
  tags?: string[]
  created_at?: string
  updated_at?: string
  seed_count?: number
  source_count?: number
  sourceSeedIds?: string[]
  sourceLinkIds?: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapArticles(raw: any[]): Article[] {
  return qualityGate(raw.map((a) => ({
    id: a.id || a.notion_id || '',
    title: a.title || 'Untitled',
    content: a.content || '',
    summary: a.summary || a.metadata?.summary || '',
    category: a.category || a.tags?.[0] || 'Article',
    tags: a.tags || [],
    created_at: a.created_at || a.created || '',
    updated_at: a.updated_at || a.created_at || '',
    seed_count: a.seed_count,
    source_count: a.source_count,
    sourceSeedIds: a.sourceSeedIds || [],
    sourceLinkIds: a.sourceLinkIds || [],
  })))
}

// Quality gate: the auto-compiler produces stubs and near-duplicates — only
// substantive articles belong in the Library. Dedupe by title, keep the longest.
function qualityGate(articles: Article[]): Article[] {
  const byTitle = new Map<string, Article>()
  for (const a of articles) {
    if ((a.content || '').length < 600) continue
    const key = (a.title || '').toLowerCase().trim()
    if (!key) continue
    const existing = byTitle.get(key)
    if (!existing || (a.content || '').length > (existing.content || '').length) {
      byTitle.set(key, a)
    }
  }
  return [...byTitle.values()]
}

interface LinkItem {
  id: string
  url: string
  title: string
  summary?: string
  domain: string
  addedAt: string
  starred?: boolean
  garden_seed_id?: string
}

// ── Helpers ───────────────────────────────────────────

function timeAgo(date: string): string {
  if (!date) return ''
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return 'link' }
}

// ── Article Detail ─────────────────────────────────────

function ArticleDetail({ article, links, onBack, onEdited }: { article: Article; links: LinkItem[]; onBack: () => void; onEdited?: (id: string, patch: Partial<Article>) => void }) {
  const router = useRouter()
  const [bookmarked, setBookmarked] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(article.title)
  const [content, setContent] = useState(article.content)
  const [editTitle, setEditTitle] = useState(article.title)
  const [editContent, setEditContent] = useState(article.content)
  const [saving, setSaving] = useState(false)

  // Resolve the sources this article was compiled from + its related seeds
  const sourceLinks = (article.sourceLinkIds || [])
    .map(id => links.find(l => l.id === id))
    .filter(Boolean) as LinkItem[]
  const seedCacheRaw = typeof window !== 'undefined' ? readCache<{ seeds?: { id?: string; title?: string }[] }>('seeds') : null
  const relatedSeeds = (article.sourceSeedIds || [])
    .map(id => (seedCacheRaw?.seeds || []).find(s => s.id === id))
    .filter((s): s is { id: string; title: string } => !!s?.id && !!s?.title)

  const handleDownload = () => {
    const blob = new Blob([`# ${title}\n\n${content}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    a.click(); URL.revokeObjectURL(url)
  }

  const saveEdits = async () => {
    const newTitle = editTitle.trim()
    const newContent = editContent.trim()
    if (!newTitle || !newContent || saving) return
    setSaving(true)
    try {
      const token = localStorage.getItem('greenplot_token')
      const res = await fetch(`/api/wiki/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ title: newTitle, content: newContent }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || data.error || 'Save failed')
      }
      setTitle(newTitle)
      setContent(newContent)
      onEdited?.(article.id, { title: newTitle, content: newContent })
      setEditing(false)
      toast.success('Article saved')
    } catch (e) {
      toast.error((e as Error).message || 'Could not save — backend update pending')
    } finally {
      setSaving(false)
    }
  }

  const eyebrow = [article.category || 'Article', 'Living article'].join(' · ')

  // Extract section headers and a first insight from markdown
  const contentLines = (content || article.summary || '').split('\n')
  const firstParagraph = contentLines.find(l => l.trim() && !l.startsWith('#')) || ''
  const sections = contentLines.filter(l => l.startsWith('## ') || l.startsWith('# ')).slice(0, 4)

  return (
    <div className="print-root" style={{ position: 'relative', background: 'var(--bg)', height: '100dvh', overflowY: 'auto', overflowX: 'hidden' }}>
      {/* Print-only title (the dark hero is hidden in print) */}
      <h1 className="hidden print:block serif" style={{ fontSize: 28, padding: '0 20px', marginTop: 16 }}>{title}</h1>
      <div className="print:hidden">
      <DetailHero
        tall
        eyebrow={eyebrow}
        title={title}
        onClose={onBack}
        right={
          <DetailHeroBtn
            name="bookmark"
            onClick={() => { setBookmarked(p => !p); handleDownload() }}
          />
        }
      >
        {/* Meta chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          {article.seed_count != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Leaf size={13} color="#7ef0a8" strokeWidth={1.75} />
              <span className="ui" style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(233,250,239,0.8)' }}>{article.seed_count} seeds</span>
            </span>
          )}
          {article.source_count != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Link2 size={13} color="#7ef0a8" strokeWidth={1.75} />
              <span className="ui" style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(233,250,239,0.8)' }}>{article.source_count} sources</span>
            </span>
          )}
          {article.updated_at && (
            <span className="body-text" style={{ fontSize: 11, color: 'rgba(233,250,239,0.6)', marginLeft: 'auto' }}>
              Updated {timeAgo(article.updated_at)}
            </span>
          )}
        </div>
        {/* Decorative leaf watermark */}
        <Leaf size={120} color="rgba(126,240,168,0.12)" style={{ position: 'absolute', right: -14, top: -4, zIndex: -1 }} />
      </DetailHero>
      </div>

      {/* Article body */}
      <div className="desk-narrow" style={{ position: 'relative', zIndex: 3, padding: '24px 20px 140px' }}>
        {/* Action bar — edit / export */}
        <div className="print:hidden" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); setEditTitle(title); setEditContent(content) }} className="tap ui" style={{ background: 'none', border: '1px solid var(--border-2)', borderRadius: 9999, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveEdits} disabled={saving} className="tap ui" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--green)', color: '#06281a', border: 'none', borderRadius: 9999, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save article'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="tap ui" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 9999, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}>
                <Pencil size={13} strokeWidth={1.75} /> Edit
              </button>
              <button onClick={() => window.print()} className="tap ui" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 9999, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}>
                <Printer size={13} strokeWidth={1.75} /> Export PDF
              </button>
            </>
          )}
        </div>

        {editing && (
          <>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="serif"
              style={{ width: '100%', fontSize: 26, lineHeight: 1.15, color: 'var(--ink)', marginBottom: 12, background: 'var(--surface-sunk)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '8px 14px', outline: 'none' }}
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
              style={{ width: '100%', minHeight: '60vh', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 1.7, color: 'var(--ink)', background: 'var(--surface-sunk)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '16px 18px', outline: 'none', resize: 'vertical' }}
            />
          </>
        )}

        {/* Lead paragraph — serif */}
        {!editing && firstParagraph && (
          <p className="serif" style={{ fontSize: 22, lineHeight: 1.4, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: 20 }}>
            {firstParagraph}
          </p>
        )}

        {/* Full article content */}
        <div
          className="prose prose-sm max-w-none"
          style={{ fontFamily: 'var(--body)', fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink-2)', display: editing ? 'none' : undefined }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h2 className="ui" style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginTop: 28, marginBottom: 10 }}>{children}</h2>
              ),
              h2: ({ children }) => (
                <h2 className="ui" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginTop: 26, marginBottom: 9 }}>{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="ui" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', marginTop: 20, marginBottom: 7 }}>{children}</h3>
              ),
              p: ({ children }) => (
                <p style={{ marginBottom: 14 }}>{children}</p>
              ),
              blockquote: ({ children }) => (
                <div className="glass" style={{ borderRadius: 18, padding: '18px 18px', margin: '20px 0', background: 'rgba(234,250,240,0.7)', borderLeft: '3px solid var(--green)' }}>
                  <div className="caps" style={{ fontSize: 10, color: 'var(--green-700)', marginBottom: 7 }}>Key insight</div>
                  <div className="serif" style={{ fontSize: 20, lineHeight: 1.4, color: 'var(--green-deep)' }}>{children}</div>
                </div>
              ),
            }}
          >
            {content || article.summary || ''}
          </ReactMarkdown>
        </div>

        {/* Sources & related seeds — what this article was compiled from */}
        {!editing && (sourceLinks.length > 0 || relatedSeeds.length > 0) && (
          <div style={{ marginTop: 28 }}>
            <div className="caps" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 10, letterSpacing: '0.08em' }}>Compiled from</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {sourceLinks.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="v2-card tap" style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 13, padding: '10px 13px', textDecoration: 'none' }}>
                  <Globe size={15} color="var(--ink-3)" strokeWidth={1.75} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ui" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title || l.url}</span>
                    <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{extractDomain(l.url)}</span>
                  </span>
                  <ArrowUp size={13} color="var(--green-700)" strokeWidth={2} style={{ transform: 'rotate(45deg)', flexShrink: 0 }} />
                </a>
              ))}
              {relatedSeeds.map((s) => (
                <a key={s.id} href={`/garden?seed=${encodeURIComponent(s.id)}`} className="v2-card tap" style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 13, padding: '10px 13px', textDecoration: 'none' }}>
                  <Leaf size={15} color="var(--green-700)" strokeWidth={1.75} style={{ flexShrink: 0 }} />
                  <span className="ui" style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                  <ChevronRight size={14} color="var(--ink-3)" strokeWidth={1.75} style={{ flexShrink: 0 }} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Tags as seed chips */}
        {article.tags && article.tags.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div className="caps" style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 10, letterSpacing: '0.08em' }}>Grown from</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {article.tags.map((tag, i) => (
                <button
                  key={i}
                  className="tap"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 99, padding: '8px 13px', cursor: 'pointer' }}
                >
                  <Leaf size={14} color="var(--green-700)" strokeWidth={1.75} />
                  <span className="ui" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{tag}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky "Ask about this article" bar */}
      <div className="print:hidden" style={{ position: 'sticky', left: 0, right: 0, bottom: 0, padding: '10px 16px 18px', zIndex: 6, background: 'linear-gradient(to top, var(--bg) 60%, transparent)' }}>
        <button
          onClick={() => router.push(`/chat?prompt=${encodeURIComponent(`Tell me more about the article: ${article.title}`)}`)}
          className="glass tap"
          style={{
            width: '100%', borderRadius: 18, padding: '12px 14px 12px 16px',
            display: 'flex', alignItems: 'center', gap: 11,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 10px 30px -10px rgba(20,30,20,0.3)',
          }}
        >
          <Sparkles size={19} color="var(--green-700)" strokeWidth={1.75} />
          <span className="body-text" style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--ink-3)' }}>
            Ask about this article…
          </span>
          <span
            className="tap"
            style={{ width: 38, height: 38, borderRadius: 99, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <ArrowUp size={19} color="#fff" strokeWidth={2} />
          </span>
        </button>
      </div>
    </div>
  )
}

// ── Plants tab ─────────────────────────────────────────

function PlantsList({ articles, onSelect, onCompile }: { articles: Article[]; onSelect: (a: Article) => void; onCompile: () => void }) {
  const [featured, ...rest] = articles

  if (!featured) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
        <BookOpen size={40} strokeWidth={1} color="var(--ink-3)" style={{ margin: '0 auto 12px' }} />
        <p className="ui" style={{ fontSize: 13, fontWeight: 600 }}>No plants yet</p>
        <p className="body-text" style={{ fontSize: 12, marginTop: 4 }}>Seeds grow into articles as they're enriched</p>
        <button onClick={onCompile} className="tap" style={{ marginTop: 16, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 9999, padding: '10px 20px', fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 600 }}>
          Compile now
        </button>
      </div>
    )
  }

  return (
    <>
      <SectionHeader action="Compile" onAction={onCompile}>Recently grown</SectionHeader>

      {/* Featured plant */}
      <div onClick={() => onSelect(featured)} className="glass tap rise" style={{ borderRadius: 22, overflow: 'hidden', cursor: 'pointer' }}>
        <div style={{
          height: 120,
          background: 'linear-gradient(150deg, #15573a, #0d3a25)',
          position: 'relative', display: 'flex', alignItems: 'flex-end', padding: 14,
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 100% at 85% 0%, rgba(34,197,94,0.35), transparent 60%)' }} />
          <div style={{ position: 'relative' }}>
            <Pill tone="soft" size="xs">{(featured.category || 'ARTICLE').toUpperCase()}</Pill>
          </div>
          <Leaf size={64} color="rgba(126,240,168,0.22)" strokeWidth={0.8} style={{ position: 'absolute', right: 14, top: 18 }} />
        </div>
        <div style={{ padding: '14px 16px 16px' }}>
          <h3 className="serif" style={{ fontSize: 23, lineHeight: 1.12, color: 'var(--ink)' }}>{featured.title}</h3>
          <p className="body-text" style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginTop: 7 }}>
            {featured.summary || featured.content?.slice(0, 140)}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
            {featured.seed_count != null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Leaf size={13} color="var(--green-700)" strokeWidth={1.75} />
                <span className="ui" style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600 }}>{featured.seed_count} seeds</span>
              </span>
            )}
            {featured.source_count != null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Link2 size={13} color="var(--ink-3)" strokeWidth={1.75} />
                <span className="ui" style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600 }}>{featured.source_count} sources</span>
              </span>
            )}
            {featured.updated_at && (
              <span className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>
                Updated {timeAgo(featured.updated_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Rest of articles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 9, marginTop: 11 }}>
        {rest.map((article) => (
          <div key={article.id} onClick={() => onSelect(article)} className="v2-card tap" style={{ borderRadius: 16, padding: 14, display: 'flex', gap: 13, cursor: 'pointer' }}>
            <span style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={21} color="var(--green-700)" strokeWidth={1.75} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: 5 }}>
                <Pill tone="neutral" size="xs">{(article.category || 'Article').toUpperCase()}</Pill>
              </div>
              <div className="ui" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.25 }}>{article.title}</div>
              <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5, marginTop: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {article.summary || article.content?.slice(0, 100)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                {article.seed_count != null && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Leaf size={12} color="var(--green-700)" strokeWidth={1.75} />
                    <span className="ui" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{article.seed_count}</span>
                  </span>
                )}
                <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginLeft: 'auto' }}>
                  {timeAgo(article.updated_at || article.created_at || '')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Sources tab ───────────────────────────────────────

// Ingest a research paper (arXiv link/id from the Academic Digest) as a paper seed
function PaperIngestCard() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const plant = async () => {
    const input = value.trim()
    if (!input || busy) return
    setBusy(true)
    try {
      const token = localStorage.getItem('greenplot_token')
      const isUrl = input.startsWith('http')
      const res = await fetch('/api/papers/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(isUrl ? { url: input } : { arxiv_id: input }),
      })
      const data = await res.json()
      if (res.ok) {
        setValue('')
        toast.success(`"${data.title}" planted in your garden`, {
          action: { label: 'View', onClick: () => router.push('/garden') },
        })
      } else {
        toast.error(data.detail || data.error || 'Could not ingest paper')
      }
    } catch {
      toast.error('Could not ingest paper')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass" style={{ borderRadius: 18, padding: '14px 15px', marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <GraduationCap size={18} color="var(--green-700)" strokeWidth={1.75} />
        </span>
        <div>
          <div className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Plant a research paper</div>
          <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Paste an arXiv link or ID from your Research Digest</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') plant() }}
          placeholder="arxiv.org/abs/2406.01234 or 2406.01234"
          style={{ flex: 1, minWidth: 0, border: '1px solid var(--border-2)', borderRadius: 12, padding: '9px 12px', fontFamily: 'var(--body)', fontSize: 12.5, color: 'var(--ink)', background: 'var(--surface)', outline: 'none' }}
        />
        <button
          onClick={plant}
          disabled={busy || !value.trim()}
          className="tap"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--green)', color: '#06281a', border: 'none', borderRadius: 12, padding: '9px 14px', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: busy || !value.trim() ? 0.6 : 1, flexShrink: 0 }}
        >
          {busy ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : <Plus size={14} strokeWidth={2.25} />}
          {busy ? 'Planting…' : 'Plant'}
        </button>
      </div>
    </div>
  )
}

function SourcesList({ links, onPlant }: { links: LinkItem[]; onPlant: (id: string) => void }) {
  const unreadCount = links.filter(l => !l.garden_seed_id).length

  if (!links.length) {
    return (
      <>
        <PaperIngestCard />
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
          <Link2 size={40} strokeWidth={1} color="var(--ink-3)" style={{ margin: '0 auto 12px' }} />
          <p className="ui" style={{ fontSize: 13, fontWeight: 600 }}>No sources yet</p>
          <p className="body-text" style={{ fontSize: 12, marginTop: 4 }}>Share a link to any page and it'll appear here</p>
        </div>
      </>
    )
  }

  return (
    <>
      <PaperIngestCard />
      <SectionHeader action="Add link">{unreadCount > 0 ? `${unreadCount} new to read` : 'Saved links'}</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 9 }}>
        {links.map((link) => {
          const isNew = !link.garden_seed_id
          return (
            <div
              key={link.id}
              className="v2-card tap"
              onClick={() => { if (link.url) window.open(link.url, '_blank', 'noopener,noreferrer') }}
              style={{ borderRadius: 15, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
            >
              <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: 'var(--surface-sunk)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Globe size={18} color="var(--ink-3)" strokeWidth={1.75} />
                {isNew && (
                  <span style={{ position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: 99, background: 'var(--green)', boxShadow: '0 0 0 2px var(--surface)' }} />
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ui" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {link.title || link.url}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                  <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{extractDomain(link.url)}</span>
                  <span style={{ width: 3, height: 3, borderRadius: 99, background: 'var(--border-2)' }} />
                  <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{timeAgo(link.addedAt)}</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onPlant(link.id) }}
                className="tap"
                style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                title="Plant as seed"
              >
                <Plus size={17} color="var(--green-700)" strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────

export default function LibraryPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'plants' | 'sources'>('plants')
  const [articles, setArticles] = useState<Article[]>([])
  const [links, setLinks] = useState<LinkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)

  useEffect(() => {
    // Read tab from URL
    const params = new URLSearchParams(window.location.search)
    const t = params.get('tab')
    if (t === 'sources') setTab('sources')

    const token = localStorage.getItem('greenplot_token')
    if (!token) { router.push('/login'); return }
    const headers = { Authorization: `Bearer ${token}` }

    // Fetch both in parallel
    Promise.all([
      fetch('/api/wiki', { headers }).then(r => r.ok ? r.json() : { articles: [] }),
      fetch('/api/links?limit=100', { headers }).then(r => r.ok ? r.json() : { links: [] }),
    ]).then(([wikiData, linksData]) => {
      const rawArticles = wikiData.articles || []
      setArticles(mapArticles(rawArticles))

      const rawLinks = linksData.links || linksData || []
      setLinks(rawLinks.map((l: any) => ({
        id: l.id || '',
        url: l.url || '',
        title: l.title || l.url || '',
        summary: l.summary || '',
        domain: l.domain || (l.url ? new URL(l.url).hostname.replace('www.', '') : ''),
        addedAt: l.created_at || l.created || l.addedAt || '',
        starred: l.starred || false,
        garden_seed_id: l.garden_seed_id,
      })))

      // Cache articles
      if (rawArticles.length > 0) {
        localStorage.setItem('greenplot_wiki', JSON.stringify(rawArticles))
      }
    }).catch(() => {
      // Try localStorage fallback
      const cached = localStorage.getItem('greenplot_wiki')
      if (cached) {
        try { setArticles(JSON.parse(cached)) } catch {}
      }
    }).finally(() => setLoading(false))
  }, [router])

  const handleCompile = async () => {
    const token = localStorage.getItem('greenplot_token')
    const id = toast.loading('Compiling new articles…')
    try {
      const res = await fetch('/api/wiki/auto-compile', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success('New articles compiled!', { id })
        // Re-fetch articles so the list updates without a page reload
        fetch('/api/wiki', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : { articles: [] })
          .then(wikiData => {
            const rawArticles = wikiData.articles || []
            setArticles(mapArticles(rawArticles))
            if (rawArticles.length > 0) localStorage.setItem('greenplot_wiki', JSON.stringify(rawArticles))
          }).catch(() => {})
      } else {
        toast.error('Could not compile', { id })
      }
    } catch { toast.error('Could not compile', { id }) }
  }

  const handlePlant = async (linkId: string) => {
    const token = localStorage.getItem('greenplot_token')
    toast.loading('Saving to garden…')
    try {
      const res = await fetch(`/api/links/${linkId}/create-seed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success('Saved to garden!')
        setLinks(prev => prev.map(l => l.id === linkId ? { ...l, garden_seed_id: 'planted' } : l))
      } else {
        toast.error('Could not save')
      }
    } catch { toast.error('Could not save') }
  }

  if (selectedArticle) {
    return (
      <ArticleDetail
        article={selectedArticle}
        links={links}
        onBack={() => setSelectedArticle(null)}
        onEdited={(id, patch) => {
          setArticles(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
          setSelectedArticle(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev))
        }}
      />
    )
  }

  return (
    <div style={{ background: 'var(--bg)', height: '100dvh', overflowY: 'auto', overflowX: 'hidden' }}>
      <Header />

      <Hero
        eyebrow="SOURCES IN · ARTICLES OUT"
        title={<>Your</>}
        accent="Library"
        subtitle={tab === 'plants'
          ? 'Living articles your garden compiled from seeds and sources.'
          : 'Everything you saved to read — ready to plant as seeds.'}
      >
        <div style={{ marginTop: 18 }}>
          <Segmented
            dark
            value={tab}
            onChange={(k) => setTab(k as 'plants' | 'sources')}
            items={[
              { key: 'plants', label: 'Plants', Icon: BookOpen },
              { key: 'sources', label: 'Sources', Icon: Link2 },
            ]}
          />
        </div>
      </Hero>

      {/* Workspace */}
      <div className="desk-wrap" style={{ position: 'relative', zIndex: 3, marginTop: -22, padding: '0 18px', paddingBottom: 120 }}>
        {/* Ask your garden */}
        <button
          onClick={() => router.push('/chat')}
          className="glass tap"
          style={{ width: '100%', borderRadius: 18, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, cursor: 'pointer', border: 'none', marginBottom: 0 }}
        >
          <span style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={18} color="var(--green-700)" strokeWidth={1.75} />
          </span>
          <span style={{ textAlign: 'left', flex: 1 }}>
            <span className="ui" style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Ask your garden</span>
            <span className="body-text" style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-2)' }}>Answers grounded in your knowledge</span>
          </span>
          <ChevronRight size={18} color="var(--ink-3)" strokeWidth={1.75} />
        </button>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, borderRadius: 99, border: '2px solid var(--green-tint-2)', borderTopColor: 'var(--green)', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          </div>
        ) : tab === 'plants' ? (
          <PlantsList articles={articles} onSelect={setSelectedArticle} onCompile={handleCompile} />
        ) : (
          <SourcesList links={links} onPlant={handlePlant} />
        )}
      </div>

      <BottomNav />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
