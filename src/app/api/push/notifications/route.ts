import { NextResponse } from 'next/server'

/**
 * GET /api/push/notifications
 * 
 * Returns pending push notifications for the PWA to display.
 * Cron jobs write to /root/.openclaw/workspace/data/push_notifications.json
 */

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// In-memory fallback
let cached: Array<{ title: string; body: string; url: string; timestamp: number }> = []

export async function GET() {
  try {
    // Try to read notifications from backend
    const res = await fetch(`${BACKEND}/api/v1/heartbeat`, {
      signal: AbortSignal.timeout(3000),
    })
    // Backend is reachable, but doesn't have notifications endpoint yet
  } catch {}

  // Return cached notifications and clear
  const pending = [...cached]
  cached = []
  return NextResponse.json({ notifications: pending })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (body.title) {
      cached.push({
        title: body.title,
        body: body.body || '',
        url: body.url || '/chat',
        timestamp: Date.now(),
      })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
