import { NextRequest, NextResponse } from 'next/server'
const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get('authorization') || ''
  const { id } = await params
  try {
    const res = await fetch(`${BACKEND}/api/v1/wiki/${id}/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      signal: AbortSignal.timeout(30000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 503 })
  }
}
