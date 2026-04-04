import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/api/v1/activity/summary`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Backend error' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[activity/summary]', err)
    return NextResponse.json({ error: 'Failed to fetch activity summary' }, { status: 500 })
  }
}
