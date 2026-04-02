import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') || ''

  try {
    const formData = await req.formData()

    const res = await fetch(`${BACKEND}/api/v1/ingest/voice`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: token } : {}),
      },
      body: formData as any,
      signal: AbortSignal.timeout(30000),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: `Voice endpoint failed: ${(err as Error).message}` },
      { status: 502 }
    )
  }
}
