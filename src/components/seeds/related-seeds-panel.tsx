'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface RelatedSeed {
  id: string
  title: string
  domain?: string
  summary?: string
  _additional?: { id: string; score?: number }
}

interface RelatedSeedsPanelProps {
  query: string
  token?: string
  className?: string
}

export function RelatedSeedsPanel({ query, token, className }: RelatedSeedsPanelProps) {
  const [seeds, setSeeds] = useState<RelatedSeed[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!query || query.length < 15) {
      setSeeds([])
      return
    }

    const timer = setTimeout(() => {
      setLoading(true)
      const params = new URLSearchParams({
        query: query.slice(0, 200),
        limit: '5',
      })

      fetch(`/api/seeds?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((r) => r.json())
        .then((data) => {
          const raw = data.seeds || data || []
          if (Array.isArray(raw)) {
            setSeeds(
              raw
                .filter((s: any) => {
                  const id = s._additional?.id || s.notion_id || s.id
                  return id // skip empty
                })
                .slice(0, 5)
                .map((s: any) => ({
                  id: s._additional?.id || s.notion_id || s.id || '',
                  title:
                    s.title ||
                    (s.text || '').split('\n')[0]?.slice(0, 60) ||
                    'Untitled',
                  domain: s.domain || '',
                  summary: s.summary || s.text?.slice(0, 120) || '',
                  _additional: s._additional,
                }))
            )
          }
        })
        .catch(() => setSeeds([]))
        .finally(() => setLoading(false))
    }, 800) // debounce

    return () => clearTimeout(timer)
  }, [query, token])

  if (seeds.length === 0 && !loading) return null

  return (
    <div className={cn('px-4 mb-3', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/50 hover:text-on-surface-variant transition-colors mb-2"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: '"FILL" 1' }}>
          park
        </span>
        {loading
          ? 'Finding related seeds…'
          : `${seeds.length} related seed${seeds.length !== 1 ? 's' : ''}`}
        {seeds.length > 0 && (
          <span className="material-symbols-outlined transition-transform" style={{ fontSize: '14px', transform: expanded ? 'rotate(180deg)' : 'none' }}>
            expand_more
          </span>
        )}
      </button>

      {expanded && seeds.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1">
          {seeds.map((seed) => (
            <div
              key={seed.id}
              className="flex items-center gap-2 bg-surface-container-low rounded-full px-3 py-1.5 border border-outline-variant/10 hover:border-primary/20 transition-colors cursor-default group"
            >
              <span
                className="material-symbols-outlined text-primary/60 group-hover:text-primary transition-colors"
                style={{ fontSize: '14px', fontVariationSettings: '"FILL" 1' }}
              >
                eco
              </span>
              <span className="text-xs font-medium text-on-surface-variant group-hover:text-on-surface transition-colors max-w-[180px] truncate">
                {seed.title}
              </span>
              {seed.domain && (
                <Badge
                  variant="outline"
                  className="text-[8px] px-1.5 py-0 bg-surface-container-high border-outline-variant/15 text-on-surface-variant/60"
                >
                  {seed.domain.split(',')[0]?.trim()}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
