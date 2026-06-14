'use client'

// Password reset — opened from the email link (?token=...). Sets a new password
// via /api/auth/reset-password, then sends the user back to login.

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import { Leaf, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

function ResetForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    if (pw.length < 8) { setError('Password must be at least 8 characters'); return }
    if (pw !== pw2) { setError('Passwords do not match'); return }
    if (!token) { setError('Missing reset token — open the link from your email again'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setDone(true); setTimeout(() => router.push('/login'), 2200) }
      else { setError(data.detail || 'Could not reset password'); setLoading(false) }
    } catch { setError('Could not reach the server'); setLoading(false) }
  }

  const glassField: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 11, borderRadius: 16, padding: '14px 16px', cursor: 'text',
    background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.10)', border: '0.5px solid rgba(255,255,255,0.16)',
  }
  const glassInput: React.CSSProperties = { width: '100%', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--body)', fontSize: 14.5, color: '#fff', padding: 0 }

  return (
    <div className="gp-login" style={{ minHeight: '100dvh', position: 'relative', overflowY: 'auto', overflowX: 'hidden', background: 'linear-gradient(168deg, var(--forest-3, #15573a) 0%, var(--forest-2, #0d3a25) 42%, var(--forest-1, #0a2618) 100%)' }}>
      <Leaf size={300} color="rgba(126,240,168,0.05)" style={{ position: 'absolute', right: -90, bottom: -60, transform: 'rotate(-12deg)', pointerEvents: 'none' }} strokeWidth={1.5} />
      <div style={{ position: 'relative', zIndex: 2, minHeight: '100dvh', width: '100%', maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 26px 64px' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(160deg,#34d97a,#16a34a)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 38px -10px rgba(34,197,94,0.65)' }}>
            <Leaf size={32} color="#06281a" strokeWidth={2} />
          </div>
          <h1 className="serif" style={{ fontSize: 32, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.01em', marginTop: 22 }}>Set a new password</h1>
        </div>

        {done ? (
          <div style={{ borderRadius: 16, padding: 22, background: 'rgba(255,255,255,0.10)', border: '0.5px solid rgba(255,255,255,0.16)', textAlign: 'center' }}>
            <CheckCircle2 size={34} color="#7ef0a8" style={{ marginBottom: 8 }} />
            <p className="ui" style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Password updated</p>
            <p className="body-text" style={{ fontSize: 13, color: 'rgba(233,250,239,0.7)' }}>Taking you to login…</p>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={glassField}>
              <Lock size={17} color="rgba(233,250,239,0.55)" strokeWidth={1.75} />
              <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="New password" autoFocus autoComplete="new-password" style={glassInput} />
              <button type="button" onClick={() => setShow(s => !s)} className="tap" aria-label={show ? 'Hide' : 'Show'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}>
                {show ? <EyeOff size={17} color="rgba(233,250,239,0.55)" strokeWidth={1.75} /> : <Eye size={17} color="rgba(233,250,239,0.55)" strokeWidth={1.75} />}
              </button>
            </label>
            <label style={glassField}>
              <Lock size={17} color="rgba(233,250,239,0.55)" strokeWidth={1.75} />
              <input type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" style={glassInput} />
            </label>

            {error && (
              <div style={{ borderRadius: 14, padding: '11px 15px', background: 'rgba(212,80,62,0.16)', border: '0.5px solid rgba(212,80,62,0.4)' }}>
                <span className="body-text" style={{ fontSize: 12.5, color: '#ffb4a8' }}>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="tap ui" style={{ marginTop: 6, width: '100%', borderRadius: 16, border: 'none', padding: 15, background: 'var(--green, #22c55e)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.55 : 1, boxShadow: '0 12px 30px -8px rgba(34,197,94,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
              {loading ? 'Saving…' : 'Reset password'}
            </button>
          </form>
        )}

        <button onClick={() => router.push('/login')} className="tap ui" style={{ marginTop: 18, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#7ef0a8', padding: 10 }}>
          ← Back to login
        </button>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `.gp-login input::placeholder { color: rgba(233,250,239,0.4); }` }} />
    </div>
  )
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>
}
