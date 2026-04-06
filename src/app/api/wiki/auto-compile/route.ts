import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function POST(_req: NextRequest) {
  const apiKey = process.env.HARVEST_API_KEY
  if (!apiKey) {
    console.error('[wiki/auto-compile] HARVEST_API_KEY env var not set')
    return NextResponse.json({ error: 'Server misconfiguration', compiled: 0 }, { status: 503 })
  }
  try {
    const res = await fetch(`${BACKEND}/api/v1/wiki/auto-compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      signal: AbortSignal.timeout(60000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable', compiled: 0 }, { status: 503 })
  }
}
