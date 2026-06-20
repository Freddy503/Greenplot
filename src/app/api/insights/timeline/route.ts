import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''

  try {
    const res = await fetch(`${BACKEND}/api/v1/insights/timeline`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable', events: [], rising_topics: [], activity: [], summary: {} }, { status: 503 })
  }
}
