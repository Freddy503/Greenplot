import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/seeds/graph
 * 
 * Returns seed graph data with multi-signal edges:
 * 1. PostgreSQL SeedLinks (backlinks from enrichment pipeline) — strongest
 * 2. Weaviate vector similarity via nearVector — medium
 * 3. Content word overlap + domain matching — fallback
 * 
 * Body: { seeds: [{id, title, text, domain}], maxEdges?: number }
 * Returns: { nodes, links, method }
 */

const WEAVIATE_URL = process.env.WEAVIATE_URL || 'http://localhost:8080'
const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8001'

interface SeedNode {
  id: string
  title: string
  text: string
  domain: string
}

interface GraphEdge {
  source: string
  target: string
  strength: number // 0-1 based on connection quality
  linkType?: string // similar, builds_on, contradicts, related, part_of
}

// ── Signal 1: PostgreSQL SeedLinks (backlinks) ──────────────────────────

async function fetchDatabaseLinks(seedIds: string[], authHeader: string | null): Promise<GraphEdge[]> {
  if (!authHeader) return []
  try {
    const res = await fetch(`${API_URL}/api/v1/seeds/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ seed_ids: seedIds }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.links || []).map((l: Record<string, unknown>) => ({
      source: l.source_seed_id,
      target: l.target_seed_id,
      strength: Math.min(((l.confidence as number) || 700) / 1000, 1),
      linkType: l.link_type as string || 'related',
    }))
  } catch {
    return []
  }
}

// ── Signal 2: Weaviate vector similarity (nearVector per seed) ───────────

async function buildVectorGraph(seeds: SeedNode[], maxEdges: number): Promise<GraphEdge[]> {
  const links: GraphEdge[] = []
  const linkSet = new Set<string>()
  const seedById = new Map(seeds.map(s => [s.id, s]))

  // Build a lookup: weaviate_id → our seed id
  // Query Weaviate for each seed's nearVector neighbors using title+text
  const batchSize = 3
  for (let i = 0; i < seeds.length; i += batchSize) {
    const batch = seeds.slice(i, i + batchSize)

    for (const seed of batch) {
      if (linkSet.size >= maxEdges) break

      // Use full title + text snippet for better nearText matching
      const concept = `${seed.title}. ${(seed.text || '').slice(0, 200)}`.replace(/"/g, '\\"').slice(0, 300)

      const gql = `{
        Get {
          IdeaSeed(
            nearText: { concepts: ["${concept}"] certainty: 0.7 }
            limit: 5
          ) {
            title
            domain
            tags
            _additional { id certainty }
          }
        }
      }`

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
          const wvId = neighbor._additional?.id || ''
          const certainty = neighbor._additional?.certainty || 0

          // Match by Weaviate UUID if we have it, otherwise by title
          let targetSeed: SeedNode | undefined
          for (const s of seeds) {
            if (s.id === wvId || s.id === wvId.slice(0, 8)) {
              targetSeed = s
              break
            }
          }
          // Fallback: match by normalized title
          if (!targetSeed) {
            const neighborTitleNorm = (neighbor.title || '').toLowerCase().trim()
            targetSeed = seeds.find(s => s.title.toLowerCase().trim() === neighborTitleNorm)
          }
          if (!targetSeed || targetSeed.id === seed.id) continue

          const key = [seed.id, targetSeed.id].sort().join('-')
          if (linkSet.has(key)) continue

          linkSet.add(key)
          links.push({
            source: seed.id,
            target: targetSeed.id,
            strength: Math.max(certainty, 0.3),
            linkType: 'similar',
          })
        }
      } catch {
        // nearText unavailable — skip this seed
      }
    }
  }

  return links
}

// ── Signal 3: Text-based fallback (domain + word overlap) ────────────────

const STOPWORDS = new Set([
  'insight', 'insights', 'idea', 'ideas', 'note', 'notes', 'thought', 'thoughts',
  'this', 'that', 'with', 'from', 'have', 'will', 'been', 'more', 'into', 'also',
  'when', 'what', 'which', 'there', 'their', 'they', 'then', 'than', 'your',
  'about', 'after', 'before', 'would', 'could', 'should', 'these', 'those',
])

function meaningfulWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().split(/[\s,.:;!?()\[\]"']+/)
      .filter(w => w.length > 4 && !STOPWORDS.has(w))
  )
}

function buildFallbackGraph(seeds: SeedNode[]): GraphEdge[] {
  const links: GraphEdge[] = []
  const linkSet = new Set<string>()

  // Domain connections
  for (let i = 0; i < seeds.length; i++) {
    const tagsA = (seeds[i].domain || '').toLowerCase().split(',').map(t => t.trim()).filter(w => w.length > 2)
    for (let j = i + 1; j < seeds.length; j++) {
      const tagsB = (seeds[j].domain || '').toLowerCase().split(',').map(t => t.trim()).filter(w => w.length > 2)
      const shared = tagsA.filter(t => tagsB.includes(t))
      if (shared.length > 0) {
        const key = [seeds[i].id, seeds[j].id].sort().join('-')
        if (!linkSet.has(key)) {
          linkSet.add(key)
          links.push({ source: seeds[i].id, target: seeds[j].id, strength: Math.min(shared.length / 3, 0.7), linkType: 'related' })
        }
      }
    }
  }

  // Content word overlap (title + first 400 chars of text)
  for (let i = 0; i < seeds.length; i++) {
    const contentA = `${seeds[i].title} ${(seeds[i].text || '').slice(0, 400)}`
    const wordsA = meaningfulWords(contentA)
    for (let j = i + 1; j < seeds.length; j++) {
      const contentB = `${seeds[j].title} ${(seeds[j].text || '').slice(0, 400)}`
      const wordsB = meaningfulWords(contentB)
      const shared = [...wordsA].filter(w => wordsB.has(w))
      if (shared.length >= 2) {
        const key = [seeds[i].id, seeds[j].id].sort().join('-')
        if (!linkSet.has(key)) {
          linkSet.add(key)
          links.push({ source: seeds[i].id, target: seeds[j].id, strength: Math.min(shared.length / 8, 0.5), linkType: 'similar' })
        }
      }
    }
  }

  // NO sequential fallback — empty graph is better than fake connections

  return links
}

// ── Main handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const seeds: SeedNode[] = body.seeds || []
    const maxEdges = body.maxEdges || 150

    if (seeds.length < 2) {
      return NextResponse.json({ nodes: seeds, links: [], method: 'none' })
    }

    const allLinks: GraphEdge[] = []
    const linkSet = new Set<string>()

    function addLinks(newLinks: GraphEdge[], source: string) {
      for (const l of newLinks) {
        const key = [l.source, l.target].sort().join('-')
        if (!linkSet.has(key)) {
          linkSet.add(key)
          allLinks.push(l)
        }
      }
    }

    // 1. Try database backlinks first (strongest signal)
    const seedIds = seeds.map(s => s.id)
    const dbLinks = await fetchDatabaseLinks(seedIds, req.headers.get('authorization'))
    addLinks(dbLinks, 'database')

    // 2. Try Weaviate vector similarity
    const isLocal = WEAVIATE_URL.includes('localhost')
    if (isLocal || allLinks.length < seeds.length) {
      try {
        const vecLinks = await buildVectorGraph(seeds, maxEdges - allLinks.length)
        addLinks(vecLinks, 'vector')
      } catch {
        // Vector search failed — continue
      }
    }

    // 3. Fallback to text-based connections if still sparse
    if (allLinks.length < seeds.length * 0.5) {
      const fallbackLinks = buildFallbackGraph(seeds)
      addLinks(fallbackLinks, 'fallback')
    }

    // Determine primary method for display
    let method = 'fallback'
    if (dbLinks.length > 0) method = 'backlinks'
    else if (allLinks.length > 0 && linkSet.size > seeds.length * 0.3) method = 'vector'

    return NextResponse.json({ nodes: seeds, links: allLinks, method })
  } catch (err) {
    return NextResponse.json({ nodes: [], links: [], error: String(err) }, { status: 500 })
  }
}
