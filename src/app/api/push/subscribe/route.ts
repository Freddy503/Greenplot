import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'
const VAPID_PUBLIC_KEY = 'BH6APugVNlwIzA-MaONqfctQfIReXv_7riebipHkqIJhUhpYuVuXWCjKR1y91xWeXh8q5zNHWu9AEcrDhzw5VKk'

export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, userId } = body

    if (subscription) {
      // Save subscription to server via backend (writes to file)
      try {
        await fetch(`${BACKEND}/api/v1/thoughts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: JSON.stringify({ type: 'push_subscription', subscription, userId }),
            source: 'push_register',
          }),
        })
      } catch {}
      
      console.log(`[push] Registered subscription for ${userId || 'default'}`)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'No subscription provided' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
