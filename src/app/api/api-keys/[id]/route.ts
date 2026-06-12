import { NextRequest, NextResponse } from 'next/server'

const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authHeader = req.headers.get('authorization') || ''
  try {
    const res = await fetch(`${BACKEND}/api/v1/api-keys/${id}`, {
      method: 'DELETE',
      headers: authHeader ? { Authorization: authHeader } : {},
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 502 })
  }
}
