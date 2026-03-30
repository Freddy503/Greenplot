import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, unknown> = {}
  
  // Test: Cloudflare tunnel register endpoint
  try {
    const res = await fetch('https://atomic-probability-ago-mistress.trycloudflare.com/api/v1/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'vercel-test@test.com', password: 'test123' }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json()
    results.tunnel_register = { ok: true, status: res.status, has_token: !!data.access_token }
  } catch (err) {
    results.tunnel_register = { ok: false, error: (err as Error).message }
  }

  return NextResponse.json(results)
}
