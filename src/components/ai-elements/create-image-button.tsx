'use client'

import { useState } from 'react'
import { Shimmer } from '@/components/ai-elements/shimmer'

interface CreateImageButtonProps {
  reflectionText: string
  authToken: string
  onImageGenerated: (url: string, prompt: string) => void
}

export function CreateImageButton({
  reflectionText,
  authToken,
  onImageGenerated,
}: CreateImageButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  if (state === 'done') return null

  const handleGenerate = async () => {
    setState('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          prompt: reflectionText.slice(0, 1500),
          width: 1024,
          height: 1024,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(err.detail || `Generation failed (${res.status})`)
      }

      const data = await res.json()
      onImageGenerated(data.url, data.prompt)
      setState('done')
    } catch (err) {
      setErrorMsg((err as Error).message)
      setState('error')
    }
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-3 px-5 py-3 rounded-full bg-tertiary-container/10 border border-tertiary-container/20 animate-pulse">
        <span
          className="material-symbols-outlined text-tertiary animate-spin"
          style={{ fontSize: '18px' }}
        >
          progress_activity
        </span>
        <Shimmer className="text-xs font-semibold uppercase tracking-wide text-tertiary">
          ✨ Visualizing your idea…
        </Shimmer>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleGenerate}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all
          bg-tertiary-container/10 text-tertiary border border-tertiary-container/20
          hover:bg-tertiary-container/20 hover:border-tertiary-container/40 active:scale-95"
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}
        >
          auto_awesome
        </span>
        Visualize this idea
      </button>

      {state === 'error' && errorMsg && (
        <span className="text-[10px] text-error/70">{errorMsg}</span>
      )}
    </div>
  )
}
