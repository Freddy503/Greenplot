import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL || 'https://api.greenplot.ink'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const articleId = searchParams.get('id')
  const format = searchParams.get('format') || 'md'
  // Accept token from Authorization header OR query param (needed for window.open downloads)
  const token = req.headers.get('authorization') || (searchParams.get('token') ? `Bearer ${searchParams.get('token')}` : '')

  if (!articleId) {
    return NextResponse.json({ error: 'Article ID required' }, { status: 400 })
  }

  try {
    const res = await fetch(`${BACKEND}/api/v1/wiki`, {
      headers: { ...(token ? { Authorization: token } : {}) },
    })
    const data = await res.json()
    const articles = data.articles || []
    const article = articles.find((a: any) => a.id === articleId || a._additional?.id === articleId)

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    if (format === 'md') {
      const now = new Date().toISOString().slice(0, 10)
      const backlinks = Array.isArray(article.backlinks) && article.backlinks.length
        ? article.backlinks.map((b: string) => `- [[${b}]]`).join('\n')
        : '_None_'
      const seedCount = Array.isArray(article.sourceSeedIds)
        ? article.sourceSeedIds.length
        : Array.isArray(article.seedIds)
          ? article.seedIds.length
          : 0
      const summaryLine = article.summary
        ? `\n## Summary\n\n${article.summary}\n`
        : ''

      const md = `# ${article.title}

> **Category**: ${article.category || 'General'}
> **Last updated**: ${article.updatedAt ? new Date(article.updatedAt).toISOString().slice(0, 10) : now}
> **Built from**: ${seedCount} idea${seedCount !== 1 ? 's' : ''}
> **Exported**: ${now}
${summaryLine}
## Article

${article.content}

## Related Topics

${backlinks}

---
*Exported from Greenplot — your living knowledge garden.*
`
      const headers = {
        'Content-Disposition': `attachment; filename="${article.title.replace(/[^a-z0-9]/gi, '_')}.md"`,
        'Content-Type': 'text/markdown; charset=utf-8',
      }
      return new NextResponse(md, { headers })
    }

    if (format === 'html') {
      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${article.title}</title>
<style>
body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #111; line-height: 1.7; }
h1 { font-size: 2rem; margin-bottom: 0.5rem; }
h2 { font-size: 1.5rem; margin-top: 2rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
h3 { font-size: 1.2rem; margin-top: 1.5rem; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
th { background: #f5f5f5; font-weight: bold; }
tr:nth-child(even) { background: #fafafa; }
a { color: #16a34a; text-decoration: none; }
a:hover { text-decoration: underline; }
code { background: #f0f0f0; padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.9em; }
</style></head>
<body>
<pre style="white-space: pre-wrap; font-family: system-ui, sans-serif;">${article.content}</pre>
</body></html>`
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
    }

    return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 })
  }
}
