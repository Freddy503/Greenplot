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
    const seeds = data.seeds || []

    // If no seeds from backend (Postgres empty), try Weaviate search
    if (seeds.length === 0 && !query) {
      try {
        const searchRes = await fetch(`${BACKEND}/api/v1/seeds?query=knowledge+ideas+project&limit=${limit}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: token } : {}),
          },
          signal: AbortSignal.timeout(8000),
        })
        if (searchRes.ok) {
          const searchData = await searchRes.json()
          const searchSeeds = searchData.seeds || []
          if (searchSeeds.length > 0) {
            return NextResponse.json({ seeds: searchSeeds, total: searchSeeds.length, source: 'weaviate' })
          }
        }
      } catch {}
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ seeds: [], error: 'Backend unreachable' }, { status: 503 })
  }
}

// POST: Create a seed via the thoughts endpoint (backend creates seeds through thoughts)
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const body = await req.json()

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
