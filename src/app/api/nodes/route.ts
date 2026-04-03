import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const params = searchParams.toString()

  try {
    const res = await fetch(`${BACKEND}/api/v1/nodes${params ? `?${params}` : ''}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ nodes: [], total: 0, error: 'Backend unreachable' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const body = await req.json()

  // Route to search or create based on body
  const endpoint = body.query ? '/api/v1/nodes/search' : '/api/v1/nodes'

  try {
    const res = await fetch(`${BACKEND}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
