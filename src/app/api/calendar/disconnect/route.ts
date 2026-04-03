import { NextResponse } from 'next/server'

const BACKEND = 'https://api.greenplot.ink'

export async function DELETE(req: Request) {
  const authHeader = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/calendar/disconnect`, {
      method: 'DELETE',
      headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    return NextResponse.json({ detail: 'Backend unreachable' }, { status: 502 })
  }
}
