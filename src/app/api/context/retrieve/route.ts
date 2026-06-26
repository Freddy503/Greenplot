import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

// Semantic start (Weaviate) + multi-hop graph expansion (Neo4j when enabled,
// Postgres SeedLink fallback otherwise). The response carries `mode` and
// `neo4j` status so the UI can show which path served the result.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization') || ''
  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  try {
    const res = await fetch(`${BACKEND}/api/v1/context/retrieve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: token } : {}),
      },
      body: JSON.stringify(body),
      // Weaviate cold-start + graph expansion can take a moment
      signal: AbortSignal.timeout(30000),
    })

    if (res.status === 404) {
      return NextResponse.json(
        { status: 'unavailable', error: 'Context retrieval not available yet — backend update pending', graph: { nodes: [], relationships: [] }, starts: [] },
        { status: 404 },
      )
    }
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(
      { status: 'error', error: 'Backend unreachable', graph: { nodes: [], relationships: [] }, starts: [] },
      { status: 503 },
    )
  }
}
