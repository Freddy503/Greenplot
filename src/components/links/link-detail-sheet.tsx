'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

interface LinkItem {
  id: string
  url: string
  title: string
  summary: string
  domain: string
  tags: string[]
  favicon: string
  status?: string
  starred: boolean
  connection_count?: number
  garden_seed_id?: string
  addedAt: string
  enrichedAt?: string
}

interface RelatedItem {
  id: string
  title: string
  domain: string
  summary: string
  type: string
}

function LinkDetailSheet({
  link,
  open,
  onOpenChange,
}: {
  link: LinkItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [related, setRelated] = useState<RelatedItem[]>([])
  const [loadingRelated, setLoadingRelated] = useState(false)

  useEffect(() => {
    if (link && open) {
      setLoadingRelated(true)
      const token = localStorage.getItem('greenplot_token')
      fetch(`/api/links/${link.id}/related`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then(data => setRelated(data.related || []))
        .catch(() => {})
        .finally(() => setLoadingRelated(false))
    }
  }, [link, open])

  if (!link) return null

  const tags = link.tags || []
  const statusColors: Record<string, string> = {
    enriched: 'bg-green-500/10 text-green-400',
    pending: 'bg-amber-500/10 text-amber-400',
    connected: 'bg-blue-500/10 text-blue-400',
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md bg-surface-container border-outline-variant/10 overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden">
              <img src={link.favicon} alt="" className="w-5 h-5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-on-surface text-left truncate">{link.title}</SheetTitle>
              <SheetDescription className="text-on-surface-variant/60 text-left">
                {link.domain}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Status + Stats */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Badge className={`text-[10px] border-0 ${statusColors[link.status || ''] || 'bg-surface-container-high text-on-surface-variant'}`}>
            {link.status || 'pending'}
          </Badge>
          {link.starred && (
            <Badge className="text-[10px] border-0 bg-amber-500/10 text-amber-400">
              ⭐ starred
            </Badge>
          )}
          {link.garden_seed_id && (
            <Badge className="text-[10px] border-0 bg-primary/10 text-primary">
              🌱 in garden
            </Badge>
          )}
        </div>

        {/* Summary */}
        {link.summary && (
          <Card className="bg-surface-container-low border-outline-variant/10 mb-4">
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-2">Summary</p>
              <p className="text-sm text-on-surface-variant leading-relaxed">{link.summary}</p>
            </CardContent>
          </Card>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag, i) => (
                <Badge key={i} variant="outline" className="text-[10px] bg-surface-container-high border-outline-variant/20">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* URL */}
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-2">Source</p>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline break-all"
          >
            {link.url}
          </a>
        </div>

        {/* Cross-Tab: Related Items */}
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>hub</span>
            Connections
          </p>
          {loadingRelated ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-12 bg-surface-container-high rounded-xl animate-pulse" />
              ))}
            </div>
          ) : related.length > 0 ? (
            <div className="space-y-2">
              {related.map((item, i) => (
                <Card key={i} className="bg-surface-container-low border-outline-variant/10">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Badge variant="outline" className={`text-[9px] border-0 shrink-0 ${
                      item.type === 'wiki' ? 'bg-blue-500/10 text-blue-400' :
                      item.type === 'seed' ? 'bg-primary/10 text-primary' :
                      'bg-surface-container-high text-on-surface-variant'
                    }`}>
                      {item.type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-on-surface truncate">{item.title}</p>
                      {item.summary && (
                        <p className="text-[10px] text-on-surface-variant/60 truncate">{item.summary}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-xs text-on-surface-variant/40 italic">No connections yet. Enrich this link to discover related content.</p>
          )}
        </div>

        {/* Wiki Compilation Suggestion */}
        {related.length >= 3 && (
          <Card className="bg-blue-500/5 border-blue-500/15 mb-4">
            <CardContent className="p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-400 mt-0.5" style={{ fontVariationSettings: '"FILL" 1' }}>auto_stories</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-blue-400 mb-0.5">Compile Wiki Article?</p>
                <p className="text-[10px] text-on-surface-variant/60 mb-3">
                  {related.length} connected items found. We can synthesize them into a wiki article.
                </p>
                <Button
                  size="sm"
                  className="rounded-full bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border-0 text-[10px] h-7"
                  onClick={async () => {
                    const token = localStorage.getItem('greenplot_token')
                    try {
                      await fetch('/api/wiki', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({
                          link_ids: [link.id],
                          seed_ids: related.filter(r => r.type === 'seed').map(r => r.id),
                        }),
                      })
                      toast.success('Wiki article compiling... 📖')
                    } catch {
                      toast.error('Failed to start compilation')
                    }
                  }}
                >
                  <span className="material-symbols-outlined mr-1" style={{ fontSize: '14px' }}>auto_stories</span>
                  Compile Wiki
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-full text-xs"
            onClick={() => window.open(link.url, '_blank')}
          >
            <span className="material-symbols-outlined text-sm mr-1">open_in_new</span>
            Open
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-full text-xs"
            onClick={async () => {
              const token = localStorage.getItem('greenplot_token')
              await fetch(`/api/links/${link.id}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ starred: !link.starred }),
              })
            }}
          >
            <span className="material-symbols-outlined text-sm mr-1">star</span>
            {link.starred ? 'Unstar' : 'Star'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { LinkDetailSheet }
