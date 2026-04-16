import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  const { searchParams } = new URL(req.url)
  const hours = searchParams.get('hours') || '24'
  try {
    const res = await fetch(`${BACKEND}/api/v1/calendar/events?hours=${hours}`, {
      headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ events: [], connected: false }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  const body = await req.json()
  try {
    const res = await fetch(`${BACKEND}/api/v1/calendar/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
