import { NextResponse } from 'next/server'

/**
 * GET /api/push/notifications
 * 
 * Returns pending push notifications for the PWA.
 * Sources: in-memory cache + backend persistent store.
 */

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// In-memory fallback (fast, but lost on restart)
let cached: Array<{ title: string; body: string; url: string; timestamp: number }> = []

export async function GET() {
  try {
    // Also fetch from backend persistent store
    const res = await fetch(`${BACKEND}/api/v1/push/notifications`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json()
      const backendNotifs = (data.notifications || []).map((n: any) => ({
        title: n.title,
        body: n.body || '',
        url: n.url || '/chat',
        timestamp: new Date(n.timestamp).getTime(),
      }))

      // Merge: backend + in-memory, deduplicate by timestamp+title
      const all = [...backendNotifs, ...cached]
      const seen = new Set()
      const merged = all.filter(n => {
        const key = `${n.timestamp}-${n.title}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Clear in-memory after returning
      cached = []

      // Mark backend notifications as read
      try {
        await fetch(`${BACKEND}/api/v1/push/mark-read`, {
          method: 'POST',
          signal: AbortSignal.timeout(2000),
        })
      } catch {}

      return NextResponse.json({ notifications: merged })
    }
  } catch (err) {
    console.error('[push] Backend unreachable, using in-memory:', err)
  }

  // Fallback: return in-memory only
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
