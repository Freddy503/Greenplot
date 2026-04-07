import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'
const CRON_SECRET = process.env.CRON_SECRET || ''
const SERVICE_EMAIL = process.env.SERVICE_ACCOUNT_EMAIL || ''
const SERVICE_PASSWORD = process.env.SERVICE_ACCOUNT_PASSWORD || ''

export async function GET(req: Request) {
  // Vercel automatically sets authorization header with CRON_SECRET
  if (CRON_SECRET && req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Log in fresh to get a valid token
    const loginRes = await fetch(`${BACKEND}/api/v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: SERVICE_EMAIL, password: SERVICE_PASSWORD }),
      signal: AbortSignal.timeout(10000),
    })
    if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`)
    const { access_token } = await loginRes.json()

    // Trigger the job
    const res = await fetch(`${BACKEND}/api/v1/scheduler/trigger/morning_spark`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(55000),
    })
    const data = await res.json()
    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
