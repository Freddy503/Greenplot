import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('query') || ''
  const limit = searchParams.get('limit') || '50'

  const url = `${BACKEND}/api/v1/seeds?${new URLSearchParams({ limit, ...(query ? { query } : {}) })}`

  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    // Backend unreachable — return empty for graceful degradation
    return NextResponse.json({ seeds: [], error: 'Backend unreachable' }, { status: 503 })
  }
}
