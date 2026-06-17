import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function POST(req: NextRequest, ctx: { params: Promise<{ seedId: string }> }) {
  const { seedId } = await ctx.params
  const authHeader = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/research/brief/${encodeURIComponent(seedId)}/deeper`, {
      method: 'POST',
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(20000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
