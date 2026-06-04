import { NextResponse } from 'next/server'

/**
 * GET /api/push/notifications
 *
 * Polls backend for unread notifications. Deduplicates by stable ID.
 * Single delivery path: backend push_notifications.json → this route → pollNotifications().
 * Web Push (service worker) is the other independent path — no bridge between them.
 */

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/push/notifications`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) {
      const data = await res.json()
      const notifications = (data.notifications || [])
        .filter((n: any) => !n.read)
        .map((n: any) => ({
          // Stable ID for dedup — falls back to title+minute if backend is old
          id: n.id || `${n.title}_${new Date(n.timestamp).toISOString().slice(0, 16)}`,
          title: n.title,
          body: n.body || '',
          url: n.url || '/chat',
          timestamp: new Date(n.timestamp).getTime(),
          ...(n.briefing ? { briefing: n.briefing } : {}),
        }))

      // Dedup by stable ID
      const seen = new Set<string>()
      const merged = notifications.filter((n: any) => {
        if (seen.has(n.id)) return false
        seen.add(n.id)
        return true
      })

      // Mark backend notifications as read — await so next poll doesn't re-deliver
      try {
        await fetch(`${BACKEND}/api/v1/push/mark-read`, {
          method: 'POST',
          headers: authHeader ? { Authorization: authHeader } : {},
          signal: AbortSignal.timeout(3000),
        })
      } catch (err) {
        console.warn('[push] mark-read failed:', err)
      }

      return NextResponse.json({ notifications: merged })
    }
  } catch (err) {
    console.error('[push] Backend unreachable:', err)
  }

  return NextResponse.json({ notifications: [] })
}

// DELETE /api/push/notifications — clear all
export async function DELETE(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/push/notifications`, {
      method: 'DELETE',
      headers: authHeader ? { Authorization: authHeader } : {},
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false }, { status: 502 })
  }
}
