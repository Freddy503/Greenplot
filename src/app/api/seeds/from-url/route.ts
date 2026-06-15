import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// Ingest a URL (article / paper / YouTube) into the garden.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const body = await req.text()
  try {
    const res = await fetch(`${BACKEND}/api/v1/seeds/from-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
      body,
      signal: AbortSignal.timeout(30000),
    })
    const data = await res.json().catch(() => ({ error: 'bad response' }))
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
