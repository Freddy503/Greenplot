import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/profile`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 502 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const authHeader = req.headers.get('authorization') || ''
    
    const res = await fetch(`${BACKEND}/api/v1/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 502 })
  }
}
