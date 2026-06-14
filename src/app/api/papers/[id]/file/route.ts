import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// Stream the stored PDF back to the client (binary). Auth-gated upstream.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/papers/${id}/file`, {
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Not found' }, { status: res.status })
    }
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': res.headers.get('content-disposition') || 'inline',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
