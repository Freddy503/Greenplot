'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, X } from 'lucide-react'

// react-force-graph renders via Canvas/WebGL — client-only
// (decision + UX rules: docs/specs/knowledge-graph-v2.md)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

interface GraphNode {
  id: string
  title: string
  group: string
  size: number
  seedType?: string
  x?: number
  y?: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: 'explicit' | 'semantic' | 'hierarchy' | 'derived'
  strength?: number
  linkType?: string
}

interface KnowledgeGraphProps {
  onClose: () => void
}

// Stable palette — group (domain) → color
const PALETTE = ['#22c55e', '#2dd4bf', '#7ef0a8', '#fbbf24', '#a78bfa', '#f472b6', '#60a5fa', '#fb923c', '#34d399', '#e879f9']
function groupColor(group: string): string {
  let h = 0
  for (let i = 0; i < group.length; i++) h = (h * 31 + group.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const nodeId = (v: string | GraphNode) => (typeof v === 'string' ? v : v.id)

export default function KnowledgeGraph({ onClose }: KnowledgeGraphProps) {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [hoverNode, setHoverNode] = useState<GraphNode | null>(null)
  const [dims, setDims] = useState({ w: 800, h: 600 })
  const containerRef = useRef<HTMLDivElement>(null)

  // 1st-degree neighborhood of the hovered node — everything else dims
  const neighborhood = useMemo(() => {
    if (!hoverNode) return null
    const set = new Set<string>([hoverNode.id])
    for (const l of links) {
      const s = nodeId(l.source), t = nodeId(l.target)
      if (s === hoverNode.id) set.add(t)
      if (t === hoverNode.id) set.add(s)
    }
    return set
  }, [hoverNode, links])

  const degreeOf = useCallback((id: string) => links.reduce((n, l) => n + (nodeId(l.source) === id || nodeId(l.target) === id ? 1 : 0), 0), [links])

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current
      if (el) setDims({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('greenplot_token')
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined

    const load = async () => {
      try {
        // Dual-edge endpoint (explicit + semantic)
        const res = await fetch('/api/graph', { headers })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.nodes) && data.nodes.length > 0) {
            setNodes(data.nodes)
            setLinks(data.links || [])
            return
          }
        }
        // Fallback while the backend update is pending: old multi-signal route
        const seedsRes = await fetch('/api/seeds?limit=200', { headers })
        const seedsData = seedsRes.ok ? await seedsRes.json() : { seeds: [] }
        const seeds = (seedsData.seeds || []).map((s: { id: string; title?: string; content?: string; domain?: string; seed_metadata?: { domain?: string } }) => ({
          id: s.id, title: s.title || 'Untitled', text: (s.content || '').slice(0, 400),
          domain: s.domain || s.seed_metadata?.domain || '',
        }))
        if (seeds.length === 0) return
        const graphRes = await fetch('/api/seeds/graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(headers || {}) },
          body: JSON.stringify({ seeds }),
        })
        const graph = graphRes.ok ? await graphRes.json() : { links: [] }
        const rawLinks = (graph.links || []) as { source: string; target: string; strength?: number; linkType?: string }[]
        const deg = new Map<string, number>()
        for (const l of rawLinks) {
          deg.set(l.source, (deg.get(l.source) || 0) + 1)
          deg.set(l.target, (deg.get(l.target) || 0) + 1)
        }
        setNodes(seeds.map((s: { id: string; title: string; domain: string }) => ({
          id: s.id, title: s.title, group: s.domain || 'untagged',
          size: Math.min(6 + 2 * (deg.get(s.id) || 0), 22),
        })))
        setLinks(rawLinks.map(l => ({
          source: l.source, target: l.target,
          type: (l.linkType && l.linkType !== 'similar' ? 'explicit' : 'semantic') as 'explicit' | 'semantic',
          strength: l.strength, linkType: l.linkType,
        })))
      } catch {
        // leave empty — empty-state UI handles it
      } finally {
        setLoading(false)
      }
    }
    load().finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => [...new Set(nodes.map(n => n.group))].slice(0, 6), [nodes])
  const graphData = useMemo(() => ({ nodes, links }), [nodes, links])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 42,
        background: 'radial-gradient(90% 70% at 70% 12%, #133a28 0%, #0a2417 45%, #06140d 100%)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div style={{ paddingTop: 'max(52px, env(safe-area-inset-top, 0px))', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 12px', gap: 10 }}>
          <button
            onClick={onClose}
            className="glass-dark tap"
            style={{ width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, pointerEvents: 'auto' }}
          >
            <ArrowLeft size={18} color="rgba(255,255,255,0.9)" strokeWidth={1.75} />
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span className="caps" style={{ fontSize: 11, color: 'rgba(180,240,205,0.8)' }}>KNOWLEDGE GRAPH</span>
          </div>
          <div style={{ width: 38, flexShrink: 0 }} />
        </div>

        {/* Legend: edge types + top groups */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <div className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 9999, padding: '4px 10px' }}>
            <div style={{ width: 16, height: 2, background: 'rgba(126,240,168,0.9)' }} />
            <span className="ui" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)' }}>Your links</span>
          </div>
          <div className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 9999, padding: '4px 10px' }}>
            <div style={{ width: 16, height: 2, background: 'repeating-linear-gradient(90deg, rgba(45,212,191,0.8) 0 3px, transparent 3px 6px)' }} />
            <span className="ui" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)' }}>AI similarity</span>
          </div>
          {groups.map(g => (
            <div key={g} className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 9999, padding: '4px 10px' }}>
              <div style={{ width: 8, height: 8, borderRadius: 99, background: groupColor(g) }} />
              <span className="ui" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)' }}>{g}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 99, border: '2px solid rgba(34,197,94,0.4)', borderTopColor: '#22c55e', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <span className="ui" style={{ fontSize: 13, color: 'rgba(180,240,205,0.7)' }}>Growing your graph…</span>
            </div>
          </div>
        ) : nodes.length > 0 ? (
          <ForceGraph2D
            width={dims.w}
            height={dims.h}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeLabel={(n) => `${(n as GraphNode).title} · ${degreeOf((n as GraphNode).id)} connection${degreeOf((n as GraphNode).id) === 1 ? '' : 's'}`}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GraphNode
              const dimmed = neighborhood ? !neighborhood.has(n.id) : false
              const r = (n.size || 8) / 2 + 2
              ctx.globalAlpha = dimmed ? 0.12 : 1
              ctx.beginPath()
              ctx.arc(n.x || 0, n.y || 0, r, 0, 2 * Math.PI)
              ctx.fillStyle = groupColor(n.group || 'untagged')
              ctx.fill()
              if (n.seedType === 'paper' || n.seedType === 'spec') {
                ctx.lineWidth = 1.5 / globalScale
                ctx.strokeStyle = '#fff'
                ctx.stroke()
              }
              if (n.seedType === 'product') {
                ctx.lineWidth = 2.5 / globalScale
                ctx.strokeStyle = '#fff'
                ctx.stroke()
                ctx.beginPath()
                ctx.arc(n.x || 0, n.y || 0, r + 4 / globalScale, 0, 2 * Math.PI)
                ctx.lineWidth = 1 / globalScale
                ctx.strokeStyle = 'rgba(255,255,255,0.4)'
                ctx.stroke()
              }
              if (n.seedType === 'pillar') {
                ctx.lineWidth = 1 / globalScale
                ctx.strokeStyle = 'rgba(255,255,255,0.6)'
                ctx.stroke()
              }
              // Labels appear once zoomed in (or for hubs)
              if (globalScale > 1.4 || r > 8 || n.seedType === 'product' || n.seedType === 'pillar') {
                ctx.font = `${Math.max(11 / globalScale, 2.5)}px Sora, sans-serif`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'top'
                ctx.fillStyle = dimmed ? 'rgba(233,250,239,0.15)' : 'rgba(233,250,239,0.85)'
                ctx.fillText(n.title.length > 24 ? n.title.slice(0, 23) + '…' : n.title, n.x || 0, (n.y || 0) + r + 2)
              }
              ctx.globalAlpha = 1
            }}
            linkColor={(l) => {
              const link = l as GraphLink
              const dimmed = neighborhood
                ? !(neighborhood.has(nodeId(link.source)) && neighborhood.has(nodeId(link.target)))
                : false
              if (dimmed) return 'rgba(255,255,255,0.04)'
              if (link.type === 'hierarchy') return 'rgba(255,255,255,0.6)'
              if (link.type === 'derived') return 'rgba(167,139,250,0.45)'
              return link.type === 'explicit' ? 'rgba(126,240,168,0.85)' : 'rgba(45,212,191,0.4)'
            }}
            linkWidth={(l) => { const t = (l as GraphLink).type; return t === 'hierarchy' ? 2.5 : t === 'explicit' ? 2 : 1 }}
            linkLineDash={(l) => { const t = (l as GraphLink).type; return t === 'semantic' ? [4, 3] : t === 'derived' ? [2, 3] : null }}
            onNodeHover={(n) => setHoverNode((n as GraphNode) || null)}
            onNodeClick={(n) => setSelected(n as GraphNode)}
            onBackgroundClick={() => setSelected(null)}
            cooldownTicks={120}
            d3VelocityDecay={0.3}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', padding: '0 40px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
              <p className="serif" style={{ fontSize: 22, color: '#fff', marginBottom: 8 }}>Garden is empty</p>
              <p className="body-text" style={{ fontSize: 13, color: 'rgba(180,240,205,0.6)' }}>Plant your first idea in Chat</p>
            </div>
          </div>
        )}
      </div>

      {/* Selected node detail card */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 20px) + 24px)', left: 16, right: 16, zIndex: 10 }}>
          <div className="glass-dark" style={{ borderRadius: 22, padding: '16px 18px', maxWidth: 480, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 99, background: groupColor(selected.group || 'untagged') }} />
                  <span className="caps" style={{ fontSize: 9.5, color: 'rgba(180,240,205,0.7)' }}>
                    {(selected.seedType || 'seed').toUpperCase()}{selected.group && selected.group !== 'untagged' ? ` · ${selected.group}` : ''}
                  </span>
                </div>
                <h3 className="serif" style={{ fontSize: 22, color: '#fff', lineHeight: 1.1, margin: 0 }}>{selected.title}</h3>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                <X size={16} color="rgba(255,255,255,0.5)" strokeWidth={1.75} />
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <span className="ui" style={{ fontSize: 11, color: 'rgba(180,240,205,0.6)' }}>
                {degreeOf(selected.id)} connection{degreeOf(selected.id) !== 1 ? 's' : ''}
              </span>
            </div>

            <button
              disabled={selected.id.startsWith('pillar:')}
              onClick={() => { if (selected.id.startsWith('pillar:')) return; onClose(); window.location.href = `/garden?seed=${encodeURIComponent(selected.id)}` }}
              style={{
                width: '100%', padding: '11px', borderRadius: 13,
                background: '#22c55e', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 700, color: '#06281a',
              }}
            >
              Open seed
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
