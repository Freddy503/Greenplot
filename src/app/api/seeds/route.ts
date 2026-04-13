import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('query') || ''
  const limit = searchParams.get('limit') || '200'

  // If no query, omit it so backend returns recent seeds from Postgres with real timestamps
  // (Weaviate path sets created_at=utcnow() which breaks date display)
  const url = query
    ? `${BACKEND}/api/v1/seeds?query=${encodeURIComponent(query)}&limit=${limit}`
    : `${BACKEND}/api/v1/seeds?limit=${limit}`

  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ seeds: [], error: 'Backend unreachable' }, { status: 503 })
  }
}

// POST: Create seeds — supports both single (via thoughts) and bulk (via seeds/bulk)
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const body = await req.json()

  // Bulk seed creation (from harvest)
  if (body.seeds && Array.isArray(body.seeds)) {
    try {
      const res = await fetch(`${BACKEND}/api/v1/seeds/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ seeds: body.seeds }),
        signal: AbortSignal.timeout(15000),
      })

      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    } catch (err) {
      return NextResponse.json(
        { detail: `Backend unreachable: ${(err as Error).message}` },
        { status: 502 }
      )
    }
  }

  // Single seed via thoughts endpoint
  try {
    const res = await fetch(`${BACKEND}/api/v1/thoughts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { detail: `Backend unreachable: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
