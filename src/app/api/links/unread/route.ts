import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.greenplot.ink'

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')
    if (!token) {
      return NextResponse.json({ count: 0 })
    }

    const res = await fetch(`${API_URL}/api/v1/links`, {
      headers: { Authorization: token },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ count: 0 })
    }

    const data = await res.json()
    const links = data.links || []

    // Count links added in the last 7 days
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const newCount = links.filter((l: any) => {
      const added = new Date(l.created_at || l.addedAt)
      return added >= weekAgo
    }).length

    return NextResponse.json({ count: newCount, total: links.length })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
