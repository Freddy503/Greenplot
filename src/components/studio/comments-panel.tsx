'use client'

import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Trash2, Check, Send } from 'lucide-react'

interface CommentItem {
  id: string
  author_name: string
  author_user_id: string
  body: string
  resolved: boolean
  created_at: string | null
  edited_at: string | null
}

const auth = (): Record<string, string> => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function CommentsPanel({ seedId, productId }: { seedId: string; productId: string }) {
  const [comments, setComments] = useState<CommentItem[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/seeds/${seedId}/comments?product_id=${encodeURIComponent(productId)}`, { headers: { ...auth() } })
      if (r.ok) { const d = await r.json(); setComments(d.comments || []) }
    } catch {}
  }, [seedId, productId])
  useEffect(() => { load() }, [load])

  const post = useCallback(async () => {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/seeds/${seedId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ product_id: productId, body: text }),
      })
      if (r.ok) { const c = await r.json(); setComments(prev => [...prev, c]); setBody('') }
    } catch {} finally { setBusy(false) }
  }, [body, busy, seedId, productId])

  const del = useCallback(async (id: string) => {
    try { const r = await fetch(`/api/comments/${id}`, { method: 'DELETE', headers: { ...auth() } }); if (r.ok) setComments(prev => prev.filter(c => c.id !== id)) } catch {}
  }, [])
  const toggleResolve = useCallback(async (c: CommentItem) => {
    try {
      const r = await fetch(`/api/comments/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify({ resolved: !c.resolved }) })
      if (r.ok) { const u = await r.json(); setComments(prev => prev.map(x => x.id === c.id ? u : x)) }
    } catch {}
  }, [])

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <MessageSquare size={14} color="var(--ink-3)" strokeWidth={1.75} />
        <span className="ui" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>Comments{comments.length ? ` · ${comments.length}` : ''}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {comments.length === 0 && <p className="body-text" style={{ fontSize: 12, color: 'var(--ink-3)' }}>No comments yet — start the discussion.</p>}
        {comments.map(c => (
          <div key={c.id} style={{ background: 'var(--surface-sunk)', borderRadius: 12, padding: '9px 12px', opacity: c.resolved ? 0.55 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span className="ui" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>{c.author_name}</span>
              <span className="body-text" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : ''}{c.resolved ? ' · resolved' : ''}</span>
              <button onClick={() => toggleResolve(c)} title={c.resolved ? 'Reopen' : 'Resolve'} className="tap" style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 2, cursor: 'pointer' }}><Check size={12} color={c.resolved ? 'var(--green-700)' : 'var(--ink-3)'} /></button>
              <button onClick={() => del(c.id)} title="Delete" className="tap" style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer' }}><Trash2 size={11} color="var(--ink-3)" /></button>
            </div>
            <p className="body-text" style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</p>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={body} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post() } }} placeholder="Add a comment…"
          style={{ flex: 1, minWidth: 0, border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 11px', fontFamily: 'var(--body)', fontSize: 12.5, color: 'var(--ink)', outline: 'none', background: 'var(--surface)' }} />
        <button onClick={post} disabled={!body.trim() || busy} className="tap" style={{ background: 'var(--green)', border: 'none', borderRadius: 10, padding: '0 12px', cursor: 'pointer', opacity: (!body.trim() || busy) ? 0.5 : 1, display: 'flex', alignItems: 'center' }}><Send size={14} color="#06281a" /></button>
      </div>
    </div>
  )
}
