import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = req.headers.get('authorization') || ''

  try {
    const res = await fetch(`${BACKEND}/api/v1/wiki/${id}`, {
      method: 'DELETE',
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(8000),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
