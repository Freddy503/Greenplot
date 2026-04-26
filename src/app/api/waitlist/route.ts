import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const FROM = 'Greenplot <digest@greenplot.ink>'
const NOTIFY_TO = 'contact@example.com'

const recentEmails = new Set<string>()

function validEmail(e: string): boolean {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) && e.length <= 320
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  })
}

async function addToAudience(apiKey: string, audienceId: string, email: string) {
  return fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, unsubscribed: false }),
  })
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  const audienceId = process.env.RESEND_AUDIENCE_ID

  try {
    const { email } = await req.json()

    if (!validEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const normalized = email.trim().toLowerCase()

    if (recentEmails.has(normalized)) {
      return NextResponse.json({ ok: true })
    }

    if (!apiKey) {
      // Fallback: persist email to filesystem when Resend is not configured
      try {
        const filePath = process.env.WAITLIST_FILE || path.join(process.cwd(), 'data', 'waitlist.json')
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        const existing: { email: string; joinedAt: string }[] = fs.existsSync(filePath)
          ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
          : []
        if (!existing.some(e => e.email === normalized)) {
          existing.push({ email: normalized, joinedAt: new Date().toISOString() })
          fs.writeFileSync(filePath, JSON.stringify(existing, null, 2))
        }
        console.info(`[waitlist] No RESEND_API_KEY — saved ${normalized} to ${filePath}`)
      } catch (err) {
        console.error('[waitlist] Fallback write failed:', err)
      }
      recentEmails.add(normalized)
      setTimeout(() => recentEmails.delete(normalized), 10 * 60 * 1000)
      return NextResponse.json({ ok: true })
    }

    // Add to Resend Audience for future broadcasts (non-critical)
    if (audienceId) {
      addToAudience(apiKey, audienceId, normalized).catch(err =>
        console.error('[waitlist] Failed to add to audience:', err)
      )
    } else {
      console.warn('[waitlist] RESEND_AUDIENCE_ID not set — skipping audience add')
    }

    // Send confirmation to the user
    const confirmRes = await sendEmail(
      apiKey,
      normalized,
      "You're on the Greenplot waitlist 🌱",
      `
      <div style="font-family:'Barlow',sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff;padding:48px 32px;border-radius:16px;">
        <div style="margin-bottom:32px;">
          <span style="font-size:28px;font-weight:700;letter-spacing:-0.02em;">Greenplot<sup style="font-size:0.5em;vertical-align:super;font-weight:400;">®</sup></span>
        </div>
        <h1 style="font-family:'Instrument Serif',Georgia,serif;font-size:36px;font-weight:400;font-style:italic;line-height:1.1;margin:0 0 20px;letter-spacing:-0.02em;">
          Your garden is waiting.
        </h1>
        <p style="font-size:16px;line-height:1.75;color:rgba(255,255,255,0.65);margin:0 0 28px;font-weight:300;">
          You're officially on the Greenplot early access waitlist. We'll reach out when your spot opens up — and we'll make sure your first garden session is everything you hoped for.
        </p>
        <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);border-radius:12px;padding:20px 24px;margin-bottom:28px;">
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.6;font-weight:300;">
            <strong style="color:#22c55e;font-weight:600;">What to expect:</strong><br/>
            Early access to the full Greenplot app — AI-powered idea capture, a living knowledge graph, smart briefings, academic research, and more.
          </p>
        </div>
        <p style="font-size:13px;color:rgba(255,255,255,0.3);margin:0;font-weight:300;">
          No spam. Unsubscribe anytime. Built with 💚 for curious minds.
        </p>
      </div>
      `
    )

    if (!confirmRes.ok) {
      const err = await confirmRes.json().catch(() => ({}))
      console.error('[waitlist] Resend error:', err)
      return NextResponse.json({ error: 'Failed to send confirmation' }, { status: 500 })
    }

    // Notify operator (non-critical)
    sendEmail(
      apiKey,
      NOTIFY_TO,
      `🌱 New Greenplot waitlist signup — ${normalized}`,
      `
      <div style="font-family:sans-serif;max-width:500px;background:#111;color:#f9fafb;padding:32px;border-radius:12px;">
        <h2 style="margin:0 0 16px;font-size:18px;">🌱 New waitlist signup</h2>
        <p style="margin:0;font-size:16px;color:#22c55e;font-weight:700;">${normalized}</p>
        <p style="margin-top:16px;font-size:12px;color:#6b7280;">greenplot.ink</p>
      </div>
      `
    ).catch(() => {})

    recentEmails.add(normalized)
    setTimeout(() => recentEmails.delete(normalized), 10 * 60 * 1000)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
