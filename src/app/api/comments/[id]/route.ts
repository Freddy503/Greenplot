import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

async function forward(req: NextRequest, id: string, method: string) {
  const token = req.headers.get('authorization') || ''
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    signal: AbortSignal.timeout(15000),
  }
  if (method === 'PATCH') {
    const body = await req.text()
    if (body) (init as RequestInit & { body?: string }).body = body
  }
  try {
    const res = await fetch(`${BACKEND}/api/v1/comments/${id}`, init)
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return forward(req, (await params).id, 'PATCH')
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return forward(req, (await params).id, 'DELETE')
}
