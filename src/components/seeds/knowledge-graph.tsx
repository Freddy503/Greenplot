'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

interface SeedNode {
  id: string
  title: string
  tags: string
  domain: string
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface D3Link {
  source: { x: number; y: number } | SeedNode
  target: { x: number; y: number } | SeedNode
}

interface SeedLink {
  source: string
  target: string
  shared_tags: number
}

interface GraphData {
  nodes: SeedNode[]
  links: SeedLink[]
}

function tagColor(tags: string): string {
  const t = tags.toLowerCase()
  if (t.includes('agentic') || t.includes('ai')) return '#16a34a'  // primary green
  if (t.includes('enterprise')) return '#d97706'  // gold
  if (t.includes('career')) return '#2563eb'  // blue
  if (t.includes('creativity')) return '#7c3aed'  // violet
  if (t.includes('knowledge') || t.includes('pkm')) return '#0891b2'  // teal
  return '#64748b'  // slate
}

export function KnowledgeGraph({ data, onNodeClick }: { data: GraphData; onNodeClick?: (node: SeedNode) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setDimensions({ width, height })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return

    const { width, height } = dimensions
    const svg = d3.select(svgRef.current)

    // Clear previous
    svg.selectAll('*').remove()

    // Background
    svg
      .append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#fafaf8')

    // Defs for glow
    const defs = svg.append('defs')
    const glow = defs.append('filter').attr('id', 'node-glow')
    glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
    const merge = glow.append('feMerge')
    merge.append('feMergeNode').attr('in', 'coloredBlur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Defs for background gradient
    const bgGradient = defs
      .append('radialGradient')
      .attr('id', 'bg-gradient')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%')
    bgGradient.append('stop').attr('offset', '0%').attr('stop-color', '#f0f0ed').attr('stop-opacity', '0.5')
    bgGradient.append('stop').attr('offset', '100%').attr('stop-color', '#fafaf8').attr('stop-opacity', '0')

    // Links
    const links = svg.select('.links').empty()
      ? svg.append<SVGGElement>('g').attr('class', 'links')
      : svg.select<SVGGElement>('.links')

    links.selectAll('line')
      .data(data.links)
      .join('line')
      .attr('stroke', '#e0dfdd')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)

    // Nodes
    const nodesG = svg.select('.nodes').empty()
      ? svg.append<SVGGElement>('g').attr('class', 'nodes')
      : svg.select<SVGGElement>('.nodes')

    const nodeGroups = nodesG.selectAll<SVGGElement, SeedNode>('g')
      .data(data.nodes)
      .join(
        enter => {
          const g = enter.append('g')
            .style('cursor', 'pointer')
            .on('click', (_, d) => onNodeClick?.(d))

          // Glow circle
          g.append('circle')
            .attr('r', 8)
            .attr('fill', d => tagColor(d.tags))
            .attr('fill-opacity', 0.15)
            .attr('filter', 'url(#node-glow)')

          // Main circle
          g.append('circle')
            .attr('r', 6)
            .attr('fill', d => tagColor(d.tags))
            .attr('stroke', '#fafaf8')
            .attr('stroke-width', 1.5)

          // Label
          g.append('text')
            .text(d => d.title?.slice(0, 20) || d.id?.slice(0, 8))
            .attr('font-size', '9px')
            .attr('fill', '#5c5d5c')
            .attr('text-anchor', 'middle')
            .attr('dy', '16px')
            .style('pointer-events', 'none')

          return g
        },
        update => update,
        exit => exit.remove()
      )

    // Simulation
    const simulation = d3.forceSimulation<SeedNode>(data.nodes)
      .force('link', d3.forceLink<SeedNode, SeedLink>(data.links).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30))

    simulation.on('tick', () => {
      links.selectAll('line')
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      nodeGroups
        .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`)
    })

    return () => {
      simulation.stop()
    }
  }, [data, dimensions, onNodeClick])

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px]">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  )
}

export default KnowledgeGraph
