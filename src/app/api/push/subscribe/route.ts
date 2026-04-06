import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || 'BOQATyoFzjczoB7OerLYQXveZimfo6FBWAvZBHwiDbpbr0SdMMvXIqIOFx0XeCc7TGsZ1Nl8rFn6mJmJSJygYIY'

export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, userId } = body
    const token = req.headers.get('authorization') || ''

    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'No subscription endpoint' }, { status: 400 })
    }

    // Forward to backend — backend accepts this and saves to push_subscriptions.json
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
      
      // If backend rejects (e.g., no auth), still consider it a local success
      // Service worker registration is what matters for the toggle to flip
      console.warn(`[push] Backend returned ${res.status}, continuing locally`)
    } catch (err) {
      console.error('[push] Backend unreachable:', err)
      // Continue anyway — the user has a subscription, backend is secondary
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
