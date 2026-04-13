import { NextRequest, NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = 'Seedify <digest@greenplot.ink>'
const TO = 'contact@example.com'

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'No message provided' }, { status: 400 })
    }

    if (!RESEND_API_KEY) {
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
        subject: '💡 Seedify Feature Request',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111827;color:#F9FAFB;padding:32px;border-radius:16px;">
            <p style="font-size:11px;font-weight:800;color:#6366F1;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px;">Seedify</p>
            <h1 style="margin:0 0 24px;font-size:20px;font-weight:700;">💡 New Feature Request</h1>
            <div style="background:#1F2937;border-radius:12px;padding:20px;font-size:15px;line-height:1.7;color:#D1D5DB;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            <p style="margin-top:24px;font-size:11px;color:#4B5563;">Sent from Seedify Settings</p>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
