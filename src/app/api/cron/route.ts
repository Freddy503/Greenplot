import { NextRequest, NextResponse } from 'next/server'

// Proxy to OpenClaw gateway for cron job management
// Requires OPENCLAW_GATEWAY_URL and OPENCLAW_GATEWAY_TOKEN env vars
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:3010'
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ''

export async function GET(_req: NextRequest) {
  if (!GATEWAY_TOKEN) {
    return NextResponse.json({ jobs: [], error: 'Gateway not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(`${GATEWAY_URL}/api/cron/jobs`, {
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ jobs: [], error: 'Gateway unreachable' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  if (!GATEWAY_TOKEN) {
    return NextResponse.json({ error: 'Gateway not configured' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const { action, jobId } = body

    if (action === 'run' && jobId) {
      const res = await fetch(`${GATEWAY_URL}/api/cron/jobs/${jobId}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }

    if (action === 'toggle' && jobId) {
      const res = await fetch(`${GATEWAY_URL}/api/cron/jobs/${jobId}/toggle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: body.enabled }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Gateway unreachable' }, { status: 503 })
  }
}
