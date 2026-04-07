import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'
const CRON_SECRET = process.env.CRON_SECRET || ''

export async function GET(req: Request) {
  // Verify Vercel cron secret
  if (CRON_SECRET && req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Use service account token or HARVEST_API_KEY to authenticate
    const token = process.env.SERVICE_ACCOUNT_TOKEN || ''
    const res = await fetch(`${BACKEND}/api/v1/scheduler/trigger/morning_spark`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(55000),
    })
    const data = await res.json()
    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
