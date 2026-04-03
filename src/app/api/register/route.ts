import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function POST(req: Request) {
  const body = await req.json()

  try {
    const res = await fetch(`${BACKEND}/api/v1/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
