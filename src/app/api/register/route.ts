import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  const body = await req.json()

  try {
    const res = await fetch(`${apiUrl}/api/v1/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { detail: `Cannot reach backend: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
