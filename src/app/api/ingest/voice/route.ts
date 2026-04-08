import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120 // seconds — Vercel function timeout
export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
}

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
      signal: AbortSignal.timeout(120000),
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
