import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''

  try {
    const res = await fetch(`${BACKEND}/api/v1/wiki/from-garden`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable', topics: [], summary: {} }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const body = await req.json().catch(() => ({}))
  const action = body?.action === 'approve' ? 'approve' : 'preview'
  const payload = { ...body }
  delete payload.action

  try {
    if (action === 'approve') {
      const res = await fetch(`${BACKEND}/api/v1/wiki/from-garden/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }

    const res = await fetch(`${BACKEND}/api/v1/wiki/from-garden/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
