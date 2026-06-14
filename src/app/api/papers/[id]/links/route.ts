import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// "Links to your garden" for a paper: related seeds + papers by similarity.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/papers/${id}/links`, {
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(30000),
    })
    const data = await res.json().catch(() => ({ related_seeds: [], papers: [], wiki_articles: [] }))
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
