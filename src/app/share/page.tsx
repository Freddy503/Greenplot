'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

function ShareHandler() {
  const params = useSearchParams()
  const router = useRouter()

  const sharedTitle = params.get('title') || ''
  const sharedText = params.get('text') || ''
  const sharedUrl = params.get('url') || ''

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Auto-save on mount so share feels instant
  useEffect(() => {
    handleSave()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''

    // If not logged in, redirect to login then come back
    if (!token) {
      setSaving(false)
      router.push(`/login?redirect=${encodeURIComponent('/share?' + params.toString())}`)
      return
    }

    const content = [sharedTitle, sharedText, sharedUrl].filter(Boolean).join('\n\n')

    try {
      const res = await fetch('/api/seeds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: content.slice(0, 4000),
          source: 'share',
        }),
      })

      if (res.ok) {
        setSaved(true)
        toast.success('Saved to your Garden!')
      } else {
        toast.error('Failed to save — tap retry')
      }
    } catch {
      toast.error('Could not reach server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-dvh flex flex-col items-center justify-center bg-background px-6 text-center gap-6">
      <span
        className="material-symbols-outlined text-primary"
        style={{ fontSize: '48px', fontVariationSettings: '"FILL" 1' }}
      >
        {saved ? 'check_circle' : saving ? 'progress_activity' : 'eco'}
      </span>

      <div>
        <h1 className="text-2xl font-normal text-on-surface mb-1">
          {saved ? 'Saved to Garden!' : saving ? 'Saving…' : 'Save to Garden'}
        </h1>
        {(sharedTitle || sharedUrl) && (
          <p className="text-sm text-on-surface-variant line-clamp-2 max-w-xs mx-auto mt-1">
            {sharedTitle || sharedUrl}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {saved ? (
          <>
            <Button className="rounded-full" onClick={() => router.push('/garden')}>
              <span className="material-symbols-outlined mr-2 text-lg">eco</span>
              View Garden
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => router.push('/chat')}>
              <span className="material-symbols-outlined mr-2 text-lg">chat_bubble</span>
              Discuss in Chat
            </Button>
          </>
        ) : (
          <>
            {!saving && (
              <Button className="rounded-full" onClick={handleSave}>
                <span className="material-symbols-outlined mr-2 text-lg">eco</span>
                Save to Garden
              </Button>
            )}
            <Button variant="ghost" className="rounded-full text-on-surface-variant" onClick={() => router.push('/chat')}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export default function SharePage() {
  return (
    <Suspense>
      <ShareHandler />
    </Suspense>
  )
}
