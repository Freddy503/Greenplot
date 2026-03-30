import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const apiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://178.104.67.139:8001'
  const body = await req.json()
  const authHeader = req.headers.get('authorization') || ''

  try {
    const res = await fetch(`${apiUrl}/api/v1/thoughts`, {
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
    return NextResponse.json(
      { detail: `Cannot reach backend: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
