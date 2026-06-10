import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = req.headers.get('authorization') || ''
  const replace = req.nextUrl.searchParams.get('replace')
  const qs = replace ? `?replace=${encodeURIComponent(replace)}` : ''

  try {
    // One full PRD generation call — allow up to 60s
    const res = await fetch(`${BACKEND}/api/v1/papers/${id}/draft-prd${qs}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(60000),
    })

    if (res.status === 404) {
      return NextResponse.json({ error: 'Draft-PRD service not available yet — backend update pending' }, { status: 404 })
    }
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Draft generation timed out or backend unreachable' }, { status: 503 })
  }
}
