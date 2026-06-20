import { NextRequest, NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = 'Greenplot <digest@greenplot.ink>'
const TO = process.env.FEEDBACK_NOTIFY_TO || ''

// Simple in-process rate limit: max 3 requests per IP per hour
const ipTimestamps = new Map<string, number[]>()
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 3

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const times = (ipTimestamps.get(ip) || []).filter(t => now - t < WINDOW_MS)
  if (times.length >= MAX_PER_WINDOW) return true
  ipTimestamps.set(ip, [...times, now])
  return false
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests — try again later' }, { status: 429 })
  }

  try {
    const { message } = await req.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 })
    }

    if (!RESEND_API_KEY || !TO) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 503 })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: '💡 Greenplot Feature Request',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111827;color:#F9FAFB;padding:32px;border-radius:16px;">
            <p style="font-size:11px;font-weight:800;color:#6366F1;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px;">Greenplot</p>
            <h1 style="margin:0 0 24px;font-size:20px;font-weight:700;">💡 New Feature Request</h1>
            <div style="background:#1F2937;border-radius:12px;padding:20px;font-size:15px;line-height:1.7;color:#D1D5DB;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            <p style="margin-top:24px;font-size:11px;color:#4B5563;">Sent from Greenplot Settings · IP: ${ip}</p>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
