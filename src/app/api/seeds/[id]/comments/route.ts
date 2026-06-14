import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/seeds/${id}/comments${req.nextUrl.search}`, {
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(15000),
    })
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = req.headers.get('authorization') || ''
  const body = await req.text()
  try {
    const res = await fetch(`${BACKEND}/api/v1/seeds/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
      body,
      signal: AbortSignal.timeout(15000),
    })
    return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
