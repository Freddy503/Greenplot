import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Fetch the page
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'GreenPlot Bot/1.0',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json({
        title: new URL(url).hostname,
        summary: '',
        tags: [],
      })
    }

    const html = await res.text()

    // Extract title
    let title = ''
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) {
      title = titleMatch[1].trim()
    }
    if (!title) {
      const ogMatch = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
      if (ogMatch) title = ogMatch[1].trim()
    }

    // Extract description
    let summary = ''
    const descMatch = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)
    if (descMatch) {
      summary = descMatch[1].trim()
    }
    if (!summary) {
      const ogDesc = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
      if (ogDesc) summary = ogDesc[1].trim()
    }

    // Extract keywords for tags
    const tags: string[] = []
    const kwMatch = html.match(/name=["']keywords["'][^>]*content=["']([^"']+)["']/i)
    if (kwMatch) {
      tags.push(...kwMatch[1].split(',').map((t: string) => t.trim()).filter(Boolean).slice(0, 5))
    }

    // Auto-detect domain from URL
    const domain = new URL(url).hostname.replace('www.', '')

    return NextResponse.json({
      title: title || domain,
      summary: summary || '',
      tags,
      domain,
    })
  } catch (error) {
    // Fallback: return basic info
    try {
      const { url } = await req.json()
      const domain = new URL(url).hostname.replace('www.', '')
      return NextResponse.json({ title: domain, summary: '', tags: [], domain })
    } catch {
      return NextResponse.json({ title: 'Unknown', summary: '', tags: [], domain: 'unknown' })
    }
  }
}
