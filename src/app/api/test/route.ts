import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const res = await fetch('https://httpbin.org/get', { 
      signal: AbortSignal.timeout(10000) 
    })
    const data = await res.json()
    return NextResponse.json({ 
      status: 'ok', 
      external_reachable: true,
      data 
    })
  } catch (err) {
    return NextResponse.json({ 
      status: 'error', 
      external_reachable: false,
      error: (err as Error).message 
    })
  }
}
