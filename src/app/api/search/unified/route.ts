import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

interface UnifiedResult {
  id: string
  type: 'seed' | 'link' | 'wiki'
  title: string
  summary: string
  score?: number
  domain?: string
  url?: string
  created_at?: string
}

// ── Search each source ──────────────────────────────────

async function searchSeeds(query: string, token: string): Promise<UnifiedResult[]> {
  try {
    const res = await fetch(`${BACKEND}/api/v1/seeds/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify({ query, limit: 5 }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.seeds || []).map((s: any) => ({
      id: s.id || s.notion_id || '',
      type: 'seed' as const,
      title: s.title || s.content?.split('\n')[0]?.slice(0, 60) || 'Untitled seed',
      summary: s.metadata?.summary || s.content?.slice(0, 150) || '',
      score: s.score,
      domain: s.metadata?.domain || '',
      created_at: s.created_at || '',
    }))
  } catch {
    return []
  }
}

async function searchLinks(query: string, token: string): Promise<UnifiedResult[]> {
  try {
    const res = await fetch(`${BACKEND}/api/v1/links`, {
      headers: {
        ...(token ? { Authorization: token } : {}),
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = await res.json()
    const q = query.toLowerCase()
    return (data.links || [])
      .filter((l: any) => {
        const text = `${l.title || ''} ${l.summary || ''} ${l.domain || ''} ${l.tags?.join(' ') || ''}`.toLowerCase()
        return q.split(/\s+/).some((w: string) => text.includes(w))
      })
      .slice(0, 5)
      .map((l: any) => ({
        id: l.id,
        type: 'link' as const,
        title: l.title || l.url,
        summary: l.summary || l.domain || '',
        domain: l.domain || '',
        url: l.url,
        created_at: l.added_at || l.created_at || '',
      }))
  } catch {
    return []
  }
}

async function searchWiki(query: string, token: string): Promise<UnifiedResult[]> {
  try {
    const res = await fetch(`${BACKEND}/api/v1/wiki`, {
      headers: {
        ...(token ? { Authorization: token } : {}),
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const data = await res.json()
    const q = query.toLowerCase()
    return (data.articles || [])
      .filter((a: any) => {
        const text = `${a.title || ''} ${a.content || ''} ${a.category || ''}`.toLowerCase()
        return q.split(/\s+/).some((w: string) => text.includes(w))
      })
      .slice(0, 5)
      .map((a: any) => ({
        id: a.id,
        type: 'wiki' as const,
        title: a.title,
        summary: a.content?.replace(/[#*_`]/g, '').slice(0, 150) || '',
        domain: a.category || '',
        created_at: a.updated_at || a.created_at || '',
      }))
  } catch {
    return []
  }
}

// ── Route handler ───────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { query, limit = 10 } = await req.json()
    const token = req.headers.get('authorization') || ''

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return NextResponse.json({ results: [], total: 0 })
    }

    // Search all three sources in parallel
    const [seeds, links, wiki] = await Promise.all([
      searchSeeds(query, token),
      searchLinks(query, token),
      searchWiki(query, token),
    ])

    // Merge and rank — seeds first (most relevant via vector search), then links, then wiki
    const allResults: UnifiedResult[] = [
      ...seeds.map(s => ({ ...s, score: s.score ?? 0.8 })),
      ...links.map(l => ({ ...l, score: 0.6 })),
      ...wiki.map(w => ({ ...w, score: 0.5 })),
    ].slice(0, limit)

    return NextResponse.json({
      results: allResults,
      total: allResults.length,
      breakdown: {
        seeds: seeds.length,
        links: links.length,
        wiki: wiki.length,
      },
    })
  } catch (err) {
    return NextResponse.json({ results: [], total: 0, error: String(err) }, { status: 500 })
  }
}
