import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get('limit') || '20'
  const hours = searchParams.get('hours') || '48'
  try {
    const res = await fetch(`${BACKEND}/api/v1/activity?limit=${limit}&hours=${hours}`, {
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 503 })
  }
}
