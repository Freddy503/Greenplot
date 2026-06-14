import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// Forward the multipart upload (PDF binary) straight through to the backend.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  const contentType = req.headers.get('content-type') || ''
  try {
    const body = await req.arrayBuffer()
    const res = await fetch(`${BACKEND}/api/v1/papers/upload`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: token } : {}), 'Content-Type': contentType },
      body,
      signal: AbortSignal.timeout(120000),
    })
    const data = await res.json().catch(() => ({ error: 'bad response' }))
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
