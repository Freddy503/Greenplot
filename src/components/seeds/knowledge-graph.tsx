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
  strength: number // 0-1, higher = tighter connection
}

interface Seed {
  id: string
  title: string
  domain?: string
  text: string
}

// Domain → color mapping
function getDomainColor(domain: string): string {
  const d = domain?.toLowerCase() || ''
  if (d.includes('agentic') || d.includes('ai')) return '#69f6b8' // primary green
  if (d.includes('enterprise') || d.includes('business')) return '#f8a010' // orange
  if (d.includes('career') || d.includes('fde')) return '#cdffe3' // tertiary
  if (d.includes('creativ')) return '#b1fedc' // secondary green
  if (d.includes('system') || d.includes('architecture')) return '#58e7ab' // primary dim
  if (d.includes('knowledge')) return '#06b77f' // primary container
  return '#9ab0a5' // on-surface-variant
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

  // Build edges from shared domain tags
  for (let i = 0; i < seeds.length; i++) {
    const tagsA = (seeds[i].domain || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
    for (let j = i + 1; j < seeds.length; j++) {
      const tagsB = (seeds[j].domain || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
      const shared = tagsA.filter(t => tagsB.includes(t))
      if (shared.length > 0) {
        const key = [seeds[i].id, seeds[j].id].sort().join('-')
        if (!linkSet.has(key)) {
          linkSet.add(key)
          // Variable edge strength: more shared tags = tighter connection
          const strength = Math.min(shared.length / 3, 1)
          links.push({ source: seeds[i].id, target: seeds[j].id, strength })
          // Update connection count
          nodes[i].connections++
          nodes[j].connections++
        }
      }
    }
  }

  // Also link by shared words in title (semantic proximity)
  for (let i = 0; i < seeds.length; i++) {
    const wordsA = new Set(seeds[i].title.toLowerCase().split(/\s+/).filter(w => w.length > 4))
    for (let j = i + 1; j < seeds.length; j++) {
      const wordsB = new Set(seeds[j].title.toLowerCase().split(/\s+/).filter(w => w.length > 4))
      const shared = [...wordsA].filter(w => wordsB.has(w))
      if (shared.length >= 2) {
        const key = [seeds[i].id, seeds[j].id].sort().join('-')
        if (!linkSet.has(key)) {
          linkSet.add(key)
          links.push({ source: seeds[i].id, target: seeds[j].id, strength: 0.3 })
          nodes[i].connections++
          nodes[j].connections++
        }
      }
    }
  }

  return { nodes, links }
}

export function KnowledgeGraph({
  seeds,
  onNodeClick,
}: {
  seeds: Seed[]
  onNodeClick?: (seed: Seed) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 })

  // Responsive sizing
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setDimensions({ width: rect.width, height: Math.max(rect.height, 350) })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Build and render graph
  useEffect(() => {
    if (!svgRef.current || seeds.length === 0) return

    const { width, height } = dimensions
    const { nodes, links } = buildGraph(seeds)

    // Clear previous
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Background glow
    svg.append('defs')
      .append('radialGradient')
      .attr('id', 'bgGlow')
      .html(`
        <stop offset="0%" stop-color="#69f6b8" stop-opacity="0.03"/>
        <stop offset="100%" stop-color="#01120b" stop-opacity="0"/>
      `)

    svg.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', Math.min(width, height) * 0.4)
      .attr('fill', 'url(#bgGlow)')

    // Force simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(d => d.strength > 0.5 ? 60 : 120) // Spines vs bridges (Tendril approach)
        .strength(d => d.strength * 0.5)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force('collision', d3.forceCollide<GraphNode>().radius(d => getNodeRadius(d) + 5))
      .alphaDecay(0.02)
      .velocityDecay(0.4)

    // Links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#384c43')
      .attr('stroke-opacity', d => 0.15 + d.strength * 0.35)
      .attr('stroke-width', d => 0.5 + d.strength * 1.5)

    // Node groups
    const node = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(d3.drag<any, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      )
      .on('click', (event, d) => {
        const seed = seeds.find(s => s.id === d.id)
        if (seed && onNodeClick) onNodeClick(seed)
      })

    // Node glow
    node.append('circle')
      .attr('r', d => getNodeRadius(d) + 8)
      .attr('fill', d => getDomainColor(d.domain))
      .attr('opacity', 0.08)

    // Node circle
    node.append('circle')
      .attr('r', d => getNodeRadius(d))
      .attr('fill', d => getDomainColor(d.domain))
      .attr('fill-opacity', 0.7)
      .attr('stroke', d => getDomainColor(d.domain))
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.3)

    // Labels (only for hub nodes — degree > 2)
    node.filter(d => d.connections > 2 || nodes.length < 20)
      .append('text')
      .text(d => truncateTitle(d.title, 20))
      .attr('x', d => getNodeRadius(d) + 6)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', '#9ab0a5')
      .attr('font-family', 'Plus Jakarta Sans, sans-serif')

    // Hover effects
    node.on('mouseenter', function(event, d) {
      d3.select(this).select('circle:nth-child(2)')
        .transition().duration(200)
        .attr('fill-opacity', 1)
        .attr('r', getNodeRadius(d) + 3)

      // Highlight connected edges
      link.attr('stroke-opacity', l => {
        const sourceId = typeof l.source === 'string' ? l.source : l.source.id
        const targetId = typeof l.target === 'string' ? l.target : l.target.id
        return (sourceId === d.id || targetId === d.id) ? 0.8 : 0.05
      }).attr('stroke', l => {
        const sourceId = typeof l.source === 'string' ? l.source : l.source.id
        const targetId = typeof l.target === 'string' ? l.target : l.target.id
        return (sourceId === d.id || targetId === d.id) ? '#69f6b8' : '#384c43'
      })
    })
    .on('mouseleave', function(event, d) {
      d3.select(this).select('circle:nth-child(2)')
        .transition().duration(200)
        .attr('fill-opacity', 0.7)
        .attr('r', getNodeRadius(d))

      link.attr('stroke-opacity', l => 0.15 + l.strength * 0.35)
        .attr('stroke', '#384c43')
    })

    // Simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as GraphNode).x || 0)
        .attr('y1', d => (d.source as GraphNode).y || 0)
        .attr('x2', d => (d.target as GraphNode).x || 0)
        .attr('y2', d => (d.target as GraphNode).y || 0)

      node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
    })

    return () => { simulation.stop() }
  }, [seeds, dimensions, onNodeClick])

  return (
    <div ref={containerRef} className="w-full rounded-2xl overflow-hidden bg-surface-container-low border border-outline-variant/10" style={{ height: '400px' }}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full"
      />
    </div>
  )
}

function getNodeRadius(d: GraphNode): number {
  // Size by connections: minimum 6, max 20
  return Math.min(6 + d.connections * 3, 20)
}

function truncateTitle(title: string, max: number): string {
  return title.length > max ? title.slice(0, max - 1) + '…' : title
}
