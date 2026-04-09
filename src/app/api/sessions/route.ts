const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function GET(req: Request) {
  const token = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  const limit = url.searchParams.get('limit') || '20'

  try {
    const res = await fetch(`${BACKEND}/api/v1/sessions?limit=${limit}`, {
      headers: { ...(token ? { Authorization: token } : {}) },
    })
    const data = await res.json()
    return Response.json(data, { status: res.status })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }
}
