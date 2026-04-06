import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization') || ''

  try {
    const res = await fetch(`${BACKEND}/api/v1/activity/summary`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      console.error('[activity] Backend returned:', res.status)
      return NextResponse.json({ activities: [] }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[activity] Fetch failed:', err)
    return NextResponse.json({ activities: [] }, { status: 503 })
  }
}
