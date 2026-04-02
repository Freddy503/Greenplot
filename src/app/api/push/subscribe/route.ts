import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/push/subscribe
 * Store push subscription for the user
 * 
 * POST /api/push/send
 * Send a push notification to a stored subscription
 */

// In-memory store for push subscriptions (per serverless instance)
const subscriptions = new Map<string, PushSubscriptionJSON>()

const VAPID_PUBLIC_KEY = 'BH6APugVNlwIzA-MaONqfctQfIReXv_7riebipHkqIJhUhpYuVuXWCjKR1y91xWeXh8q5zNHWu9AEcrDhzw5VKk'

export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, userId } = body

    if (subscription) {
      // Store subscription
      const key = userId || 'default'
      subscriptions.set(key, subscription)
      console.log(`[push] Stored subscription for ${key}`)
      return NextResponse.json({ success: true })
    }

    // Send notification
    if (body.send && body.title) {
      const webpush = require('web-push')
      webpush.setVapidDetails(
        'mailto:freddy@greenplot.ink',
        VAPID_PUBLIC_KEY,
        '5Z4EV7lstzQx-R8rFTrk_r3mIBvZStKXTpV-XdMrSZ0'
      )

      const sub = subscriptions.get(body.userId || 'default')
      if (!sub) {
        return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
      }

      await webpush.sendNotification(
        sub as any,
        JSON.stringify({
          title: body.title,
          body: body.body || '',
          url: body.url || '/',
          tag: body.tag,
        })
      )

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
