'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  domain: string
  connections: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
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

function buildGraph(seeds: Seed[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = seeds.map(s => ({
    id: s.id,
    title: s.title,
    domain: s.domain || '',
    connections: 0,
  }))

  const links: GraphLink[] = []
  const linkSet = new Set<string>()

  // Domain connections
  for (let i = 0; i < seeds.length; i++) {
    const tagsA = (seeds[i].domain || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
    for (let j = i + 1; j < seeds.length; j++) {
      const tagsB = (seeds[j].domain || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
      const shared = tagsA.filter(t => tagsB.includes(t))
      if (shared.length > 0) {
        const key = [seeds[i].id, seeds[j].id].sort().join('-')
        if (!linkSet.has(key)) {
          linkSet.add(key)
          links.push({ source: seeds[i].id, target: seeds[j].id, strength: Math.min(shared.length / 3, 1) })
          nodes[i].connections++
          nodes[j].connections++
        }
      }
    }
  }

  // Word connections
  for (let i = 0; i < seeds.length; i++) {
    const wordsA = new Set(seeds[i].title.toLowerCase().split(/\s+/).filter(w => w.length > 3))
    for (let j = i + 1; j < seeds.length; j++) {
      const wordsB = new Set(seeds[j].title.toLowerCase().split(/\s+/).filter(w => w.length > 3))
      const shared = [...wordsA].filter(w => wordsB.has(w))
      if (shared.length >= 1) {
        const key = [seeds[i].id, seeds[j].id].sort().join('-')
        if (!linkSet.has(key)) {
          linkSet.add(key)
          links.push({ source: seeds[i].id, target: seeds[j].id, strength: Math.min(shared.length / 5, 0.5) })
          nodes[i].connections++
          nodes[j].connections++
        }
      }
    }
  }

  // Sequential fallback
  if (links.length === 0 && nodes.length > 1) {
    for (let i = 0; i < Math.min(nodes.length - 1, 20); i++) {
      links.push({ source: nodes[i].id, target: nodes[i + 1].id, strength: 0.1 })
      nodes[i].connections++
      nodes[i + 1].connections++
    }
  }

  return { nodes, links }
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
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)

  useEffect(() => {
    if (!open) return
    const update = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [open])

  useEffect(() => {
    if (!svgRef.current || seeds.length === 0 || !open) return

    const { width, height } = dimensions
    const { nodes, links } = buildGraph(seeds)

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Ambient glow
    const defs = svg.append('defs')
    const glow = defs.append('radialGradient').attr('id', 'graphGlow')
    glow.append('stop').attr('offset', '0%').attr('stop-color', '#69f6b8').attr('stop-opacity', '0.04')
    glow.append('stop').attr('offset', '100%').attr('stop-color', '#01120b').attr('stop-opacity', '0')

    svg.append('circle')
      .attr('cx', width / 2).attr('cy', height / 2)
      .attr('r', Math.min(width, height) * 0.5)
      .attr('fill', 'url(#graphGlow)')

    // Zoom
    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(d => d.strength > 0.5 ? 80 : 160)
        .strength(d => d.strength * 0.4)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.03))
      .force('collision', d3.forceCollide<GraphNode>().radius(d => getNodeRadius(d) + 8))
      .alphaDecay(0.015)
      .velocityDecay(0.35)

    simulationRef.current = simulation

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#384c43')
      .attr('stroke-opacity', d => 0.1 + d.strength * 0.3)
      .attr('stroke-width', d => 0.5 + d.strength * 2)

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(d3.drag<any, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null; d.fy = null
        })
      )
      .on('click', (event, d) => {
        const seed = seeds.find(s => s.id === d.id)
        if (seed && onNodeClick) onNodeClick(seed)
      })
      .on('mouseenter', (event, d) => {
        setHoveredNode(d.id)
        d3.select(event.currentTarget).select('circle:nth-child(2)')
          .transition().duration(200)
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
      .on('mouseleave', (event, d) => {
        setHoveredNode(null)
        d3.select(event.currentTarget).select('circle:nth-child(2)')
          .transition().duration(200)
          .attr('fill-opacity', 0.6).attr('r', getNodeRadius(d))
        link.attr('stroke-opacity', l => 0.1 + l.strength * 0.3).attr('stroke', '#384c43')
      })

    // Glow
    node.append('circle')
      .attr('r', d => getNodeRadius(d) + 12)
      .attr('fill', d => getDomainColor(d.domain))
      .attr('opacity', 0.06)

    // Circle
    node.append('circle')
      .attr('r', d => getNodeRadius(d))
      .attr('fill', d => getDomainColor(d.domain))
      .attr('fill-opacity', 0.6)
      .attr('stroke', d => getDomainColor(d.domain))
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.3)

    // Labels — show for hub nodes or when zoomed in
    node.filter(d => d.connections > 1 || nodes.length < 30)
      .append('text')
      .text(d => truncateTitle(d.title, 25))
      .attr('x', d => getNodeRadius(d) + 8)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#9ab0a5')
      .attr('font-family', 'Plus Jakarta Sans, sans-serif')

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x || 0)
        .attr('y1', d => (d.source as GraphNode).y || 0)
        .attr('x2', d => (d.target as GraphNode).x || 0)
        .attr('y2', d => (d.target as GraphNode).y || 0)
      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
    })

    // Fit to view after initial layout
    setTimeout(() => {
      svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity.translate(0, 0).scale(0.85)
      )
    }, 2000)

    return () => { simulation.stop() }
  }, [seeds, dimensions, open, onNodeClick])

  if (!open) return null

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-[#01120b] flex flex-col"
      style={{ animation: 'fadeIn 0.3s ease' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10 z-10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: '24px', fontVariationSettings: '"FILL" 1' }}>hub</span>
          <div>
            <h2 className="text-lg font-extrabold text-on-surface">Knowledge Graph</h2>
            <p className="text-[10px] text-on-surface-variant">
              {seeds.length} seeds · Drag to explore · Click to open
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      {/* Graph */}
      <div className="flex-1 relative">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height - 64}
          className="w-full h-full"
        />

        {/* Hovered node tooltip */}
        {hoveredNode && (() => {
          const seed = seeds.find(s => s.id === hoveredNode)
          if (!seed) return null
          return (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-surface-container-high/90 backdrop-blur-xl rounded-full px-6 py-3 border border-outline-variant/10 animate-in fade-in slide-in-from-bottom-2">
              <p className="text-sm font-bold text-on-surface">{seed.title}</p>
              {seed.domain && (
                <p className="text-[10px] text-primary mt-0.5">{seed.domain}</p>
              )}
            </div>
          )
        })()}

        {/* Legend */}
        <div className="absolute bottom-6 right-6 bg-surface-container-high/80 backdrop-blur-xl rounded-2xl p-3 border border-outline-variant/10">
          <p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/60 mb-2">Domains</p>
          {[
            { label: 'Agentic AI', color: '#69f6b8' },
            { label: 'Enterprise', color: '#f8a010' },
            { label: 'Career', color: '#cdffe3' },
            { label: 'Creativity', color: '#b1fedc' },
            { label: 'Knowledge', color: '#06b77f' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-on-surface-variant">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
