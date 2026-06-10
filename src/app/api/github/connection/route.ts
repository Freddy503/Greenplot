import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/github/connection`, {
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ connected: false, error: 'Backend unreachable' }, { status: 503 })
  }
}

export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/github/connection`, {
      method: 'DELETE',
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
