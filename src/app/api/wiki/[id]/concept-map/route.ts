import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization') || ''
  const { id } = await params

  try {
    const res = await fetch(`${BACKEND}/api/v1/wiki/${id}/concept-map`, {
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ nodes: [], links: [] }, { status: 500 })
  }
}
