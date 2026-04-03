import { NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/chat?calendar_error=${error}`, req.url))
  }

  try {
    // Forward to backend callback
    const res = await fetch(
      `${BACKEND}/api/v1/calendar/callback?code=${code}&state=${state}`,
      { redirect: 'manual' }
    )

    if (!res.ok) {
      return NextResponse.redirect(new URL('/chat?calendar_error=exchange_failed', req.url))
    }

    // Redirect to chat with success
    return NextResponse.redirect(new URL('/chat?calendar_connected=true', req.url))
  } catch {
    return NextResponse.redirect(new URL('/chat?calendar_error=connection_failed', req.url))
  }
}
