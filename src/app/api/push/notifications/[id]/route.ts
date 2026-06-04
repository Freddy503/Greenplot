import { NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const authHeader = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/push/notifications/${params.id}`, {
      method: 'DELETE',
      headers: authHeader ? { Authorization: authHeader } : {},
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ success: false }, { status: 502 })
  }
}
