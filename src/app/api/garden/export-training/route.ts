import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''

  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(`${BACKEND}/api/v1/garden/export-training`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text || 'Export failed' }, { status: res.status })
    }

    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'application/jsonl'
    const contentDisposition = res.headers.get('content-disposition') || 'attachment; filename="training-data.jsonl"'

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 })
  }
}
