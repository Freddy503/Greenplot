import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') || ''

  try {
    const res = await fetch(
      `${BACKEND}/api/v1/auth/validate-invite?token=${encodeURIComponent(token)}`,
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ valid: false, detail: 'Backend unreachable' }, { status: 502 })
  }
}
