'use client'

import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, Search, Loader2, Sparkles } from 'lucide-react'

// react-force-graph renders via Canvas — client-only (same as knowledge-graph)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

// --- Backend payload shapes (app/main.py POST /api/v1/context/retrieve) ---
interface ExpandNode {
  id: string
  title?: string
  summary?: string
  seed_type?: string
  domain?: string
}
interface ExpandRel {
  id?: string
  source: string
  target: string
  type?: string
  link_type?: string
  provenance?: string
}
interface Neo4jStatus {
  enabled: boolean
  available: boolean
  message: string
}
interface RetrieveResponse {
  status: string
  query: string
  mode: 'weaviate_start_neo4j_expand' | 'postgres_fallback' | string
  starts: { id: string; title: string }[]
  graph: { status?: string; nodes: ExpandNode[]; relationships: ExpandRel[]; hops?: number }
  neo4j: Neo4jStatus
  error?: string
}

// --- Force-graph view shapes ---
interface GNode {
  id: string
  title: string
  group: string
  isStart: boolean
  x?: number
  y?: number
}
interface GLink {
  source: string | GNode
  target: string | GNode
  provenance: string
}

const PALETTE = ['#22c55e', '#2dd4bf', '#7ef0a8', '#fbbf24', '#a78bfa', '#f472b6', '#60a5fa', '#fb923c', '#34d399', '#e879f9']
function groupColor(group: string): string {
  let h = 0
  for (let i = 0; i < group.length; i++) h = (h * 31 + group.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

interface ContextGraphProps {
  onClose: () => void
}

export default function ContextGraph({ onClose }: ContextGraphProps) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [resp, setResp] = useState<RetrieveResponse | null>(null)
  const [neo4j, setNeo4j] = useState<Neo4jStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dims, setDims] = useState({ w: 800, h: 600 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Neo4j status pill — fetched once on open, independent of any query
  useEffect(() => {
    const token = localStorage.getItem('greenplot_token')
    fetch('/api/graph/neo4j/status', { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setNeo4j(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current
      if (el) setDims({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [resp])

  const run = useCallback(async () => {
    const q = query.trim()
    if (q.length < 2 || loading) return
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('greenplot_token')
      const res = await fetch('/api/context/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ query: q, start_limit: 6, graph_hops: 2, context_limit: 80 }),
      })
      const data = (await res.json()) as RetrieveResponse
      if (!res.ok) {
        setError(data.error || 'Retrieval failed')
        setResp(null)
      } else {
        setResp(data)
        if (data.neo4j) setNeo4j(data.neo4j)
      }
    } catch {
      setError('Backend unreachable')
      setResp(null)
    } finally {
      setLoading(false)
    }
  }, [query, loading])

  const graphData = useMemo(() => {
    if (!resp?.graph) return { nodes: [] as GNode[], links: [] as GLink[] }
    const startIds = new Set(resp.starts?.map((s) => s.id) || [])
    const nodes: GNode[] = (resp.graph.nodes || []).map((n) => ({
      id: n.id,
      title: n.title || 'Untitled',
      group: (n.domain || 'untagged').trim() || 'untagged',
      isStart: startIds.has(n.id),
    }))
    const present = new Set(nodes.map((n) => n.id))
    const links: GLink[] = (resp.graph.relationships || [])
      .filter((r) => present.has(r.source) && present.has(r.target))
      .map((r) => ({ source: r.source, target: r.target, provenance: r.provenance || r.link_type || 'related' }))
    return { nodes, links }
  }, [resp])

  const isNeo4jMode = resp?.mode === 'weaviate_start_neo4j_expand'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 43,
        background: 'radial-gradient(90% 70% at 70% 12%, #133a28 0%, #0a2417 45%, #06140d 100%)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div style={{ paddingTop: 'max(52px, env(safe-area-inset-top, 0px))', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 10px', gap: 10 }}>
          <button
            onClick={onClose}
            className="glass-dark tap"
            style={{ width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <ArrowLeft size={18} color="rgba(255,255,255,0.9)" strokeWidth={1.75} />
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span className="caps" style={{ fontSize: 11, color: 'rgba(180,240,205,0.8)' }}>ASK THE GRAPH</span>
          </div>
          <div style={{ width: 38, flexShrink: 0 }} />
        </div>

        {/* Query bar */}
        <div style={{ padding: '0 16px', display: 'flex', gap: 8 }}>
          <div className="glass-dark" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12, padding: '0 12px' }}>
            <Search size={15} color="rgba(180,240,205,0.7)" strokeWidth={1.75} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') run() }}
              placeholder="Ask about a topic in your garden…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'rgba(255,255,255,0.92)', fontSize: 13.5, fontFamily: 'var(--ui)', height: 42 }}
            />
          </div>
          <button
            onClick={run}
            disabled={loading || query.trim().length < 2}
            className="tap"
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 12, padding: '0 14px', border: 'none', cursor: loading ? 'default' : 'pointer', background: 'linear-gradient(90deg, var(--green, #16a34a), #34d399)', color: '#04120b', fontFamily: 'var(--ui)', fontSize: 13, fontWeight: 700, opacity: query.trim().length < 2 ? 0.5 : 1 }}
          >
            {loading ? <Loader2 size={15} strokeWidth={2.2} className="animate-spin" /> : <Sparkles size={15} strokeWidth={2.2} />}
            Expand
          </button>
        </div>

        {/* Status row: retrieval mode badge + Neo4j pill */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px 0', justifyContent: 'center', flexWrap: 'wrap' }}>
          {resp && (
            <div className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 9999, padding: '4px 11px' }}>
              <div style={{ width: 7, height: 7, borderRadius: 99, background: isNeo4jMode ? '#34d399' : '#fbbf24' }} />
              <span className="ui" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.82)' }}>
                {isNeo4jMode ? 'Neo4j multi-hop expand' : 'Postgres fallback'}
                {typeof resp.graph?.hops === 'number' ? ` · ${resp.graph.hops} hops` : ''}
              </span>
            </div>
          )}
          {neo4j && (
            <div className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 9999, padding: '4px 11px' }}>
              <div style={{ width: 7, height: 7, borderRadius: 99, background: neo4j.enabled && neo4j.available ? '#34d399' : neo4j.enabled ? '#fbbf24' : '#6b7280' }} />
              <span className="ui" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.82)' }}>
                {neo4j.enabled && neo4j.available ? 'Graph index: Neo4j active' : neo4j.enabled ? 'Neo4j enabled · unreachable' : 'Graph index: off'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {loading ? (
          <Centered>
            <div style={{ width: 40, height: 40, borderRadius: 99, border: '2px solid rgba(34,197,94,0.4)', borderTopColor: '#22c55e', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <span className="ui" style={{ fontSize: 13, color: 'rgba(180,240,205,0.7)' }}>Tracing connections…</span>
          </Centered>
        ) : error ? (
          <Centered><span className="ui" style={{ fontSize: 13, color: 'rgba(255,180,180,0.85)' }}>{error}</span></Centered>
        ) : !resp ? (
          <Centered>
            <Sparkles size={42} strokeWidth={1} color="rgba(180,240,205,0.5)" style={{ margin: '0 auto 12px' }} />
            <span className="ui" style={{ fontSize: 13, color: 'rgba(180,240,205,0.7)' }}>Ask a question to expand the context graph around it</span>
          </Centered>
        ) : graphData.nodes.length === 0 ? (
          <Centered><span className="ui" style={{ fontSize: 13, color: 'rgba(180,240,205,0.7)' }}>No connected context found for that query yet</span></Centered>
        ) : (
          <ForceGraph2D
            width={dims.w}
            height={dims.h}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeLabel={(n) => (n as GNode).title}
            linkColor={() => 'rgba(126,240,168,0.28)'}
            linkWidth={1}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GNode
              const r = n.isStart ? 7 : 5
              ctx.beginPath()
              ctx.arc(n.x || 0, n.y || 0, r, 0, 2 * Math.PI)
              ctx.fillStyle = groupColor(n.group)
              ctx.fill()
              if (n.isStart) {
                ctx.lineWidth = 2 / globalScale
                ctx.strokeStyle = '#ffffff'
                ctx.stroke()
              }
              if (globalScale > 1.4 || n.isStart) {
                const label = n.title.length > 24 ? n.title.slice(0, 23) + '…' : n.title
                ctx.font = `${n.isStart ? 700 : 400} ${11 / globalScale}px var(--ui, sans-serif)`
                ctx.fillStyle = 'rgba(255,255,255,0.85)'
                ctx.textAlign = 'center'
                ctx.fillText(label, n.x || 0, (n.y || 0) + r + 9 / globalScale)
              }
            }}
          />
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ textAlign: 'center', maxWidth: 320, padding: '0 24px' }}>{children}</div>
    </div>
  )
}
