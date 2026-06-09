import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') || ''

  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND}/api/v1/papers/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })

    if (res.status === 404) {
      return NextResponse.json({ error: 'Paper ingestion not available yet — backend update pending' }, { status: 404 })
    }
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
