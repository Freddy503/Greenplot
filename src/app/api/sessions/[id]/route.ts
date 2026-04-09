const BACKEND = (process.env.BACKEND_URL || 'https://api.greenplot.ink').trim().replace(/\/+$/, '')

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization') || ''
  const { id } = params

  try {
    const res = await fetch(`${BACKEND}/api/v1/sessions/${id}`, {
      headers: { ...(token ? { Authorization: token } : {}) },
    })
    const data = await res.json()
    return Response.json(data, { status: res.status })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const token = req.headers.get('authorization') || ''
  const { id } = params

  try {
    const res = await fetch(`${BACKEND}/api/v1/sessions/${id}`, {
      method: 'DELETE',
      headers: { ...(token ? { Authorization: token } : {}) },
    })
    return Response.json({ ok: res.ok }, { status: res.status })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }
}
