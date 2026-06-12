'use client'

// PWA share-target handler — receives shares from the OS share sheet
// (manifest.json share_target → GET /share?title=&text=&url=) and plants
// them as seeds. Greenplot v2 styling.

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Leaf, MessageCircle, Sprout, Check, RotateCcw } from 'lucide-react'

function ShareHandler() {
  const params = useSearchParams()
  const router = useRouter()

  const sharedTitle = params.get('title') || ''
  const sharedText = params.get('text') || ''
  const sharedUrl = params.get('url') || ''
  const preview = sharedTitle || sharedUrl || sharedText

  const [state, setState] = useState<'saving' | 'saved' | 'error'>('saving')
  const savedOnce = useRef(false)

  const handleSave = async () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
    if (!token) {
      router.push(`/login?redirect=${encodeURIComponent('/share?' + params.toString())}`)
      return
    }
    setState('saving')
    const content = [sharedTitle, sharedText, sharedUrl].filter(Boolean).join('\n\n')
    try {
      const res = await fetch('/api/seeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: content.slice(0, 4000), source: 'share' }),
      })
      setState(res.ok ? 'saved' : 'error')
    } catch {
      setState('error')
    }
  }

  // Auto-save on mount so sharing feels instant (ref guards StrictMode double-fire)
  useEffect(() => {
    if (savedOnce.current) return
    savedOnce.current = true
    if (!preview) { router.replace('/chat'); return }
    handleSave()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '0 26px', textAlign: 'center', gap: 22 }}>
      {/* Status mark */}
      <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 9999, background: 'radial-gradient(circle, rgba(34,197,94,0.2), transparent 68%)' }} />
        {state === 'saving' && (
          <div style={{ position: 'absolute', inset: 0, borderRadius: 9999, border: '2px solid var(--green-tint-2, #dcf6e6)', borderTopColor: 'var(--green)', animation: 'gp-share-spin 1s linear infinite' }} />
        )}
        <div style={{ width: 72, height: 72, borderRadius: 9999, background: 'rgba(255,255,255,0.8)', boxShadow: 'inset 0 0 0 1px var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {state === 'saved'
            ? <Check size={32} color="var(--green-600, #16a34a)" strokeWidth={2.25} />
            : <Leaf size={32} color="var(--green)" strokeWidth={1.75} />}
        </div>
      </div>

      <div>
        <h1 className="serif" style={{ fontSize: 30, lineHeight: 1.1, color: 'var(--ink)', letterSpacing: '-0.02em', margin: 0 }}>
          {state === 'saved' ? 'Planted' : state === 'saving' ? 'Planting…' : 'Couldn’t plant that'}
        </h1>
        {preview && (
          <p className="body-text" style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 300, margin: '10px auto 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
            {preview}
          </p>
        )}
        {state === 'saved' && (
          <p className="body-text" style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
            It&rsquo;ll be enriched and connected to your garden automatically.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 300 }}>
        {state === 'saved' && (
          <>
            <button
              onClick={() => router.push(`/chat?prompt=${encodeURIComponent(`I just shared this into my garden — tell me how it connects to my existing seeds:\n\n${preview.slice(0, 280)}`)}`)}
              className="tap ui"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, border: 'none', borderRadius: 9999, background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 26px -10px rgba(34,197,94,0.6)' }}
            >
              <MessageCircle size={17} color="#fff" strokeWidth={2} />
              Chat about it
            </button>
            <button
              onClick={() => router.push('/garden')}
              className="tap ui"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 9999, background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
            >
              <Sprout size={16} color="var(--green-700)" strokeWidth={2} />
              View in Garden
            </button>
          </>
        )}
        {state === 'error' && (
          <button
            onClick={handleSave}
            className="tap ui"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, border: 'none', borderRadius: 9999, background: 'var(--green)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            <RotateCcw size={16} color="#fff" strokeWidth={2} />
            Retry
          </button>
        )}
        <button
          onClick={() => router.push('/chat')}
          className="tap ui"
          style={{ height: 40, border: 'none', background: 'transparent', color: 'var(--ink-3)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
        >
          {state === 'saved' ? 'Done' : 'Cancel'}
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gp-share-spin { to { transform: rotate(360deg); } }
      ` }} />
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
