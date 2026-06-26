import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// Whether the Neo4j traversal index is enabled and reachable for this
// deployment. Drives the status pill in the "Ask the graph" view.
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization') || ''

  try {
    const res = await fetch(`${BACKEND}/api/v1/graph/neo4j/status`, {
      headers: { ...(token ? { Authorization: token } : {}) },
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 404) {
      return NextResponse.json({ enabled: false, available: false, message: 'Status endpoint not available yet' }, { status: 404 })
    }
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ enabled: false, available: false, message: 'Backend unreachable' }, { status: 503 })
  }
}
