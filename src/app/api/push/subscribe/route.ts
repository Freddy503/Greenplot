import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || 'BH6APugVNlwIzA-MaONqfctQfIReXv_7riebipHkqIJhUhpYuVuXWCjKR1y91xWeXh8q5zNHWu9AEcrDhzw5VKk'

export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, userId } = body
    const token = req.headers.get('authorization') || ''

    if (subscription) {
      // Save subscription via dedicated backend endpoint (not thoughts/Weaviate)
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
        if (!res.ok) {
          console.error('[push] Backend subscribe failed:', res.status)
        }
      } catch (err) {
        console.error('[push] Backend unreachable:', err)
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'No subscription provided' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
