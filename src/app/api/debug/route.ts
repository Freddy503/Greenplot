import { NextRequest, NextResponse } from 'next/server'

/**
 * Debug endpoint — only available in non-production or with a valid auth header.
 * Exposes backend connectivity info for troubleshooting.
 */
export async function GET(req: NextRequest) {
  // Not available in production at all — this endpoint is for local dev only
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const backend = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

  let backendStatus = 'unknown'
  let backendError = ''
  try {
    const res = await fetch(`${backend}/api/v1/chat/v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(5000),
    })
    backendStatus = res.ok ? 'ok' : `error ${res.status}`
    if (!res.ok) backendError = await res.text().then(t => t.slice(0, 200))
  } catch (err) {
    backendStatus = 'unreachable'
    backendError = err instanceof Error ? err.message : String(err)
  }

  return Response.json({
    backend_url: backend,
    backend_status: backendStatus,
    backend_error: backendError,
    node_env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  })
}
