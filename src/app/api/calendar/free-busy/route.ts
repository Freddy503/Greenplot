import { NextResponse } from 'next/server'

const BACKEND = 'https://api.greenplot.ink'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  const body = await req.json()
  try {
    const res = await fetch(`${BACKEND}/api/v1/calendar/free-busy`, {
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
    return NextResponse.json({ busy: [], connected: false }, { status: 502 })
  }
}
