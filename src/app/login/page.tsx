'use client'

// Login — redesigned (Greenplot Redesign · surfaces-e): full forest backdrop,
// serif "Welcome back", glass inputs, one green CTA. Keeps the existing auth
// behavior: nickname-or-email login, ?redirect= target, push registration.

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import { Leaf, User, Lock, Eye, EyeOff } from 'lucide-react'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { clearChatCache } from '@/lib/api'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/chat'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { requestPermission } = usePushNotifications()

  const ready = !!email.trim() && !!password.trim()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || loading) return

    setLoading(true)
    setError('')

    try {
      // Accept nickname or email: if no @, append @greenplot.app
      // Strip spaces to match onboarding's slug format (nickname → "nickname@greenplot.app")
      const loginEmail = email.includes('@')
        ? email.trim()
        : `${email.trim().toLowerCase().replace(/\s+/g, '')}@greenplot.app`

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: password.trim() }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Login failed: ${text}`)
      }

      const { access_token, tenant_id } = await res.json()

      // Only drop cached chats when a DIFFERENT account signs in on this
      // browser — re-logging into the same account keeps your chats (and they
      // re-load from the server on open regardless).
      if (localStorage.getItem('greenplot_tenant') !== tenant_id) {
        clearChatCache()
      }
      localStorage.setItem('greenplot_token', access_token)
      localStorage.setItem('greenplot_tenant', tenant_id)

      const nickname = email.split('@')[0]
      localStorage.setItem('greenplot_nickname', nickname)

      // Register push notifications (non-blocking)
      requestPermission().catch(() => {})

      router.push(redirectTo)
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  const glassField: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 11,
    borderRadius: 16, padding: '14px 16px', cursor: 'text',
    background: 'rgba(255,255,255,0.10)',
    backdropFilter: 'blur(14px) saturate(160%)', WebkitBackdropFilter: 'blur(14px) saturate(160%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.10)',
    border: '0.5px solid rgba(255,255,255,0.16)',
  }
  const glassInput: React.CSSProperties = {
    width: '100%', background: 'transparent', border: 'none', outline: 'none',
    fontFamily: 'var(--body)', fontSize: 14.5, color: '#fff', padding: 0,
  }

  return (
    <div
      className="gp-login"
      style={{
        minHeight: '100dvh', position: 'relative', overflowY: 'auto', overflowX: 'hidden',
        background: 'linear-gradient(168deg, var(--forest-3, #15573a) 0%, var(--forest-2, #0d3a25) 42%, var(--forest-1, #0a2618) 100%)',
      }}
    >
      {/* Glow + leaf watermark */}
      <div style={{ position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,217,122,0.22), transparent 65%)', pointerEvents: 'none' }} />
      <Leaf size={300} color="rgba(126,240,168,0.05)" style={{ position: 'absolute', right: -90, bottom: -60, transform: 'rotate(-12deg)', pointerEvents: 'none' }} strokeWidth={1.5} />

      <div style={{
        position: 'relative', zIndex: 2, minHeight: '100dvh', width: '100%', maxWidth: 420, margin: '0 auto',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '80px 26px 64px',
      }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <div style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(160deg,#34d97a,#16a34a)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 38px -10px rgba(34,197,94,0.65)' }}>
            <Leaf size={32} color="#06281a" strokeWidth={2} />
          </div>
          <h1 className="serif" style={{ fontSize: 36, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.01em', marginTop: 22 }}>Welcome back</h1>
          <p className="body-text" style={{ fontSize: 14, color: 'rgba(233,250,239,0.62)', marginTop: 8 }}>Log in to tend your garden.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={glassField}>
            <User size={17} color="rgba(233,250,239,0.55)" strokeWidth={1.75} />
            <input
              type="text" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Nickname or email" autoFocus autoComplete="username"
              style={glassInput}
            />
          </label>
          <label style={glassField}>
            <Lock size={17} color="rgba(233,250,239,0.55)" strokeWidth={1.75} />
            <input
              type={showPass ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" autoComplete="current-password"
              style={glassInput}
            />
            <button type="button" onClick={() => setShowPass(s => !s)} className="tap" aria-label={showPass ? 'Hide password' : 'Show password'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}>
              {showPass
                ? <EyeOff size={17} color="rgba(233,250,239,0.55)" strokeWidth={1.75} />
                : <Eye size={17} color="rgba(233,250,239,0.55)" strokeWidth={1.75} />}
            </button>
          </label>

          {error && (
            <div style={{ borderRadius: 14, padding: '11px 15px', background: 'rgba(212,80,62,0.16)', border: '0.5px solid rgba(212,80,62,0.4)' }}>
              <span className="body-text" style={{ fontSize: 12.5, color: '#ffb4a8' }}>{error}</span>
            </div>
          )}

          <button
            type="submit" disabled={!ready || loading}
            className="tap ui"
            style={{
              marginTop: 6, width: '100%', borderRadius: 16, border: 'none', padding: 15,
              background: 'var(--green, #22c55e)', color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.45,
              boxShadow: ready ? '0 12px 30px -8px rgba(34,197,94,0.65)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              transition: 'opacity .15s ease',
            }}
          >
            {loading ? (
              <>
                <span className="gp-login-spin" style={{ width: 16, height: 16, borderRadius: 99, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff' }} />
                Logging in…
              </>
            ) : 'Log in'}
          </button>
        </form>

        <button
          onClick={() => router.push('/onboarding')}
          className="tap ui"
          style={{ marginTop: 18, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#7ef0a8', padding: 10 }}
        >
          New here? Create an account
        </button>

        <div className="caps" style={{ position: 'absolute', bottom: 22, left: 0, right: 0, textAlign: 'center', fontSize: 9.5, color: 'rgba(233,250,239,0.35)' }}>
          Greenplot · A living laboratory
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .gp-login input::placeholder { color: rgba(233,250,239,0.4); }
        .gp-login input:-webkit-autofill,
        .gp-login input:-webkit-autofill:hover,
        .gp-login input:-webkit-autofill:focus {
          -webkit-text-fill-color: #fff;
          -webkit-box-shadow: 0 0 0 1000px rgba(13,58,37,0.9) inset;
          transition: background-color 9999s ease-in-out 0s;
        }
        @keyframes gpLoginSpin { to { transform: rotate(360deg); } }
        .gp-login-spin { animation: gpLoginSpin .8s linear infinite; display: inline-block; }
      ` }} />
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
