import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/me/export`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json(data, {
      status: 200,
      headers: { 'Content-Disposition': 'attachment; filename="seedify-export.json"' },
    })
  } catch {
    return NextResponse.json({ detail: 'Export failed' }, { status: 502 })
  }
}
