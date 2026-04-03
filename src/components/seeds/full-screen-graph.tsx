'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  domain: string
  connections: number
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
  strength: number
}

interface Seed {
  id: string
  title: string
  domain?: string
  text: string
}

function getDomainColor(domain: string): string {
  const d = domain?.toLowerCase() || ''
  if (d.includes('agentic') || d.includes('ai')) return '#69f6b8'
  if (d.includes('enterprise') || d.includes('business')) return '#f8a010'
  if (d.includes('career') || d.includes('fde')) return '#cdffe3'
  if (d.includes('creativ')) return '#b1fedc'
  if (d.includes('system') || d.includes('architecture')) return '#58e7ab'
  if (d.includes('knowledge')) return '#06b77f'
  return '#9ab0a5'
}

function getNodeRadius(d: GraphNode): number {
  return Math.min(5 + d.connections * 2.5, 18)
}

function truncateTitle(title: string, max: number): string {
  return title.length > max ? title.slice(0, max - 1) + '…' : title
}

interface FullScreenGraphProps {
  seeds: Seed[]
  open: boolean
  onClose: () => void
  onNodeClick?: (seed: Seed) => void
}

export function FullScreenGraph({ seeds, open, onClose, onNodeClick }: FullScreenGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [graphMethod, setGraphMethod] = useState<string>('loading')
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] } | null>(null)

  useEffect(() => {
    if (!open) return
    const update = () => setDimensions({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [open])

  // Fetch graph from vector-proximity API
  useEffect(() => {
    if (!open || seeds.length < 2) return
    setGraphMethod('loading')
    fetch('/api/seeds/graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seeds: seeds.map(s => ({ id: s.id, title: s.title, text: s.text, domain: s.domain || '' })),
        maxEdges: 150,
      }),
    })
      .then(r => r.json())
      .then(data => {
        const nodes: GraphNode[] = (data.nodes || []).map((n: Record<string, unknown>) => ({
          id: n.id, title: n.title, domain: (n.domain as string) || '', connections: 0,
        }))
        const links: GraphLink[] = (data.links || []).map((l: Record<string, unknown>) => ({
          source: l.source, target: l.target, strength: (l.strength as number) || 0.3,
        }))
        for (const link of links) {
          const s = nodes.find(n => n.id === link.source)
          const t = nodes.find(n => n.id === link.target)
          if (s) s.connections++
          if (t) t.connections++
        }
        setGraphData({ nodes, links })
        setGraphMethod(data.method || 'unknown')
      })
      .catch(() => setGraphMethod('error'))
  }, [open, seeds])

  // D3 rendering
  useEffect(() => {
    if (!svgRef.current || !graphData || graphData.nodes.length === 0) return
    const { width, height } = dimensions
    const { nodes, links } = graphData
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const defs = svg.append('defs')
    const glow = defs.append('radialGradient').attr('id', 'graphGlow')
    glow.append('stop').attr('offset', '0%').attr('stop-color', '#69f6b8').attr('stop-opacity', '0.04')
    glow.append('stop').attr('offset', '100%').attr('stop-color', '#01120b').attr('stop-opacity', '0')
    svg.append('circle').attr('cx', width / 2).attr('cy', height / 2)
      .attr('r', Math.min(width, height) * 0.5).attr('fill', 'url(#graphGlow)')

    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))
    svg.call(zoom)

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id)
        .distance(d => d.strength > 0.5 ? 80 : 160).strength(d => d.strength * 0.4))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.03))
      .force('collision', d3.forceCollide<GraphNode>().radius(d => getNodeRadius(d) + 8))
      .alphaDecay(0.015).velocityDecay(0.35)

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', '#384c43').attr('stroke-opacity', d => 0.1 + d.strength * 0.4)
      .attr('stroke-width', d => 0.5 + d.strength * 2.5)

    const node = g.append('g').selectAll('g').data(nodes).join('g').style('cursor', 'pointer')
      .call(d3.drag<any, GraphNode>()
        .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
      )
      .on('click', (e, d) => { const s = seeds.find(s => s.id === d.id); if (s && onNodeClick) onNodeClick(s) })
      .on('mouseenter', (e, d) => {
        setHoveredNode(d.id)
        d3.select(e.currentTarget).select('circle:nth-child(2)').transition().duration(200)
          .attr('fill-opacity', 1).attr('r', getNodeRadius(d) + 4)
        link.attr('stroke-opacity', l => {
          const sid = typeof l.source === 'string' ? l.source : l.source.id
          const tid = typeof l.target === 'string' ? l.target : l.target.id
          return (sid === d.id || tid === d.id) ? 0.7 : 0.03
        }).attr('stroke', l => {
          const sid = typeof l.source === 'string' ? l.source : l.source.id
          const tid = typeof l.target === 'string' ? l.target : l.target.id
          return (sid === d.id || tid === d.id) ? '#69f6b8' : '#384c43'
        })
      })
      .on('mouseleave', (e, d) => {
        setHoveredNode(null)
        d3.select(e.currentTarget).select('circle:nth-child(2)').transition().duration(200)
          .attr('fill-opacity', 0.6).attr('r', getNodeRadius(d))
        link.attr('stroke-opacity', l => 0.1 + l.strength * 0.4).attr('stroke', '#384c43')
      })

    node.append('circle').attr('r', d => getNodeRadius(d) + 12).attr('fill', d => getDomainColor(d.domain)).attr('opacity', 0.06)
    node.append('circle').attr('r', d => getNodeRadius(d)).attr('fill', d => getDomainColor(d.domain)).attr('fill-opacity', 0.6)
      .attr('stroke', d => getDomainColor(d.domain)).attr('stroke-width', 1).attr('stroke-opacity', 0.3)
    node.filter(d => d.connections > 1 || nodes.length < 30).append('text').text(d => truncateTitle(d.title, 25))
      .attr('x', d => getNodeRadius(d) + 8).attr('y', 4).attr('font-size', '11px').attr('font-weight', '600')
      .attr('fill', '#9ab0a5').attr('font-family', 'Plus Jakarta Sans, sans-serif')

    simulation.on('tick', () => {
      link.attr('x1', d => (d.source as GraphNode).x || 0).attr('y1', d => (d.source as GraphNode).y || 0)
        .attr('x2', d => (d.target as GraphNode).x || 0).attr('y2', d => (d.target as GraphNode).y || 0)
      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
    })

    setTimeout(() => svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(0.85)), 2000)
    return () => { simulation.stop() }
  }, [graphData, dimensions, seeds, onNodeClick])

  if (!open) return null

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-[#01120b] flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10 z-10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '24px', fontVariationSettings: '"FILL" 1' }}>hub</span>
          <div>
            <h2 className="text-lg font-extrabold text-on-surface">Knowledge Graph</h2>
            <p className="text-[10px] text-on-surface-variant">
              {graphMethod === 'loading' ? 'Loading…' : `${seeds.length} seeds · ${graphMethod === 'vector' ? 'Vector proximity' : 'Text similarity'} · Drag to explore`}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="flex-1 relative">
        {graphMethod === 'loading' ? (
          <div className="flex items-center justify-center h-full">
            <span className="material-symbols-outlined text-primary animate-spin text-3xl">progress_activity</span>
          </div>
        ) : (
          <svg ref={svgRef} width={dimensions.width} height={dimensions.height - 64} className="w-full h-full" />
        )}

        {hoveredNode && (() => {
          const seed = seeds.find(s => s.id === hoveredNode)
          if (!seed) return null
          return (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-surface-container-high/90 backdrop-blur-xl rounded-full px-6 py-3 border border-outline-variant/10 animate-in fade-in slide-in-from-bottom-2">
              <p className="text-sm font-bold text-on-surface">{seed.title}</p>
              {seed.domain && <p className="text-[10px] text-primary mt-0.5">{seed.domain}</p>}
            </div>
          )
        })()}

        <div className="absolute bottom-6 right-6 bg-surface-container-high/80 backdrop-blur-xl rounded-2xl p-3 border border-outline-variant/10">
          <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60 mb-2">Domains</p>
          {[{ l: 'Agentic AI', c: '#69f6b8' }, { l: 'Enterprise', c: '#f8a010' }, { l: 'Career', c: '#cdffe3' }, { l: 'Creativity', c: '#b1fedc' }, { l: 'Knowledge', c: '#06b77f' }].map(({ l, c }) => (
            <div key={l} className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c }} />
              <span className="text-[10px] text-on-surface-variant">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
