'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Leaf, Link2, BookOpen, Sparkles, ChevronRight, Plus, Globe, ArrowLeft, Download, Share2 } from 'lucide-react'
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

function ArticleDetail({ article, onBack }: { article: Article; onBack: () => void }) {
  const handleDownload = () => {
    const blob = new Blob([`# ${article.title}\n\n${article.content}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${article.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
      {/* Minimal header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: 'rgba(250,249,246,0.92)', backdropFilter: 'blur(16px)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        borderBottom: '1px solid var(--hairline)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', height: 56 }}>
          <button onClick={onBack} className="tap" style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green-700)', fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 600 }}>
            <ArrowLeft size={18} strokeWidth={2} color="var(--green-700)" />
            Library
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={handleDownload} className="tap" style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-2)', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 600 }}>
            <Download size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div style={{ paddingTop: 'calc(56px + env(safe-area-inset-top, 0px))', paddingBottom: 100, padding: '0 18px' }}>
        <div style={{ paddingTop: 'calc(56px + env(safe-area-inset-top, 0px) + 24px)', paddingBottom: 100 }}>
          {article.category && (
            <Pill tone="soft" size="xs">{article.category.toUpperCase()}</Pill>
          )}
          <h1 className="serif" style={{ fontSize: 32, lineHeight: 1.1, color: 'var(--ink)', marginTop: 12, marginBottom: 16, letterSpacing: '-0.02em' }}>
            {article.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            {article.seed_count != null && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Leaf size={13} color="var(--green-700)" strokeWidth={1.75} />
                <span className="ui" style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 600 }}>{article.seed_count} seeds</span>
              </span>
            )}
            {article.updated_at && (
              <span className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>
                Updated {timeAgo(article.updated_at)}
              </span>
            )}
          </div>
          <div className="prose prose-sm max-w-none" style={{ fontFamily: 'var(--body)', fontSize: 15, lineHeight: 1.65, color: 'var(--ink)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.content || article.summary || ''}</ReactMarkdown>
          </div>
        </div>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 11 }}>
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

function SourcesList({ links, onPlant }: { links: LinkItem[]; onPlant: (id: string) => void }) {
  const unreadCount = links.filter(l => !l.garden_seed_id).length

  if (!links.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ink-3)' }}>
        <Link2 size={40} strokeWidth={1} color="var(--ink-3)" style={{ margin: '0 auto 12px' }} />
        <p className="ui" style={{ fontSize: 13, fontWeight: 600 }}>No sources yet</p>
        <p className="body-text" style={{ fontSize: 12, marginTop: 4 }}>Share a link to any page and it'll appear here</p>
      </div>
    )
  }

  return (
    <>
      <SectionHeader action="Add link">{unreadCount > 0 ? `${unreadCount} new to read` : 'Saved links'}</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {links.map((link) => {
          const isNew = !link.garden_seed_id
          return (
            <div key={link.id} className="v2-card tap" style={{ borderRadius: 15, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
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
      setArticles(rawArticles.map((a: any) => ({
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
      })))

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
    toast.loading('Compiling new articles…')
    try {
      const res = await fetch('/api/wiki/auto-compile', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) toast.success('New articles compiled!')
      else toast.error('Could not compile')
    } catch { toast.error('Could not compile') }
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
    return <ArticleDetail article={selectedArticle} onBack={() => setSelectedArticle(null)} />
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
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
      <div style={{ position: 'relative', zIndex: 3, marginTop: -22, padding: '0 18px', paddingBottom: 120 }}>
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
