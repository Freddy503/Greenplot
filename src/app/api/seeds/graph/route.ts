import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/seeds/graph
 * 
 * Returns seed graph data with vector-proximity edges.
 * Queries Weaviate for each seed's nearest neighbors.
 * 
 * Body: { seeds: [{id, title, text, domain}], maxEdges?: number }
 * Returns: { nodes, links }
 */

const WEAVIATE_URL = process.env.WEAVIATE_URL || 'http://localhost:8080'

interface SeedNode {
  id: string
  title: string
  text: string
  domain: string
}

interface GraphEdge {
  source: string
  target: string
  strength: number // 0-1 based on vector similarity
}

// Build a graph using Weaviate's nearVector search
async function buildVectorGraph(seeds: SeedNode[], maxEdges: number): Promise<{ nodes: SeedNode[]; links: GraphEdge[] }> {
  const nodes = seeds
  const links: GraphEdge[] = []
  const linkSet = new Set<string>()

  // For each seed, find its nearest neighbors via BM25 + vector similarity
  // Batch in groups to avoid too many queries
  const batchSize = 5
  for (let i = 0; i < seeds.length; i += batchSize) {
    const batch = seeds.slice(i, i + batchSize)
    const queries = batch.map(seed => {
      const gql = `{ Get { IdeaSeed(
        nearText: { concepts: ["${seed.title.replace(/"/g, '\\"').slice(0, 100)}"] }
        where: { operator: NotEqual, path: ["title"], valueText: "${seed.title.replace(/"/g, '\\"').slice(0, 100)}" }
        limit: 3
      ) { title _additional { id certainty } } } }`
      return { seed, gql }
    })

    // Execute queries (skip if nearText not available)
    for (const { seed, gql } of queries) {
      try {
        const res = await fetch(`${WEAVIATE_URL}/v1/graphql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: gql }),
          signal: AbortSignal.timeout(3000),
        })
        if (!res.ok) continue
        const data = await res.json()
        const neighbors = data?.data?.Get?.IdeaSeed || []

        for (const neighbor of neighbors) {
          const neighborTitle = neighbor.title || ''
          const certainty = neighbor._additional?.certainty || 0

          // Find matching seed by title
          const targetSeed = seeds.find(s => s.title === neighborTitle)
          if (!targetSeed) continue

          const key = [seed.id, targetSeed.id].sort().join('-')
          if (linkSet.has(key)) continue
          if (linkSet.size >= maxEdges) break

          linkSet.add(key)
          links.push({
            source: seed.id,
            target: targetSeed.id,
            strength: Math.max(certainty, 0.3), // minimum strength for visibility
          })
        }
      } catch {
        // nearText might not be configured — fall back to BM25
      }
    }
  }

  return { nodes, links }
}

// Fallback: build graph from domain tags and title word overlap
function buildFallbackGraph(seeds: SeedNode[]): { nodes: SeedNode[]; links: GraphEdge[] } {
  const nodes = seeds
  const links: GraphEdge[] = []
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
        }
      }
    }
  }

  // Sequential fallback
  if (links.length === 0 && nodes.length > 1) {
    for (let i = 0; i < Math.min(nodes.length - 1, 20); i++) {
      links.push({ source: nodes[i].id, target: nodes[i + 1].id, strength: 0.1 })
    }
  }

  return { nodes, links }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const seeds: SeedNode[] = body.seeds || []
    const maxEdges = body.maxEdges || 100

    if (seeds.length < 2) {
      return NextResponse.json({ nodes: seeds, links: [], method: 'none' })
    }

    // Try vector-based graph first (only if Weaviate is reachable, skip on Vercel)
    const isRemote = !WEAVIATE_URL.includes('localhost')
    if (isRemote) {
      try {
        const result = await buildVectorGraph(seeds, maxEdges)
        if (result.links.length > 0) {
          return NextResponse.json({ ...result, method: 'vector' })
        }
      } catch {
        // Vector search failed — fall back
      }
    }

    // Fallback to text-based connections
    const result = buildFallbackGraph(seeds)
    return NextResponse.json({ ...result, method: 'fallback' })
  } catch (err) {
    return NextResponse.json({ nodes: [], links: [], error: String(err) }, { status: 500 })
  }
}
