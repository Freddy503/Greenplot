import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  const secret = process.env.WAITLIST_EXPORT_SECRET
  const provided = req.headers.get('x-export-secret')
  const authHeader = req.headers.get('authorization') || ''

  if (!secret) {
    return NextResponse.json({ error: 'Waitlist export is not configured' }, { status: 503 })
  }

  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(`${BACKEND}/api/v1/admin/waitlist/export`, {
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(15000),
    })
    const csv = await res.text()
    return new NextResponse(csv, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'text/csv',
        'Content-Disposition': 'attachment; filename="waitlist.csv"',
      },
    })
  } catch (err) {
    console.error('[waitlist/export] Backend export failed:', err)
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
