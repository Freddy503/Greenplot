import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// One LLM call (~5-15s incl. thinking) — keep the function alive past Vercel's default
export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = req.headers.get('authorization') || ''

  try {
    const res = await fetch(`${BACKEND}/api/v1/specs/${id}/diagram-code`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(55000),
    })

    if (res.status === 404) {
      return NextResponse.json({ error: 'Diagram service not available yet — backend update pending' }, { status: 404 })
    }
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Diagram generation timed out or backend unreachable' }, { status: 503 })
  }
}
