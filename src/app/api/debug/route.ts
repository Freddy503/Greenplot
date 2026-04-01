export async function GET() {
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
