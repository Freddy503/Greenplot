import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization') || ''

  try {
    const res = await fetch(`${BACKEND}/api/v1/graph`, {
      headers: { ...(token ? { Authorization: token } : {}) },
      // Semantic neighbor queries can take a moment on cold cache
      signal: AbortSignal.timeout(25000),
    })

    if (res.status === 404) {
      return NextResponse.json({ nodes: [], links: [], error: 'Graph service not available yet — backend update pending' }, { status: 404 })
    }
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ nodes: [], links: [], error: 'Backend unreachable' }, { status: 503 })
  }
}
