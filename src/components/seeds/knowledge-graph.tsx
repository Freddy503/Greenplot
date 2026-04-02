'use client'

import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react'

// Dynamic import to avoid SSR issues
const ForceGraph2D = lazy(() => import('react-force-graph-2d'))

interface GraphNode {
  id: string
  name: string
  domain: string
  val: number // node size
  color: string
}

interface GraphLink {
  source: string
  target: string
  value: number // link strength
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

interface SeedForGraph {
  id: string
  title: string
  domain?: string
  text?: string
  content?: string
  tags?: string
}

// Domain colors matching the Stitch design
const DOMAIN_COLORS: Record<string, string> = {
  'agentic-ai': '#69f6b8',
  'enterprise': '#f8a010',
  'career': '#cdffe3',
  'creativity': '#6bffc1',
  'system': '#58e7ab',
  'default': '#9ab0a5',
}

function getDomainColor(domain: string): string {
  const d = domain?.toLowerCase() || ''
  for (const [key, color] of Object.entries(DOMAIN_COLORS)) {
    if (d.includes(key)) return color
  }
  return DOMAIN_COLORS.default
}

function buildGraph(seeds: SeedForGraph[]): GraphData {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const nodeMap = new Map<string, GraphNode>()

  // Create nodes
  for (const seed of seeds) {
    const domain = seed.domain || extractDomain(seed)
    const node: GraphNode = {
      id: seed.id,
      name: seed.title.length > 30 ? seed.title.slice(0, 30) + '…' : seed.title,
      domain,
      val: 1,
      color: getDomainColor(domain),
    }
    nodes.push(node)
    nodeMap.set(seed.id, node)
  }

  // Create links based on shared domains and tag overlap
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      const a = seeds[i]
      const b = seeds[j]
      const similarity = computeSimilarity(a, b)
      if (similarity > 0.15) {
        links.push({
          source: a.id,
          target: b.id,
          value: similarity,
        })
        // Increase node size based on connections
        const nodeA = nodeMap.get(a.id)
        const nodeB = nodeMap.get(b.id)
        if (nodeA) nodeA.val = Math.min(nodeA.val + 0.3, 5)
        if (nodeB) nodeB.val = Math.min(nodeB.val + 0.3, 5)
      }
    }
  }

  return { nodes, links }
}

function extractDomain(seed: SeedForGraph): string {
  const text = `${seed.text || seed.content || ''} ${seed.tags || ''}`
  if (/agentic|agent|multi.agent/i.test(text)) return 'agentic-ai'
  if (/enterprise|business|sap/i.test(text)) return 'enterprise'
  if (/career|fde|interview/i.test(text)) return 'career'
  if (/creativ|design|art/i.test(text)) return 'creativity'
  if (/system|architect|pipeline/i.test(text)) return 'system'
  return 'default'
}

function computeSimilarity(a: SeedForGraph, b: SeedForGraph): number {
  // Domain match
  const domainA = (a.domain || extractDomain(a)).toLowerCase()
  const domainB = (b.domain || extractDomain(b)).toLowerCase()
  if (domainA === domainB && domainA !== 'default') return 0.6

  // Tag overlap
  const tagsA = new Set((a.tags || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean))
  const tagsB = new Set((b.tags || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean))
  if (tagsA.size > 0 && tagsB.size > 0) {
    const overlap = [...tagsA].filter(t => tagsB.has(t)).length
    if (overlap > 0) return 0.3 + overlap * 0.2
  }

  // Text keyword overlap
  const textA = `${a.title} ${a.text || a.content || ''}`.toLowerCase()
  const textB = `${b.title} ${b.text || b.content || ''}`.toLowerCase()
  const wordsA = new Set(textA.split(/\s+/).filter(w => w.length > 4))
  const wordsB = new Set(textB.split(/\s+/).filter(w => w.length > 4))
  if (wordsA.size > 0 && wordsB.size > 0) {
    const overlap = [...wordsA].filter(w => wordsB.has(w)).length
    if (overlap >= 3) return 0.4
    if (overlap >= 2) return 0.25
  }

  return 0
}

interface KnowledgeGraphProps {
  seeds: SeedForGraph[]
  onNodeClick?: (seed: SeedForGraph) => void
  className?: string
}

export function KnowledgeGraph({ seeds, onNodeClick, className }: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] })
  const [dimensions, setDimensions] = useState({ width: 400, height: 500 })

  useEffect(() => {
    if (seeds.length > 0) {
      // Limit to 50 nodes for performance
      const limited = seeds.slice(0, 50)
      setGraphData(buildGraph(limited))
    }
  }, [seeds])

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: Math.max(400, window.innerHeight * 0.5),
        })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const handleNodeClick = useCallback((node: any) => {
    const seed = seeds.find(s => s.id === node.id)
    if (seed && onNodeClick) onNodeClick(seed)
  }, [seeds, onNodeClick])

  if (seeds.length < 3) {
    return (
      <div className="flex items-center justify-center h-48 text-on-surface-variant/40 text-sm">
        <span className="material-symbols-outlined mr-2" style={{ fontSize: '20px' }}>hub</span>
        Add more seeds to see connections
      </div>
    )
  }

  return (
    <div ref={containerRef} className={className}>
      <Suspense fallback={
        <div className="flex items-center justify-center h-48 text-on-surface-variant/40 text-sm">
          <span className="material-symbols-outlined animate-spin mr-2" style={{ fontSize: '20px' }}>progress_activity</span>
          Loading graph…
        </div>
      }>
        <ForceGraph2D
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeLabel="name"
        nodeVal="val"
        nodeColor="color"
        nodeCanvasObject={(node: any, ctx: globalThis.CanvasRenderingContext2D, globalScale: number) => {
          const label = node.name
          const fontSize = Math.max(8, 12 / globalScale)
          const isHub = node.val > 2

          // Draw node circle
          ctx.beginPath()
          ctx.arc(node.x, node.y, (node.val || 1) * 4, 0, 2 * Math.PI)
          ctx.fillStyle = node.color || '#69f6b8'
          ctx.globalAlpha = isHub ? 0.9 : 0.6
          ctx.fill()
          ctx.globalAlpha = 1

          // Draw label for hubs or when zoomed in
          if (isHub || globalScale > 1.5) {
            ctx.font = `${isHub ? 'bold ' : ''}${fontSize}px Plus Jakarta Sans, sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'top'
            ctx.fillStyle = '#e4fcf0'
            ctx.fillText(label, node.x, node.y + (node.val || 1) * 4 + 3)
          }
        }}
        linkColor={() => 'rgba(105, 246, 184, 0.15)'}
        linkWidth={(link: any) => (link.value || 0.3) * 2}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1}
        linkDirectionalParticleSpeed={0.005}
        onNodeClick={handleNodeClick}
        cooldownTicks={100}
        warmupTicks={50}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.4}
      />
      </Suspense>
    </div>
  )
}
