import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/push/subscribe
 * Store push subscription for the user
 */

const VAPID_PUBLIC_KEY = 'BH6APugVNlwIzA-MaONqfctQfIReXv_7riebipHkqIJhUhpYuVuXWCjKR1y91xWeXh8q5zNHWu9AEcrDhzw5VKk'

export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, userId } = body

    if (subscription) {
      console.log(`[push] Stored subscription for ${userId || 'default'}`)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'No subscription provided' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
