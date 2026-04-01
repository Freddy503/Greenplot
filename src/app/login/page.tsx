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

      // Try to restore nickname from email
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
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--background)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="relative mb-6 inline-block">
            <div
              className="absolute inset-0 rounded-full blur-2xl opacity-40"
              style={{ background: 'var(--primary)', transform: 'scale(1.6)' }}
            />
            <span
              className="material-symbols-outlined relative"
              style={{ fontSize: 56, color: 'var(--primary)', fontVariationSettings: '"FILL" 1' }}
            >
              forest
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)' }}>
            Welcome back
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
            Log in to your Greenplot garden
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoFocus
            className="w-full px-4 py-3.5 rounded-2xl text-base outline-none"
            style={{
              background: 'var(--surface-container)',
              border: '1px solid var(--outline-variant)',
              color: 'var(--on-surface)',
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3.5 rounded-2xl text-base outline-none"
            style={{
              background: 'var(--surface-container)',
              border: '1px solid var(--outline-variant)',
              color: 'var(--on-surface)',
            }}
          />

          {error && (
            <div
              className="rounded-2xl px-4 py-3 text-sm"
              style={{ background: 'rgba(255,113,108,0.1)', color: 'var(--destructive)' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!email.trim() || !password.trim() || loading}
            className="w-full py-3.5 rounded-2xl font-semibold text-base transition-all active:scale-[0.97] disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        {/* Links */}
        <button
          onClick={() => router.push('/onboarding')}
          className="w-full mt-4 py-3 text-sm transition-opacity hover:opacity-80"
          style={{ color: 'var(--primary)' }}
        >
          New here? Create an account
        </button>
      </div>
    </div>
  )
}
