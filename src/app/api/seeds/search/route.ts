import { NextRequest, NextResponse } from 'next/server'

// Weaviate is reachable from Vercel only if tunneled.
// For now, this route proxies BM25 search to Weaviate via the backend.
const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'
const WEAVIATE_URL = process.env.WEAVIATE_URL || 'http://localhost:8080'

interface WeaviateSeed {
  title?: string | null
  domain?: string | null
  tags?: string | null
  summary?: string | null
  energy?: string | null
  text?: string | null
  _additional?: { score?: string | number | null }
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

async function searchWeaviate(query: string, limit: number): Promise<WeaviateSeed[]> {
  // Try Weaviate directly first (works when tunnel is up)
  const gql = `{ Get { IdeaSeed(bm25: { query: ${JSON.stringify(query)}, properties: ["title", "summary", "tags", "domain", "text"] } limit: ${limit}) { title domain tags energy summary text _additional { score } } } }`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${WEAVIATE_URL}/v1/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gql }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`Weaviate ${res.status}`)
    const data = await res.json()
    return data?.data?.Get?.IdeaSeed || []
  } catch {
    // Fallback: use backend seeds endpoint with query param
    try {
      const res = await fetch(
        `${BACKEND}/api/v1/seeds?query=${encodeURIComponent(query)}&limit=${limit}`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (!res.ok) return []
      const data = await res.json()
      const seeds = data.seeds || data || []
      return Array.isArray(seeds) ? seeds : []
    } catch {
      return []
    }
  }
}

function buildGardenContext(seeds: WeaviateSeed[]): string {
  if (seeds.length === 0) return ''

  const entries = seeds
    .filter(s => s.title || s.summary)
    .slice(0, 3)
    .map(s => {
      const title = safeStr(s.title, 'Untitled seed')
      const domain = safeStr(s.domain)
      const summary = safeStr(s.summary)
      const tags = safeStr(s.tags)

      let entry = `- **${title}**`
      if (domain) entry += ` [${domain}]`
      if (summary) entry += `: ${summary.slice(0, 200)}`
      else if (s.text) entry += `: ${safeStr(s.text).slice(0, 200)}`
      if (tags) entry += ` (${tags})`
      return entry
    })

  if (entries.length === 0) return ''

  return [
    '---',
    '🌱 **From your Garden** (relevant seeds from your knowledge base):',
    ...entries,
    'Use these insights from your garden to enrich your response. Reference them naturally.',
    '---',
  ].join('\n')
}

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 3 } = await req.json()

    if (!query || typeof query !== 'string' || query.length < 5) {
      return NextResponse.json({ context: '', seeds: [] })
    }

    const seeds = await searchWeaviate(query, Math.min(limit, 5))
    const context = buildGardenContext(seeds)

    return NextResponse.json({
      context,
      seeds: seeds.map(s => ({
        title: safeStr(s.title),
        domain: safeStr(s.domain),
        summary: safeStr(s.summary, safeStr(s.text)).slice(0, 150),
      })).filter(s => s.title),
    })
  } catch (err) {
    return NextResponse.json({ context: '', seeds: [], error: String(err) }, { status: 500 })
  }
}
