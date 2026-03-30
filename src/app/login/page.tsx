'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/chat')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-[#69f6b8]">Seedify</span>
          </h1>
          <p className="mt-2 text-[#9ab0a5]">Sign in to your second brain</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="bg-[#ff716c]/10 border border-[#ff716c]/30 rounded-xl px-4 py-3 text-sm text-[#ff716c]">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#9ab0a5] mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#051e15] border border-[#384c43] rounded-xl px-4 py-3 text-[#e4fcf0] placeholder:text-[#657a70] focus:border-[#69f6b8] focus:outline-none transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#9ab0a5] mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#051e15] border border-[#384c43] rounded-xl px-4 py-3 text-[#e4fcf0] placeholder:text-[#657a70] focus:border-[#69f6b8] focus:outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#69f6b8] text-[#005a3c] font-semibold py-3 rounded-full hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-[#657a70]">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[#69f6b8] hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
