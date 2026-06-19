import { NextRequest, NextResponse } from 'next/server'
import dns from 'node:dns/promises'
import net from 'node:net'

function isPublicIp(address: string): boolean {
  const family = net.isIP(address)
  if (family === 4) {
    const parts = address.split('.').map(Number)
    const [a, b] = parts
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  if (family === 6) {
    const normalized = address.toLowerCase()
    return !(
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    )
  }
  return false
}

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported')
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with credentials are not supported')
  }
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.localhost')) {
    throw new Error('Localhost URLs are not supported')
  }

  const addresses = await dns.lookup(parsed.hostname, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error('Private network URLs are not supported')
  }
  return parsed
}

async function fetchPublicHtml(rawUrl: string): Promise<Response> {
  let current = await assertPublicHttpUrl(rawUrl)
  for (let i = 0; i < 5; i += 1) {
    const res = await fetch(current, {
      headers: {
        'User-Agent': 'GreenPlot Bot/1.0',
        Accept: 'text/html',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    })
    if (![301, 302, 303, 307, 308].includes(res.status)) return res

    const location = res.headers.get('location')
    if (!location) return res
    current = await assertPublicHttpUrl(new URL(location, current).toString())
  }
  throw new Error('Too many redirects')
}

export async function POST(req: NextRequest) {
  let url = ''
  try {
    const body = await req.json()
    url = body.url

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const requestedUrl = await assertPublicHttpUrl(url)
    const res = await fetchPublicHtml(requestedUrl.toString())

    if (!res.ok) {
      return NextResponse.json({
        title: requestedUrl.hostname,
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
    const domain = requestedUrl.hostname.replace('www.', '')

    return NextResponse.json({
      title: title || domain,
      summary: summary || '',
      tags,
      domain,
    })
  } catch (error) {
    // Fallback: return basic info
    try {
      const domain = new URL(url).hostname.replace('www.', '')
      return NextResponse.json({ title: domain, summary: '', tags: [], domain })
    } catch {
      return NextResponse.json({ title: 'Unknown', summary: '', tags: [], domain: 'unknown' })
    }
  }
}
