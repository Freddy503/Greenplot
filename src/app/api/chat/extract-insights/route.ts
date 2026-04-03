import { NextResponse } from 'next/server'

const BACKEND = 'https://api.greenplot.ink'

export async function POST(req: Request) {
  const body = await req.json()
  const authHeader = req.headers.get('authorization') || ''

  try {
    const res = await fetch(`${BACKEND}/api/v1/chat/extract-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { detail: `Backend unreachable: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
