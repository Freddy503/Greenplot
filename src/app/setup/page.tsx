'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SetupPage() {
  const router = useRouter()
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim()) return

    setLoading(true)
    setError('')

    try {
      // 1. Create user profile (via Next.js proxy — avoids mixed content)
      const registerRes = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `${nickname.toLowerCase().replace(/\s+/g, '')}@greenplot.app`,
          password: crypto.randomUUID(),
        }),
      })

      if (!registerRes.ok) {
        const text = await registerRes.text()
        throw new Error(`Registration failed: ${text}`)
      }

      const { access_token, tenant_id } = await registerRes.json()

      // 2. Store credentials
      localStorage.setItem('seedify_token', access_token)
      localStorage.setItem('seedify_tenant', tenant_id)
      localStorage.setItem('seedify_nickname', nickname.trim())

      // 3. Seed the garden (non-critical)
      fetch('/api/thoughts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({
          content: `Welcome! I'm ${nickname.trim()}. Let's start building my knowledge garden.`,
          source: 'onboarding',
        }),
      }).catch(() => {})

      // 4. Go to chat
      router.push('/chat')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'var(--primary)' }}>
            <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--on-primary)' }}>eco</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)' }}>Welcome to Seedify</h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--on-surface-variant)' }}>
            Seedify is your personal AI second brain. Plant ideas, articles, and notes as <strong style={{ color: 'var(--primary)' }}>seeds</strong>. Your AI grows them into a searchable knowledge garden — enriched with web research, connected by meaning, and surfaced back to you as daily briefings.
          </p>
          <p className="mt-2 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
            Everything stays private to your garden. Pick a name to get started.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSetup} className="space-y-4">
          <div>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname..."
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-base outline-none"
              style={{
                background: 'var(--surface-container)',
                border: '1px solid var(--outline-variant)',
                color: 'var(--on-surface)',
              }}
            />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(255,113,108,0.1)', color: 'var(--error)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!nickname.trim() || loading}
            className="w-full py-3.5 rounded-xl font-semibold text-base transition-opacity disabled:opacity-30"
            style={{
              background: 'var(--primary)',
              color: 'var(--on-primary)',
            }}
          >
            {loading ? 'Setting up your garden...' : 'Start Growing'}
          </button>
        </form>

        {/* Skip to chat with demo account */}
        <button
          onClick={() => router.push('/chat')}
          className="w-full mt-3 py-3 rounded-xl text-sm"
          style={{ color: 'var(--on-surface-variant)' }}
        >
          Skip — just use chat
        </button>
      </div>
    </div>
  )
}
// force rebuild 1774902293
