import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const body = await req.json()

  if (!body.topic?.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }

  try {
    const res = await fetch(`${BACKEND}/api/v1/agents/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify({ topic: body.topic }),
      signal: AbortSignal.timeout(15000),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: `Backend unreachable: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
