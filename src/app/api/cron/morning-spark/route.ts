import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'
const CRON_SECRET = process.env.CRON_SECRET || ''
const HARVEST_API_KEY = process.env.HARVEST_API_KEY || ''

export async function GET(req: Request) {
  // Vercel sets this header automatically using CRON_SECRET
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'Cron secret is not configured' }, { status: 503 })
  }

  if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Use API key — no user credentials, scales to all users server-side
    const res = await fetch(`${BACKEND}/api/v1/admin/trigger/morning_spark`, {
      method: 'POST',
      headers: { 'X-API-Key': HARVEST_API_KEY },
      signal: AbortSignal.timeout(55000),
    })
    const data = await res.json()
    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
