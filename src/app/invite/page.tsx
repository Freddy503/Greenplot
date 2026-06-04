'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function InviteHandler() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const [status, setStatus] = useState<'validating' | 'valid' | 'invalid'>('validating')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      setError('No invite token found in this link.')
      return
    }

    fetch(`/api/auth/validate-invite?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid && data.email) {
          setEmail(data.email)
          setStatus('valid')
          // Redirect to onboarding with pre-filled email after a short pause
          setTimeout(() => {
            router.replace(`/onboarding?email=${encodeURIComponent(data.email)}`)
          }, 1200)
        } else {
          setStatus('invalid')
          setError(data.detail || 'This invite link is invalid or has expired.')
        }
      })
      .catch(() => {
        setStatus('invalid')
        setError('Could not validate your invite. Please try again or contact support.')
      })
  }, [token, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm text-center">
        <span
          className="material-symbols-outlined text-primary mb-6 block"
          style={{ fontSize: 56, fontVariationSettings: '"FILL" 1' }}
        >
          eco
        </span>

        {status === 'validating' && (
          <>
            <h1 className="text-2xl font-normal tracking-tight text-on-surface mb-3">
              Verifying your invite…
            </h1>
            <p className="text-sm text-on-surface-variant">Just a moment.</p>
          </>
        )}

        {status === 'valid' && (
          <>
            <h1 className="text-2xl font-normal tracking-tight text-on-surface mb-3">
              Welcome to Seedify
            </h1>
            <p className="text-sm text-on-surface-variant mb-1">
              Invite accepted for <strong>{email}</strong>
            </p>
            <p className="text-xs text-on-surface-variant/60">
              Taking you to setup…
            </p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <h1 className="text-2xl font-normal tracking-tight text-on-surface mb-3">
              Invalid invite
            </h1>
            <p className="text-sm text-on-surface-variant mb-6">{error}</p>
            <a
              href="/"
              className="text-sm text-primary underline underline-offset-2"
            >
              Return to homepage
            </a>
          </>
        )}
      </div>
    </div>
  )
}

export default function InvitePage() {
  return (
    <Suspense>
      <InviteHandler />
    </Suspense>
  )
}
