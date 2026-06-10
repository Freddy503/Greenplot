'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import * as d3 from 'd3'

// ── Types ─────────────────────────────────────────────

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  label: string
  type: 'seed' | 'plant' | 'source'
  domain?: string
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

function nodeColor(type: string) {
  if (type === 'plant') return '#7ef0a8'
  if (type === 'source') return 'transparent'
  return '#22c55e'
}
function nodeStroke(type: string) {
  if (type === 'source') return '#2dd4bf'
  return 'none'
}
function nodeRadius(type: string) {
  return type === 'plant' ? 11 : 8
}

export default function KnowledgeGraph({ onClose }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [links, setLinks] = useState<GraphLink[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [selectedConnections, setSelectedConnections] = useState(0)

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
          fetch('/api/seeds?limit=60', { headers })
            .then(r => r.json())
            .then(d => {
              const seeds: RawSeed[] = d.seeds || d || []
              const graphNodes: GraphNode[] = seeds.map(s => ({
                id: s.id || s.notion_id || String(Math.random()),
                label: (s.title || 'Untitled').slice(0, 40),
                type: 'seed',
                domain: s.domain || (s.seed_metadata as { domain?: string })?.domain || '',
              }))
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

  // ── D3 render: SVG + native zoom/drag (no React state per frame) ──
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return

    const W = containerRef.current.clientWidth || 360
    const H = containerRef.current.clientHeight || 600

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${W} ${H}`)

    const g = svg.append('g')

    // Native d3 zoom drives the <g> transform attribute directly — zero React re-renders.
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    const sim = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(80).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(32))
      .alphaDecay(0.025)

    const linkSel = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', 'rgba(255,255,255,0.08)')
      .attr('stroke-width', 0.75)

    const idOf = (e: string | GraphNode) => (typeof e === 'object' ? e.id : e)

    const applyHighlight = (id: string | null) => {
      linkSel
        .attr('stroke', d => (id && (idOf(d.source) === id || idOf(d.target) === id)) ? 'rgba(126,240,168,0.55)' : 'rgba(255,255,255,0.08)')
        .attr('stroke-width', d => (id && (idOf(d.source) === id || idOf(d.target) === id)) ? 1.5 : 0.75)
    }

    const nodeSel = g.append('g').selectAll<SVGGElement, GraphNode>('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, GraphNode>()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )
      .on('click', (_e, d) => {
        setSelected(prev => {
          const next = prev?.id === d.id ? null : d
          const id = next ? d.id : null
          applyHighlight(id)
          if (next) {
            const count = links.filter(l => idOf(l.source) === d.id || idOf(l.target) === d.id).length
            setSelectedConnections(count)
          }
          return next
        })
      })

    nodeSel.append('circle')
      .attr('r', d => nodeRadius(d.type) + (d.type === 'source' ? 0 : 4))
      .attr('fill', d => nodeColor(d.type))
      .attr('opacity', d => d.type === 'source' ? 0 : 0.18)
    nodeSel.append('circle')
      .attr('r', d => nodeRadius(d.type))
      .attr('fill', d => nodeColor(d.type))
      .attr('stroke', d => nodeStroke(d.type))
      .attr('stroke-width', d => nodeStroke(d.type) !== 'none' ? 1.5 : 0)
    nodeSel.append('text')
      .text(d => d.label.length > 18 ? d.label.slice(0, 18) + '…' : d.label)
      .attr('x', 0)
      .attr('y', d => nodeRadius(d.type) + 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', '9.5px')
      .attr('font-weight', '600')
      .attr('font-family', 'var(--ui)')
      .attr('fill', 'rgba(255,255,255,0.6)')

    sim.on('tick', () => {
      linkSel
        .attr('x1', d => (d.source as GraphNode).x ?? 0)
        .attr('y1', d => (d.source as GraphNode).y ?? 0)
        .attr('x2', d => (d.target as GraphNode).x ?? 0)
        .attr('y2', d => (d.target as GraphNode).y ?? 0)
      nodeSel.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => { sim.stop() }
  }, [nodes, links])

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

      {/* Graph canvas — SVG with native d3 zoom/pan/drag */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 99, border: '2px solid rgba(34,197,94,0.4)', borderTopColor: '#22c55e', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <span className="ui" style={{ fontSize: 13, color: 'rgba(180,240,205,0.7)' }}>Growing your graph…</span>
            </div>
          </div>
        ) : (
          <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
        )}
      </div>

      {/* Selected node detail card */}
      {selected && (
        <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 20px) + 24px)', left: 16, right: 16, zIndex: 10 }}>
          <div className="glass-dark" style={{ borderRadius: 22, padding: '16px 18px' }}>
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

            <div style={{ marginBottom: 14 }}>
              <span className="ui" style={{ fontSize: 11, color: 'rgba(180,240,205,0.6)' }}>
                {selectedConnections} connection{selectedConnections !== 1 ? 's' : ''}
              </span>
            </div>

            <button
              onClick={() => { onClose(); window.location.href = `/garden?seed=${encodeURIComponent(selected.id)}` }}
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
