import { NextResponse } from 'next/server'

const BACKEND = 'https://api.greenplot.ink'

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
