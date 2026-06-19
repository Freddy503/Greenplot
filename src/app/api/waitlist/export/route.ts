import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(req: NextRequest) {
  const secret = process.env.WAITLIST_EXPORT_SECRET
  const provided = req.headers.get('x-export-secret')

  if (!secret) {
    return NextResponse.json({ error: 'Waitlist export is not configured' }, { status: 503 })
  }

  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const filePath = process.env.WAITLIST_FILE || path.join(process.cwd(), 'data', 'waitlist.json')
    if (!fs.existsSync(filePath)) {
      return new NextResponse('email,joinedAt\n', {
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="waitlist.csv"' },
      })
    }
    const entries: { email: string; joinedAt: string }[] = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const csv = ['email,joinedAt', ...entries.map(e => `${e.email},${e.joinedAt}`)].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="waitlist.csv"',
      },
    })
  } catch (err) {
    console.error('[waitlist/export] Read failed:', err)
    return NextResponse.json({ error: 'Could not read waitlist' }, { status: 500 })
  }
}
