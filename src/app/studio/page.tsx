'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { Sparkles, Target, Swords, FileText, Leaf, Pencil, ArrowLeft, Download, Copy, BookOpen, Trash2 } from 'lucide-react'

import Hero from '@/components/layout/hero'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import Pill from '@/components/ui/v2/pill'
import SectionHeader from '@/components/ui/v2/section-header'
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
    content, createdAt: s.created_at || s.created || new Date().toISOString(), source: 'garden',
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
  } catch { return [] }
}

// Lucide icon mapped to mode id
const MODE_ICONS: Record<string, React.ComponentType<any>> = {
  brainstorm: Sparkles,
  challenge: Target,
  strategize: Swords,
  spec: FileText,
}

// ── PRD Detail ────────────────────────────────────────

function PRDDetail({ prd, onBack, onDeleted }: { prd: PRDItem; onBack: () => void; onDeleted: (id: string) => void }) {
  const copyForAgent = () => {
    const framed = `# ${prd.title}\n\n${prd.content}\n\n---\nUse this PRD as the spec for the task I'm about to describe. Implement it faithfully, asking before making scope decisions not covered above.`
    navigator.clipboard.writeText(framed)
    toast.success('Copied — paste into Claude Code')
  }

  const downloadMd = () => {
    const blob = new Blob([`# ${prd.title}\n\n${prd.content}\n`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${prd.title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 60)}.md`
    a.click(); URL.revokeObjectURL(url)
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
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
      {/* Minimal header */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(250,249,246,0.92)', backdropFilter: 'blur(16px)', paddingTop: 'env(safe-area-inset-top, 0px)', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', height: 56 }}>
          <button onClick={onBack} className="tap" style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green-700)', fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <ArrowLeft size={18} strokeWidth={2} color="var(--green-700)" /> Studio
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={copyForAgent} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--green-tint)', color: 'var(--green-700)', border: 'none', borderRadius: 9999, padding: '7px 13px', fontFamily: 'var(--ui)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <Copy size={13} strokeWidth={2} /> Copy for Claude Code
          </button>
          <button onClick={downloadMd} className="tap" style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}>
            <Download size={16} strokeWidth={1.75} color="var(--ink-2)" />
          </button>
          {prd.local && (
            <button onClick={deleteLocal} className="tap" style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}>
              <Trash2 size={16} strokeWidth={1.75} color="var(--red)" />
            </button>
          )}
        </div>
      </div>

      <div style={{ paddingTop: 'calc(56px + env(safe-area-inset-top, 0px) + 24px)', paddingBottom: 100, padding: '0 18px' }}>
        <div style={{ paddingTop: 'calc(56px + env(safe-area-inset-top, 0px) + 24px)' }}>
          <Pill tone="soft" size="xs">SPEC</Pill>
          <h1 className="serif" style={{ fontSize: 32, lineHeight: 1.1, color: 'var(--ink)', marginTop: 12, marginBottom: 8, letterSpacing: '-0.02em' }}>{prd.title}</h1>
          <p className="body-text" style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 24 }}>
            {prd.local ? 'Saved from Spec mode' : 'From your garden'} · {timeAgo(prd.createdAt)}
          </p>
          <div className="glass" style={{ borderRadius: 20, padding: '20px 24px' }}>
            <div className="prose prose-sm max-w-none" style={{ fontFamily: 'var(--body)', fontSize: 15, lineHeight: 1.65, color: 'var(--ink)' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{prd.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
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

  const launchMode = useCallback((id: string) => router.push(`/chat?mode=${id}`), [router])

  const developSeed = useCallback((seed: RawSeed) => {
    try {
      localStorage.setItem('greenplot_spec_prefill', JSON.stringify({
        id: seed.id, title: seed.title,
        content: seed.content || seed.text || seed.summary || '',
      }))
    } catch {}
    router.push('/chat?mode=spec')
  }, [router])

  useEffect(() => {
    const local = loadLocalPRDs()
    setPrds(local)

    const token = localStorage.getItem('greenplot_token')
    fetch('/api/seeds?limit=200', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        if (r.status === 401) { localStorage.removeItem('greenplot_token'); window.location.href = '/login'; return { seeds: [] } }
        return r.json()
      })
      .then((data: { seeds?: RawSeed[] }) => {
        const seeds = data.seeds || []
        const specSeeds = seeds.filter(isSpecSeed).map(seedToPRD)
        const seen = new Set(local.map(p => p.id))
        setPrds([...local, ...specSeeds.filter(p => !seen.has(p.id))])
        setIdeas(seeds.filter(s => !isSpecSeed(s) && (s.content || s.text || s.summary)).slice(0, 4))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleDeleted = (id: string) => { setPrds(prev => prev.filter(p => p.id !== id)); setSelected(null) }

  if (selected) {
    return <PRDDetail prd={selected} onBack={() => setSelected(null)} onDeleted={handleDeleted} />
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
      <Header />

      <Hero
        eyebrow="YOUR THINKING PARTNER"
        title="The"
        accent="Studio"
        subtitle="Brainstorm, pressure-test, and spec ideas into PRDs you can hand to Claude Code."
      />

      <div style={{ position: 'relative', zIndex: 3, marginTop: -22, padding: '0 18px', paddingBottom: 120 }}>
        <SectionHeader>Thinking partner</SectionHeader>

        {/* 2×2 mode grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          {THINKING_MODES.map((mode) => {
            const ModeIcon = MODE_ICONS[mode.id] || Sparkles
            return (
              <button
                key={mode.id}
                onClick={() => launchMode(mode.id)}
                className="v2-card tap rise"
                style={{ textAlign: 'left', borderRadius: 18, padding: 15, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 9, border: 'none' }}
              >
                <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ModeIcon size={20} color="var(--green-700)" strokeWidth={1.75} />
                </span>
                <span className="ui" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{mode.label}</span>
                <span className="body-text" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>{mode.blurb}</span>
              </button>
            )
          })}
        </div>

        {/* Deep Dive — full width 5th card */}
        <button
          onClick={() => router.push('/explain')}
          className="v2-card tap"
          style={{ width: '100%', textAlign: 'left', borderRadius: 18, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13, border: 'none', marginTop: 11 }}
        >
          <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={20} color="var(--green-700)" strokeWidth={1.75} />
          </span>
          <div>
            <div className="ui" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Deep Dive</div>
            <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2 }}>Structured tutoring grounded in your garden.</div>
          </div>
        </button>

        {/* Ideas ready to develop */}
        {ideas.length > 0 && (
          <>
            <SectionHeader action="See all" onAction={() => router.push('/garden')}>Ideas ready to develop</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {ideas.map((seed) => (
                <div key={seed.id || seed.notion_id} className="v2-card" style={{ borderRadius: 15, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Leaf size={18} color="var(--green-700)" strokeWidth={1.75} />
                  <span className="ui" style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {seed.title || 'Untitled'}
                  </span>
                  <button
                    onClick={() => developSeed(seed)}
                    className="tap ui"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--green-tint)', color: 'var(--green-700)', border: 'none', borderRadius: 99, padding: '7px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Pencil size={13} color="var(--green-700)" strokeWidth={2} /> Spec it
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* PRDs & Specs */}
        <SectionHeader action="New spec" onAction={() => router.push('/chat?mode=spec')}>PRDs &amp; specs</SectionHeader>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {[1,2].map(i => <div key={i} style={{ height: 80, borderRadius: 16, background: 'var(--surface-sunk)', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
          </div>
        ) : prds.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink-3)' }}>
            <FileText size={36} strokeWidth={1} color="var(--ink-3)" style={{ margin: '0 auto 10px' }} />
            <p className="ui" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>No specs yet</p>
            <p className="body-text" style={{ fontSize: 12, marginTop: 4 }}>Use "Spec it" mode to build a structured PRD</p>
            <button onClick={() => router.push('/chat?mode=spec')} className="tap" style={{ marginTop: 14, background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 9999, padding: '10px 20px', fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Start speccing
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {prds.map((prd) => (
              <div key={prd.id} onClick={() => setSelected(prd)} className="v2-card tap" style={{ borderRadius: 16, padding: 14, display: 'flex', gap: 12, cursor: 'pointer' }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={19} color="var(--green-700)" strokeWidth={1.75} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{prd.title}</div>
                  <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5, marginTop: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {prd.content.replace(/^#+\s.*/gm, '').slice(0, 120)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <Pill tone="soft" size="xs">SPEC</Pill>
                    <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{timeAgo(prd.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }`}</style>
    </div>
  )
}
