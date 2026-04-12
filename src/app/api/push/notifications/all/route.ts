import { NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/push/notifications?all=true`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data)
    }
  } catch {}
  return NextResponse.json({ notifications: [], total: 0 })
}
