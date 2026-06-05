'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface UnifiedResult {
  id: string
  type: 'seed' | 'link' | 'wiki'
  title: string
  summary: string
  url?: string
}

const TYPE_STYLE: Record<string, string> = {
  seed: 'bg-primary/10 text-primary',
  link: 'bg-blue-500/10 text-blue-400',
  wiki: 'bg-amber-500/10 text-amber-400',
}

const TYPE_ICON: Record<string, string> = {
  seed: 'eco',
  link: 'link',
  wiki: 'auto_stories',
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UnifiedResult[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(''); setResults([]) }
  }, [open])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') : null
      const res = await fetch('/api/search/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ query: q, limit: 12 }),
      })
      const data = await res.json()
      setResults(data.results || [])
    } catch {}
    setLoading(false)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(q), 280)
  }

  const handleSelect = (r: UnifiedResult) => {
    setOpen(false)
    if (r.type === 'link' && r.url) window.open(r.url, '_blank')
    else if (r.type === 'wiki') router.push('/wiki')
    else router.push('/garden')
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant hover:text-primary"
        aria-label="Search everything"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>search</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 px-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-lg bg-surface-container-high border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/10">
              <span className="material-symbols-outlined text-on-surface-variant/50 shrink-0" style={{ fontSize: '20px' }}>search</span>
              <input
                ref={inputRef}
                value={query}
                onChange={handleChange}
                placeholder="Search seeds, sources, wiki…"
                className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none"
              />
              {loading
                ? <span className="material-symbols-outlined text-on-surface-variant/50 animate-spin shrink-0" style={{ fontSize: '18px' }}>progress_activity</span>
                : <button onClick={() => setOpen(false)} className="text-on-surface-variant/50 hover:text-on-surface transition-colors shrink-0">
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                  </button>
              }
            </div>

            {/* Results list */}
            <div className="max-h-80 overflow-y-auto">
              {query.length < 2 && (
                <p className="text-xs text-on-surface-variant/40 text-center py-8">
                  Type 2+ characters to search across seeds, sources &amp; wiki
                </p>
              )}
              {query.length >= 2 && !loading && results.length === 0 && (
                <p className="text-xs text-on-surface-variant/40 text-center py-8">No results for &ldquo;{query}&rdquo;</p>
              )}
              {results.map((r, i) => (
                <button
                  key={`${r.type}-${r.id}-${i}`}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors text-left border-b border-outline-variant/5 last:border-0"
                >
                  <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${TYPE_STYLE[r.type] ?? 'bg-surface-container text-on-surface-variant'}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: '15px', fontVariationSettings: '"FILL" 1' }}>
                      {TYPE_ICON[r.type] ?? 'article'}
                    </span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{r.title}</p>
                    {r.summary && <p className="text-[10px] text-on-surface-variant/60 truncate">{r.summary}</p>}
                  </div>
                  <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full ${TYPE_STYLE[r.type] ?? ''}`}>
                    {r.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
