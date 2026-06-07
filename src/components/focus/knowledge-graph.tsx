'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import * as d3 from 'd3'

// ── Types ─────────────────────────────────────────────

interface GraphNode {
  id: string
  label: string
  type: 'seed' | 'plant' | 'source'
  domain?: string
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
}

interface RawSeed {
  id?: string
  notion_id?: string
  title?: string
  content?: string
  text?: string
  domain?: string
  seed_type?: string
  type?: string
  tags?: string | string[]
  seed_metadata?: { tags?: string[]; domain?: string }
}

// ── Knowledge Graph Overlay ────────────────────────────

interface KnowledgeGraphProps {
  onClose: () => void
}

export default function KnowledgeGraph({ onClose }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [highlightedLinks, setHighlightedLinks] = useState<Set<string>>(new Set())
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)
  // Pan + zoom state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const panRef = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number }>({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 })

  // Fetch graph data
  useEffect(() => {
    const token = localStorage.getItem('greenplot_token')
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

    fetch('/api/seeds/graph', { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.nodes && data?.edges) {
          const graphNodes: GraphNode[] = data.nodes.map((n: RawSeed) => ({
            id: n.id || n.notion_id || String(Math.random()),
            label: n.title || 'Untitled',
            type: (n.seed_type || n.type || 'seed') as 'seed' | 'plant' | 'source',
            domain: n.domain || (n.seed_metadata as { domain?: string })?.domain || '',
          }))
          const graphLinks: GraphLink[] = (data.edges || []).map((e: { source: string; target: string }) => ({
            source: e.source,
            target: e.target,
          }))
          setNodes(graphNodes)
          setLinks(graphLinks)
        } else {
          // Fallback: load from /api/seeds and build connections from shared domains
          fetch('/api/seeds?limit=60', { headers: headers as HeadersInit })
            .then(r => r.json())
            .then(d => {
              const seeds: RawSeed[] = d.seeds || d || []
              const graphNodes: GraphNode[] = seeds.map(s => ({
                id: s.id || s.notion_id || String(Math.random()),
                label: (s.title || 'Untitled').slice(0, 40),
                type: 'seed',
                domain: s.domain || (s.seed_metadata as { domain?: string })?.domain || '',
              }))
              // Build links from shared domains
              const graphLinks: GraphLink[] = []
              const seen = new Set<string>()
              for (let i = 0; i < graphNodes.length; i++) {
                for (let j = i + 1; j < graphNodes.length; j++) {
                  const a = graphNodes[i], b = graphNodes[j]
                  if (a.domain && b.domain && a.domain.toLowerCase() === b.domain.toLowerCase()) {
                    const key = [a.id, b.id].sort().join('|')
                    if (!seen.has(key)) {
                      seen.add(key)
                      graphLinks.push({ source: a.id, target: b.id })
                    }
                  }
                }
              }
              setNodes(graphNodes)
              setLinks(graphLinks.slice(0, 80))
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Run d3 force simulation
  useEffect(() => {
    if (!nodes.length || !containerRef.current) return

    const container = containerRef.current
    const W = container.clientWidth || 360
    const H = container.clientHeight || 500

    simulationRef.current?.stop()

    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(80).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(32))
      .alphaDecay(0.025)

    sim.on('tick', () => {
      const positions = new Map<string, { x: number; y: number }>()
      nodes.forEach(n => {
        positions.set(n.id, {
          x: Math.max(24, Math.min(W - 24, n.x ?? W / 2)),
          y: Math.max(24, Math.min(H - 24, n.y ?? H / 2)),
        })
      })
      setNodePositions(new Map(positions))
    })

    simulationRef.current = sim
    return () => { sim.stop() }
  }, [nodes, links])

  // Highlight edges connected to selected node
  useEffect(() => {
    if (!selected) { setHighlightedLinks(new Set()); return }
    const connected = new Set<string>()
    links.forEach(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source
      const t = typeof l.target === 'object' ? l.target.id : l.target
      if (s === selected.id || t === selected.id) connected.add(`${s}|${t}`)
    })
    setHighlightedLinks(connected)
  }, [selected, links])

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelected(prev => prev?.id === node.id ? null : node)
  }, [])

  const nodeColor = (type: string) => {
    if (type === 'plant') return '#7ef0a8'
    if (type === 'source') return 'transparent'
    return '#22c55e'
  }

  const nodeStroke = (type: string) => {
    if (type === 'source') return '#2dd4bf'
    return 'none'
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 42,
        background: 'radial-gradient(90% 70% at 70% 12%, #133a28 0%, #0a2417 45%, #06140d 100%)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div style={{ paddingTop: 'max(52px, env(safe-area-inset-top, 0px))', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 12px', gap: 10 }}>
          <button
            onClick={onClose}
            className="glass-dark tap"
            style={{ width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <ArrowLeft size={18} color="rgba(255,255,255,0.9)" strokeWidth={1.75} />
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span className="caps" style={{ fontSize: 11, color: 'rgba(180,240,205,0.8)' }}>KNOWLEDGE GRAPH</span>
          </div>
          <button
            className="glass-dark tap"
            style={{ width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Search size={17} color="rgba(255,255,255,0.9)" strokeWidth={1.75} />
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px', justifyContent: 'center' }}>
          {[
            { color: '#22c55e', label: 'Seed', stroke: false },
            { color: '#7ef0a8', label: 'Plant', stroke: false },
            { color: 'transparent', label: 'Source', stroke: true, strokeColor: '#2dd4bf' },
          ].map(({ color, label, stroke, strokeColor }) => (
            <div key={label} className="glass-dark" style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 9999, padding: '4px 10px' }}>
              <div style={{ width: 8, height: 8, borderRadius: 99, background: color, border: stroke ? `1.5px solid ${strokeColor}` : 'none' }} />
              <span className="ui" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph canvas — outer: captures pan/zoom events; inner: transformed layer */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: transform.scale > 1 ? 'grab' : 'default' }}
        onWheel={(e) => {
          e.preventDefault()
          const delta = e.deltaY > 0 ? 0.9 : 1.1
          setTransform(t => ({ ...t, scale: Math.max(0.3, Math.min(4, t.scale * delta)) }))
        }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('[data-node]')) return
          panRef.current = { active: true, startX: e.clientX, startY: e.clientY, originX: transform.x, originY: transform.y }
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!panRef.current.active) return
          const dx = e.clientX - panRef.current.startX
          const dy = e.clientY - panRef.current.startY
          setTransform(t => ({ ...t, x: panRef.current.originX + dx, y: panRef.current.originY + dy }))
        }}
        onPointerUp={() => { panRef.current.active = false }}
      >
        {/* Transformed canvas — holds both SVG edges and HTML nodes */}
        <div
          ref={canvasRef}
          style={{
            position: 'absolute', inset: 0,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '50% 50%',
          }}
        >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 99, border: '2px solid rgba(34,197,94,0.4)', borderTopColor: '#22c55e', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <span className="ui" style={{ fontSize: 13, color: 'rgba(180,240,205,0.7)' }}>Growing your graph…</span>
            </div>
          </div>
        ) : (
          <>
            {/* SVG edges */}
            <svg
              ref={svgRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
              {links.map((link, i) => {
                const s = typeof link.source === 'object' ? link.source.id : link.source
                const t = typeof link.target === 'object' ? link.target.id : link.target
                const sp = nodePositions.get(s)
                const tp = nodePositions.get(t)
                if (!sp || !tp) return null
                const key = `${s}|${t}`
                const highlighted = highlightedLinks.has(key)
                return (
                  <line
                    key={i}
                    x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                    stroke={highlighted ? 'rgba(126,240,168,0.55)' : 'rgba(255,255,255,0.08)'}
                    strokeWidth={highlighted ? 1.5 : 0.75}
                  />
                )
              })}
            </svg>

            {/* Nodes */}
            {nodes.map(node => {
              const pos = nodePositions.get(node.id)
              if (!pos) return null
              const isSelected = selected?.id === node.id
              const label = node.label.length > 18 ? node.label.slice(0, 18) + '…' : node.label
              return (
                <div
                  key={node.id}
                  data-node="true"
                  onClick={() => handleNodeClick(node)}
                  style={{
                    position: 'absolute',
                    left: pos.x,
                    top: pos.y,
                    transform: 'translate(-50%, -50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    cursor: 'pointer',
                    zIndex: isSelected ? 3 : 1,
                  }}
                >
                  {/* Breathe ring on selected */}
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      width: 44, height: 44,
                      borderRadius: 99,
                      border: '1.5px solid rgba(34,197,94,0.4)',
                      animation: 'breathe 2s ease-in-out infinite',
                    }} />
                  )}
                  <div style={{
                    width: isSelected ? 22 : 16,
                    height: isSelected ? 22 : 16,
                    borderRadius: 99,
                    background: nodeColor(node.type),
                    border: `${nodeStroke(node.type) !== 'none' ? '1.5px solid #2dd4bf' : 'none'}`,
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 0 12px rgba(34,197,94,0.5)' : 'none',
                  }} />
                  <span style={{
                    marginTop: 4,
                    fontFamily: 'var(--ui)',
                    fontSize: 9.5,
                    fontWeight: 600,
                    color: isSelected ? '#7ef0a8' : 'rgba(255,255,255,0.6)',
                    whiteSpace: 'nowrap',
                    maxWidth: 80,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>{label}</span>
                </div>
              )
            })}
          </>
        )}
        </div>{/* end transformed canvas */}
      </div>

      {/* Selected node detail card */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 20px) + 24px)', left: 16, right: 16, zIndex: 10 }}>
          <div
            className="glass-dark"
            style={{ borderRadius: 22, padding: '16px 18px' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 99,
                    background: nodeColor(selected.type),
                    border: nodeStroke(selected.type) !== 'none' ? '1.5px solid #2dd4bf' : 'none',
                  }} />
                  <span className="caps" style={{ fontSize: 9.5, color: 'rgba(180,240,205,0.7)' }}>
                    {selected.type.toUpperCase()}
                    {selected.domain ? ` · ${selected.domain}` : ''}
                  </span>
                </div>
                <h3 className="serif" style={{ fontSize: 22, color: '#fff', lineHeight: 1.1, margin: 0 }}>{selected.label}</h3>
              </div>
              <button onClick={() => setSelected(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={16} color="rgba(255,255,255,0.5)" strokeWidth={1.75} />
              </button>
            </div>

            {/* Connections count */}
            <div style={{ marginBottom: 14 }}>
              <span className="ui" style={{ fontSize: 11, color: 'rgba(180,240,205,0.6)' }}>
                {highlightedLinks.size} connection{highlightedLinks.size !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Open button */}
            <button
              onClick={() => {
                onClose()
                window.location.href = `/garden`
              }}
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

      {nodes.length === 0 && !loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: '0 40px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
            <p className="serif" style={{ fontSize: 22, color: '#fff', marginBottom: 8 }}>Garden is empty</p>
            <p className="body-text" style={{ fontSize: 13, color: 'rgba(180,240,205,0.6)' }}>Plant your first idea in Chat</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
