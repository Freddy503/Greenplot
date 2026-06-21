import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

function authHeaders(req: NextRequest): Record<string, string> {
  const token = req.headers.get('authorization') || ''
  return token ? { Authorization: token } : {}
}

async function readJson(res: Response) {
  return res.json().catch(() => null)
}

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND}/api/v1/wiki/from-garden`, {
      headers: authHeaders(req),
      signal: AbortSignal.timeout(15000),
    })
    const data = await readJson(res)
    return NextResponse.json(data || { topics: [], summary: {} }, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable', topics: [], summary: {} }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const action = body.action === 'approve' ? 'approve' : 'preview'
  const { action: _action, ...payload } = body

  try {
    const res = await fetch(`${BACKEND}/api/v1/wiki/from-garden/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders(req) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    })
    const data = await readJson(res)
    return NextResponse.json(data || { error: 'Empty backend response' }, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
