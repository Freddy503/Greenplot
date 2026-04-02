'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { usePushNotifications } from '@/hooks/use-push-notifications'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { requestPermission } = usePushNotifications()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return

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

      localStorage.setItem('greenplot_token', access_token)
      localStorage.setItem('greenplot_tenant', tenant_id)

      const nickname = email.split('@')[0]
      localStorage.setItem('greenplot_nickname', nickname)

      // Register push notifications (non-blocking)
      requestPermission().catch(() => {})

      router.push('/chat')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden bg-background">
      {/* Decorative glow */}
      <div className="absolute rounded-full pointer-events-none w-[400px] h-[400px] bg-primary opacity-[0.04] top-[15%] left-1/2 -translate-x-1/2 blur-[80px]" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="relative mb-6 inline-block">
            <div className="absolute inset-0 rounded-full blur-2xl opacity-40 bg-primary scale-[1.6]" />
            <span
              className="material-symbols-outlined relative text-primary"
              style={{ fontSize: 56, fontVariationSettings: '"FILL" 1' }}
            >
              forest
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">
            Welcome back
          </h1>
          <p className="mt-1 text-sm font-medium text-on-surface-variant">
            Log in to your Greenplot garden
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-3">
          <Input
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Nickname or email"
            autoFocus
            className="w-full px-5 py-4 rounded-full text-base h-auto bg-surface-container-highest text-on-surface border-0 placeholder:text-on-surface-variant/40 focus-visible:ring-primary/50"
          />

          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-5 py-4 rounded-full text-base h-auto bg-surface-container-highest text-on-surface border-0 placeholder:text-on-surface-variant/40 focus-visible:ring-primary/50"
          />

          {error && (
            <div className="rounded-full px-5 py-3 text-sm font-medium bg-error/10 text-error">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={!email.trim() || !password.trim() || loading}
            className="w-full py-4 rounded-full font-bold text-base h-auto bg-secondary text-on-secondary hover:bg-secondary/90 shadow-[0_8px_32px_rgba(248,160,16,0.20)] active:scale-[0.97] transition-transform"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner className="text-on-secondary" />
                Logging in…
              </span>
            ) : (
              'Log In'
            )}
          </Button>
        </form>

        {/* New account link */}
        <button
          onClick={() => router.push('/onboarding')}
          className="w-full mt-4 py-3 text-sm font-medium text-primary transition-opacity hover:opacity-80 rounded-full"
        >
          New here? Create an account
        </button>
      </div>
    </div>
  )
}
