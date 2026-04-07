import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/schedule`, {
      headers: token ? { Authorization: token } : {},
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return NextResponse.json({ jobs: [] })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ jobs: [] })
  }
}

export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const body = await req.json()
  try {
    const res = await fetch(`${BACKEND}/api/v1/schedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
