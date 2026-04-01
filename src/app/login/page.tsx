'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Login failed: ${text}`)
      }

      const { access_token, tenant_id } = await res.json()

      localStorage.setItem('greenplot_token', access_token)
      localStorage.setItem('greenplot_tenant', tenant_id)

      const nickname = email.split('@')[0]
      localStorage.setItem('greenplot_nickname', nickname)

      router.push('/chat')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{ background: '#111412' }}
    >
      {/* Decorative blurred glow */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 400,
          height: 400,
          background: '#10B981',
          opacity: 0.04,
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          filter: 'blur(80px)',
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="relative mb-6 inline-block">
            <div
              className="absolute inset-0 rounded-full blur-2xl opacity-40"
              style={{ background: '#10B981', transform: 'scale(1.6)' }}
            />
            <span
              className="material-symbols-outlined relative"
              style={{ fontSize: 56, color: '#10B981', fontVariationSettings: '"FILL" 1' }}
            >
              forest
            </span>
          </div>
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{ color: '#e1e3df' }}
          >
            Welcome back
          </h1>
          <p className="mt-1 text-sm font-medium" style={{ color: '#9fb8aa' }}>
            Log in to your Greenplot garden
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-3">
          {/* Email pill input */}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            className="w-full px-5 py-4 rounded-full text-base outline-none font-medium transition-all placeholder:opacity-40"
            style={{
              background: '#2e312e',
              color: '#e1e3df',
            }}
          />

          {/* Password pill input */}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-5 py-4 rounded-full text-base outline-none font-medium transition-all placeholder:opacity-40"
            style={{
              background: '#2e312e',
              color: '#e1e3df',
            }}
          />

          {error && (
            <div
              className="rounded-full px-5 py-3 text-sm font-medium"
              style={{ background: 'rgba(255,180,171,0.10)', color: '#ffb4ab' }}
            >
              {error}
            </div>
          )}

          {/* Amber CTA button (Stitch pattern) */}
          <button
            type="submit"
            disabled={!email.trim() || !password.trim() || loading}
            className="w-full py-4 rounded-full font-bold text-base transition-all active:scale-[0.97] disabled:opacity-40"
            style={{
              background: '#ffb84d',
              color: '#482a00',
              boxShadow: '0 8px 32px rgba(255,184,77,0.20)',
            }}
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        {/* New account link */}
        <button
          onClick={() => router.push('/onboarding')}
          className="w-full mt-4 py-3 text-sm font-medium transition-opacity hover:opacity-80 rounded-full"
          style={{ color: '#10B981' }}
        >
          New here? Create an account
        </button>
      </div>
    </div>
  )
}
