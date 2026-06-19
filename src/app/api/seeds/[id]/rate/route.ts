import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = req.headers.get('authorization') || ''
  const body = await req.json()
  const score = Number(body.score ?? body.rating)

  try {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return NextResponse.json({ error: 'score must be an integer from 1 to 5' }, { status: 400 })
    }

    const res = await fetch(`${BACKEND}/api/v1/ratings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify({
        message_id: id,
        score,
        consent: body.consent ?? true,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
