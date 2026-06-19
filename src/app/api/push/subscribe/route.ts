import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_KEY
  if (!publicKey) {
    return NextResponse.json({ error: 'Push notifications are not configured' }, { status: 503 })
  }
  return NextResponse.json({ publicKey })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, userId } = body
    const token = req.headers.get('authorization') || ''

    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'No subscription endpoint' }, { status: 400 })
    }

    // Forward to backend so the subscription can actually receive pushes.
    try {
      const res = await fetch(`${BACKEND}/api/v1/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify({ subscription, userId }),
        signal: AbortSignal.timeout(5000),
      })
      
      if (res.ok) {
        return NextResponse.json({ success: true })
      }

      const text = await res.text()
      return NextResponse.json(
        { error: text || 'Backend rejected push subscription' },
        { status: res.status }
      )
    } catch (err) {
      console.error('[push] Backend unreachable:', err)
      return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
