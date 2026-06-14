import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

// Catch-all proxy for canvas sharing: forwards /api/canvas/* → backend
// /api/v1/canvas/* with the caller's JWT. Access is enforced server-side.
async function proxy(req: NextRequest, path: string[]) {
  const auth = req.headers.get('authorization') || ''
  const url = `${BACKEND}/api/v1/canvas/${path.join('/')}${req.nextUrl.search}`
  const init: RequestInit = {
    method: req.method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    signal: AbortSignal.timeout(20000),
  }
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const body = await req.text()
    if (body) (init as RequestInit & { body?: string }).body = body
  }
  try {
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
