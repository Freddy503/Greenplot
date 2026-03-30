import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, unknown> = {}
  
  // Test 1: External URL
  try {
    const res = await fetch('https://httpbin.org/get', { signal: AbortSignal.timeout(10000) })
    results.httpbin = { ok: true, status: res.status }
  } catch (err) {
    results.httpbin = { ok: false, error: (err as Error).message }
  }

  // Test 2: Cloudflare tunnel
  try {
    const res = await fetch('https://atomic-probability-ago-mistress.trycloudflare.com/', { signal: AbortSignal.timeout(10000) })
    results.cloudflare_tunnel = { ok: true, status: res.status }
  } catch (err) {
    results.cloudflare_tunnel = { ok: false, error: (err as Error).message }
  }

  // Test 3: Direct HTTP
  try {
    const res = await fetch('http://178.104.67.139:8001/', { signal: AbortSignal.timeout(10000) })
    results.direct_http = { ok: true, status: res.status }
  } catch (err) {
    results.direct_http = { ok: false, error: (err as Error).message }
  }

  return NextResponse.json(results)
}
