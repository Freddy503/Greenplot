import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/push/send
 * 
 * Send a push notification to a subscription.
 * Used by cron jobs to deliver notifications to the PWA.
 * 
 * Body: { subscription, title, body, url?, tag? }
 */

const VAPID_PUBLIC_KEY = 'BH6APugVNlwIzA-MaONqfctQfIReXv_7riebipHkqIJhUhpYuVuXWCjKR1y91xWeXh8q5zNHWu9AEcrDhzw5VKk'
const VAPID_PRIVATE_KEY = '5Z4EV7lstzQx-R8rFTrk_r3mIBvZStKXTpV-XdMrSZ0'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, title, body: notifBody, url, tag } = body

    if (!subscription || !title) {
      return NextResponse.json({ error: 'subscription and title required' }, { status: 400 })
    }

    // Dynamic import to avoid build issues
    const webpush = await import('web-push')
    webpush.setVapidDetails(
      'mailto:freddy@greenplot.ink',
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    )

    await webpush.sendNotification(
      subscription as any,
      JSON.stringify({
        title,
        body: notifBody || '',
        url: url || '/',
        tag: tag || 'greenplot',
      })
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    // If subscription expired, return 410 so client can re-subscribe
    if (err?.statusCode === 410) {
      return NextResponse.json({ error: 'Subscription expired', code: 410 }, { status: 410 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
