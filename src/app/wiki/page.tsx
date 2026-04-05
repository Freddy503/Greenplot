'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import { WikiLintPanel } from '@/components/wiki/wiki-lint-panel'

// ── Types ─────────────────────────────────────────────

interface WikiArticle {
  id: string
  title: string
  content: string
  category: string
  backlinks: string[]
  createdAt: string
  updatedAt: string
  seedIds?: string[]
  sourceSeedIds?: string[]
  sourceLinkIds?: string[]
  summary?: string
  imageUrl?: string
}

interface ConceptNode {
  id: string
  label: string
  type: 'article' | 'seed' | 'link'
  category?: string
  size: number
}

interface ConceptLink {
  source: string
  target: string
  type: string
  shared_count?: number
}

// ── Helpers ───────────────────────────────────────────

function getCategoryIcon(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('concept') || c.includes('idea')) return 'lightbulb'
  if (c.includes('project') || c.includes('plan')) return 'rocket_launch'
  if (c.includes('research') || c.includes('study') || c.includes('science')) return 'science'
  if (c.includes('design') || c.includes('creative')) return 'palette'
  if (c.includes('tech') || c.includes('code') || c.includes('dev')) return 'terminal'
  if (c.includes('brand') || c.includes('marketing')) return 'campaign'
  if (c.includes('product') || c.includes('feature')) return 'widgets'
  return 'article'
}

function getCategoryColor(category: string): string {
  const c = category.toLowerCase()
  if (c.includes('concept') || c.includes('idea')) return 'bg-amber-500/10 text-amber-400'
  if (c.includes('project') || c.includes('plan')) return 'bg-blue-500/10 text-blue-400'
  if (c.includes('research') || c.includes('study')) return 'bg-purple-500/10 text-purple-400'
  if (c.includes('design')) return 'bg-pink-500/10 text-pink-400'
  if (c.includes('tech') || c.includes('dev')) return 'bg-green-500/10 text-green-400'
  if (c.includes('brand')) return 'bg-red-500/10 text-red-400'
  if (c.includes('product')) return 'bg-cyan-500/10 text-cyan-400'
  return 'bg-primary/10 text-primary'
}

function timeAgo(date: string): string {
  const now = new Date()
  const d = new Date(date)
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

// ── Wikipedia-Style Content Parser ────────────────────

interface ParsedSection {
  id: string
  level: number
  title: string
  content: string[]
}

interface ParsedArticle {
  lead: string[]
  toc: { id: string; title: string; level: number }[]
  sections: ParsedSection[]
  infobox: Record<string, string> | null
  seeAlso: string[]
  references: string[]
  footer: string | null
}

function parseWikiContent(content: string): ParsedArticle {
  const lines = content.split('\n')
  const result: ParsedArticle = {
    lead: [],
    toc: [],
    sections: [],
    infobox: null,
    seeAlso: [],
    references: [],
    footer: null,
  }

  let currentSection: ParsedSection | null = null
  let inToc = false
  let inInfobox = false
  let inSeeAlso = false
  let inReferences = false
  let infoboxLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines in certain contexts
    if (!trimmed && !currentSection && result.lead.length === 0) continue

    // Detect Table of Contents
    if (trimmed.startsWith('## Contents') || trimmed.startsWith('## Table of Contents')) {
      inToc = true
      continue
    }

    // Detect TOC items
    if (inToc && trimmed.startsWith('- [')) {
      const match = trimmed.match(/- \[(.+?)\]\(#(.+?)\)/)
      if (match) {
        result.toc.push({ id: match[2], title: match[1], level: 1 })
      }
      continue
    }

    // Detect infobox (:::infobox or | Field | Value |)
    if (trimmed.startsWith(':::infobox')) {
      inInfobox = true
      infoboxLines = []
      continue
    }
    if (inInfobox && trimmed.startsWith(':::')) {
      inInfobox = false
      result.infobox = parseInfobox(infoboxLines)
      continue
    }
    if (inInfobox) {
      infoboxLines.push(trimmed)
      continue
    }

    // Detect sections
    const h2Match = trimmed.match(/^## (.+)/)
    const h3Match = trimmed.match(/^### (.+)/)

    if (h2Match) {
      const title = h2Match[1].trim()
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

      // Check for special sections
      if (title.toLowerCase().includes('see also')) {
        inSeeAlso = true
        inReferences = false
        inToc = false
        currentSection = null
        continue
      }
      if (title.toLowerCase().includes('reference')) {
        inReferences = true
        inSeeAlso = false
        inToc = false
        currentSection = null
        continue
      }

      inToc = false
      inSeeAlso = false
      inReferences = false

      currentSection = { id, level: 2, title, content: [] }
      result.sections.push(currentSection)
      continue
    }

    if (h3Match && currentSection) {
      const title = h3Match[1].trim()
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      currentSection.content.push(`### ${title}`)
      continue
    }

    // Detect footer
    if (trimmed.startsWith('*Last updated:') || trimmed.startsWith('*Exported from')) {
      result.footer = trimmed.replace(/^\*|\*$/g, '')
      continue
    }

    // Collect content
    if (inSeeAlso) {
      // Parse wikilinks [[Topic]]
      const wikiMatch = trimmed.match(/\[\[(.+?)\]\]/g)
      if (wikiMatch) {
        wikiMatch.forEach(m => {
          result.seeAlso.push(m.replace(/\[\[|\]\]/g, ''))
        })
      } else if (trimmed.startsWith('- ')) {
        result.seeAlso.push(trimmed.slice(2))
      }
      continue
    }

    if (inReferences) {
      if (trimmed.match(/^\d+\./)) {
        result.references.push(trimmed)
      }
      continue
    }

    if (currentSection) {
      currentSection.content.push(trimmed)
    } else {
      // Lead section (before any heading)
      if (trimmed && !trimmed.startsWith('#')) {
        result.lead.push(trimmed)
      }
    }
  }

  // If no explicit sections found, try to detect from content
  if (result.sections.length === 0 && result.lead.length === 0) {
    // Fallback: treat all content as lead
    result.lead = lines.filter(l => l.trim() && !l.startsWith('#'))
  }

  return result
}

function parseInfobox(lines: string[]): Record<string, string> {
  const infobox: Record<string, string> = {}
  for (const line of lines) {
    if (line.startsWith('|') && !line.startsWith('|---')) {
      const parts = line.split('|').filter(p => p.trim())
      if (parts.length >= 2) {
        infobox[parts[0].trim()] = parts[1].trim()
      }
    }
  }
  return infobox
}

// ── Infobox Component ─────────────────────────────────

function Infobox({ data, article }: { data: Record<string, string>; article: WikiArticle }) {
  const entries = Object.entries(data)
  if (entries.length === 0) {
    // Auto-generate infobox from article metadata
    return (
      <div className="float-right ml-4 mb-4 w-56 bg-surface-container border border-outline-variant/10 rounded-xl overflow-hidden">
        <div className="bg-primary/10 px-3 py-2 text-center">
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Quick Facts</span>
        </div>
        <div className="p-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Category</span>
            <span className="font-bold text-on-surface">{article.category}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Updated</span>
            <span className="font-bold text-on-surface">{new Date(article.updatedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Sources</span>
            <span className="font-bold text-on-surface">{(article.sourceLinkIds || []).length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Connections</span>
            <span className="font-bold text-on-surface">{article.backlinks.length}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="float-right ml-4 mb-4 w-56 bg-surface-container border border-outline-variant/10 rounded-xl overflow-hidden">
      <div className="bg-primary/10 px-3 py-2 text-center">
        <span className="text-xs font-bold text-primary uppercase tracking-wider">Quick Facts</span>
      </div>
      <div className="p-3 space-y-2 text-xs">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between">
            <span className="text-on-surface-variant">{key}</span>
            <span className="font-bold text-on-surface">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}



// ── Concept Map Component (D3.js) ────────────────────

function ConceptMap({ articleId, token }: { articleId: string; token: string | null }) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<{ nodes: ConceptNode[]; links: ConceptLink[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/wiki/${articleId}/concept-map`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(d => {
        if (d.nodes) setData(d)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [articleId, token])

  useEffect(() => {
    if (!data || !canvasRef.current) return

    const container = canvasRef.current
    const width = container.clientWidth
    const height = 250

    // Clear previous
    d3.select(container).selectAll('*').remove()

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)

    // Color by type
    const color = (type: string) => {
      if (type === 'article') return '#16a34a'
      if (type === 'seed') return '#f59e0b'
      return '#6366f1'
    }

    // Create simulation — cast nodes to SimulationNodeDatum since D3 mutates x/y properties
    const simulation = d3.forceSimulation<any>(data.nodes)
      .force('link', d3.forceLink(data.links).id((d: any) => d.id).distance(60))
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(width / 2, height / 2))

    // Draw links
    const link = svg.append('g')
      .selectAll('line')
      .data(data.links)
      .enter()
      .append('line')
      .attr('stroke', '#334155')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', (d: any) => d.type === 'shared-source' ? '4,2' : 'none')

    // Draw nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(data.nodes)
      .enter()
      .append('circle')
      .attr('r', (d: any) => d.size)
      .attr('fill', (d: any) => d.type === 'article' ? '#16a34a' : d.type === 'seed' ? '#f59e0b' : '#6366f1')
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')

    // Draw labels
    const label = svg.append('g')
      .selectAll('text')
      .data(data.nodes)
      .enter()
      .append('text')
      .text((d: any) => truncate(d.label, 20))
      .attr('font-size', '10px')
      .attr('fill', '#94a3b8')
      .attr('text-anchor', 'middle')
      .attr('dy', (d: any) => (d.size || 10) + 12)

    // Simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y)

      label
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y)
    })

    return () => { simulation.stop() }
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[250px] bg-surface-container rounded-xl">
        <span className="material-symbols-outlined animate-spin text-on-surface-variant/40">progress_activity</span>
      </div>
    )
  }

  if (!data || data.nodes.length <= 1) {
    return (
      <div className="flex items-center justify-center h-[150px] bg-surface-container rounded-xl text-on-surface-variant/40 text-xs">
        No connections yet
      </div>
    )
  }

  return (
    <div className="bg-surface-container rounded-xl overflow-hidden border border-outline-variant/10">
      <div ref={canvasRef} className="w-full" />
      <div className="flex items-center justify-center gap-4 px-3 py-2 border-t border-outline-variant/10">
        <span className="flex items-center gap-1 text-[9px] text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-primary" /> Article
        </span>
        <span className="flex items-center gap-1 text-[9px] text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-amber-400" /> Seed
        </span>
        <span className="flex items-center gap-1 text-[9px] text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-indigo-400" /> Source
        </span>
      </div>
    </div>
  )
}

// ── Wikipedia-Style Markdown Renderer ─────────────────

function WikiContent({ parsed, article }: { parsed: ParsedArticle; article: WikiArticle }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      {/* Infobox */}
      <Infobox data={parsed.infobox || {}} article={article} />

      {/* Lead section */}
      {parsed.lead.map((line, i) => (
        <p key={i} className="text-sm text-on-surface-variant leading-relaxed mb-2">{line}</p>
      ))}

      <div className="clear-both" />

      {/* Table of Contents */}
      {parsed.toc.length > 0 && (
        <div className="my-4 p-4 bg-surface-container rounded-xl border border-outline-variant/10">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Contents</p>
          <nav className="space-y-1">
            {parsed.toc.map((item, i) => (
              <a
                key={i}
                href={`#${item.id}`}
                className="block text-sm text-primary hover:text-primary/80 transition-colors py-0.5"
              >
                {i + 1}. {item.title}
              </a>
            ))}
          </nav>
        </div>
      )}

      {/* Sections */}
      {parsed.sections.map((section) => (
        <section key={section.id} id={section.id} className="mb-6 scroll-mt-24">
          <h2 className="text-lg font-extrabold text-on-surface mt-6 mb-3 pb-1 border-b border-outline-variant/10">
            {section.title}
          </h2>
          {section.content.map((line, i) => {
            if (line.startsWith('### ')) {
              return (
                <h3 key={i} className="text-base font-bold text-on-surface mt-4 mb-2">
                  {line.slice(4)}
                </h3>
              )
            }
            if (line.startsWith('- ')) {
              return (
                <li key={i} className="text-sm text-on-surface-variant ml-4 mb-1 list-disc">
                  {renderInlineFormatting(line.slice(2))}
                </li>
              )
            }
            if (line.match(/^\d+\./)) {
              return (
                <li key={i} className="text-sm text-on-surface-variant ml-4 mb-1 list-decimal">
                  {renderInlineFormatting(line.slice(line.indexOf('.') + 1).trim())}
                </li>
              )
            }
            if (line.trim()) {
              return (
                <p key={i} className="text-sm text-on-surface-variant leading-relaxed mb-2">
                  {renderInlineFormatting(line)}
                </p>
              )
            }
            return null
          })}
        </section>
      ))}

      {/* See Also */}
      {parsed.seeAlso.length > 0 && (
        <section className="mb-6">
          <h2 className="text-lg font-extrabold text-on-surface mt-6 mb-3 pb-1 border-b border-outline-variant/10">
            See Also
          </h2>
          <div className="flex flex-wrap gap-2">
            {parsed.seeAlso.map((topic, i) => (
              <Badge key={i} variant="outline" className="bg-primary/10 text-primary border-0 cursor-pointer hover:bg-primary/20 transition-colors">
                {topic}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* References */}
      {parsed.references.length > 0 && (
        <section className="mb-6" id="source-links">
          <h2 className="text-lg font-extrabold text-on-surface mt-6 mb-3 pb-1 border-b border-outline-variant/10">
            References
          </h2>
          <ol className="space-y-1 text-xs text-on-surface-variant">
            {parsed.references.map((ref, i) => {
              const refNum = i + 1
              const refId = `reference-${refNum}`
              // Bare URLs in references like: "Title. https://url"
              const urlMatch = ref.match(/(https?:\/\/[^\s]+)/)
              return (
                <li key={i} id={refId} className="flex gap-2 scroll-mt-24">
                  <span className="text-primary font-bold">[{refNum}]</span>
                  <span className="leading-relaxed">
                    {urlMatch ? (
                      <>
                        {renderInlineFormatting(ref.replace(/\bhttps?:\/\/[^\s]+\b/, '').trim())}
                        {' '}
                        <a href={urlMatch[1]} target="_blank" rel="noopener" className="text-primary hover:underline underline-offset-2 break-all">
                          {urlMatch[1]}
                        </a>
                      </>
                    ) : (
                      renderInlineFormatting(ref.replace(/^\d+\.\s*/, ''))
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* Footer */}
      {parsed.footer && (
        <div className="mt-8 pt-4 border-t border-outline-variant/10 text-[10px] text-on-surface-variant/50 italic">
          {parsed.footer}
        </div>
      )}
    </div>
  )
}

// ── Inline Formatting (bold, links, citations) ────────

function renderInlineFormatting(text: string): React.ReactNode {
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Markdown links [text](url)
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-primary hover:underline">$1</a>')
  // Bare URLs (https://...)
  text = text.replace(/(https?:\/\/[^\s<>"')]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-primary hover:underline">$1</a>')
  // Bare URLs (https://...)
  text = text.replace(/(https?:\/\/[^\s<>]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-primary hover:underline">$1</a>')
  // Citations [1], [2] - make them anchor links to references section
  text = text.replace(/\[(\d+)\]/g, '<a href="#reference-$1" class="text-primary text-[10px] font-bold hover:underline">[$1]</a>')

  return <span dangerouslySetInnerHTML={{ __html: text }} />
}

// ── Wiki Card ─────────────────────────────────────────

function WikiCard({ article, onClick }: { article: WikiArticle; onClick: () => void }) {
  const icon = getCategoryIcon(article.category)
  const color = getCategoryColor(article.category)
  const preview = truncate(article.summary || article.content.replace(/[#*_`]/g, ''), 120)

  return (
    <Card
      className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Icon or Image */}
          {article.imageUrl ? (
            <div className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden">
              <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: '"FILL" 1' }}>
                {icon}
              </span>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors leading-snug">
              {article.title}
            </h3>
            <p className="text-xs text-on-surface-variant/60 mt-1 leading-relaxed line-clamp-2">
              {preview}
            </p>

            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <Badge variant="outline" className={`text-[9px] px-2 py-0.5 border-0 ${color}`}>
                {article.category}
              </Badge>
              {article.backlinks.length > 0 && (
                <span className="flex items-center gap-0.5 text-[9px] text-secondary/60">
                  <span className="material-symbols-outlined" style={{ fontSize: '10px', fontVariationSettings: '"FILL" 1' }}>link</span>
                  {article.backlinks.length}
                </span>
              )}
              <span className="text-[9px] text-on-surface-variant/40 ml-auto">
                {timeAgo(article.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Article Detail View (Wikipedia-Style) ─────────────

function ArticleDetail({ article, onBack, allArticles }: { article: WikiArticle; onBack: () => void; allArticles: WikiArticle[] }) {
  const icon = getCategoryIcon(article.category)
  const color = getCategoryColor(article.category)
  const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') : null

  // Parse content
  const parsed = useMemo(() => parseWikiContent(article.content), [article.content])

  // Find linked articles
  const linked = allArticles.filter(a => article.backlinks.includes(a.id))

  // Source Hub links + Garden seeds
  const [sourceLinks, setSourceLinks] = useState<Array<{id: string; title: string; url: string; domain: string}>>([])
  const [sourceSeeds, setSourceSeeds] = useState<Array<{id: string; title: string}>>([])
  const [loadingSources, setLoadingSources] = useState(false)

  // Image generation
  const [generatingImage, setGeneratingImage] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(article.imageUrl || null)

  useEffect(() => {
    const linkIds = article.sourceLinkIds || []
    const seedIds = article.sourceSeedIds || []

    if (linkIds.length === 0 && seedIds.length === 0) return

    setLoadingSources(true)

    const fetches: Promise<void>[] = []

    if (linkIds.length > 0) {
      fetches.push(
        fetch('/api/links', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then(r => r.ok ? r.json() : { links: [] })
          .then(data => {
            const matched = (data.links || []).filter((l: any) => linkIds.includes(l.id))
            setSourceLinks(matched.map((l: any) => ({ id: l.id, title: l.title, url: l.url, domain: l.domain })))
          })
          .catch(() => {})
      )
    }

    if (seedIds.length > 0) {
      fetches.push(
        fetch(`/api/seeds?limit=50`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then(r => r.ok ? r.json() : { seeds: [] })
          .then(data => {
            const seeds = data.seeds || data || []
            const matched = Array.isArray(seeds) ? seeds.filter((s: any) => seedIds.includes(s.id || s._additional?.id)) : []
            setSourceSeeds(matched.map((s: any) => ({ id: s.id || s._additional?.id, title: s.title || s.content?.split('\n')[0]?.slice(0, 60) || 'Untitled' })))
          })
          .catch(() => {})
      )
    }

    Promise.all(fetches).finally(() => setLoadingSources(false))
  }, [article.id])

  // Generate BFL image
  const handleGenerateImage = async () => {
    setGeneratingImage(true)
    try {
      const res = await fetch(`/api/wiki/${article.id}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json()
      if (data.ok && data.image_url) {
        setImageUrl(data.image_url)
      }
    } catch {}
    setGeneratingImage(false)
  }

  return (
    <div className="animate-in slide-in-from-right duration-200">
      {/* Back button */}
      <div className="flex items-center justify-between mb-4 px-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          <span className="font-bold">Plants</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={handleGenerateImage}
            disabled={generatingImage}
            className="flex items-center gap-1 text-sm text-on-surface-variant/60 hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container"
            title="Generate concept image"
          >
            {generatingImage ? (
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-lg">image</span>
            )}
          </button>
          <button
            onClick={() => {
              window.open(`/api/wiki/${article.id}/export?token=${token}`, '_blank')
            }}
            className="flex items-center gap-1 text-sm text-on-surface-variant/60 hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container"
            title="Download as Markdown"
          >
            <span className="material-symbols-outlined text-lg">download</span>
          </button>
        </div>
      </div>

      {/* Hero Image */}
      {imageUrl && (
        <div className="mb-6 rounded-2xl overflow-hidden aspect-video">
          <img src={imageUrl} alt={article.title} className="w-full h-full object-cover" />
        </div>
      )}

      {/* Article header */}
      <div className="flex items-start gap-3 mb-6 px-2">
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
          <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>
            {icon}
          </span>
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-on-surface leading-tight">
            {article.title}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border-0 ${color}`}>
              {article.category}
            </Badge>
            <span className="text-[10px] text-on-surface-variant/50">
              Updated {timeAgo(article.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Wikipedia-Style Content */}
      <Card className="bg-surface-container-low border-outline-variant/10 mb-6">
        <CardContent className="p-5">
          <WikiContent parsed={parsed} article={article} />
        </CardContent>
      </Card>

      {/* Concept Map */}
      <section className="mb-6 px-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 flex items-center gap-1">
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>hub</span>
          Knowledge Graph
        </h3>
        <ConceptMap articleId={article.id} token={token} />
      </section>

      {/* Backlinks */}
      {linked.length > 0 && (
        <section className="px-2 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>link</span>
            Backlinks
          </h3>
          <div className="space-y-2">
            {linked.map(a => (
              <div
                key={a.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm text-on-surface-variant/40">{getCategoryIcon(a.category)}</span>
                <span className="text-sm font-medium text-on-surface">{a.title}</span>
                <span className="text-[9px] text-on-surface-variant/40 ml-auto">{a.category}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Source Hub Links */}
      {sourceLinks.length > 0 && (
        <section className="px-2 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>language</span>
            Sources
          </h3>
          <div className="space-y-2">
            {sourceLinks.map(link => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/10 hover:border-blue-400/20 transition-all"
              >
                <span className="material-symbols-outlined text-blue-400 shrink-0" style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}>link</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-on-surface truncate">{link.title}</p>
                  <p className="text-[10px] text-on-surface-variant/60">{link.domain}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Source Garden Seeds */}
      {sourceSeeds.length > 0 && (
        <section className="px-2 mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant/60 mb-3 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>eco</span>
            Garden Seeds
          </h3>
          <div className="space-y-2">
            {sourceSeeds.map(seed => (
              <div
                key={seed.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/10"
              >
                <span className="material-symbols-outlined text-primary shrink-0" style={{ fontSize: '16px', fontVariationSettings: '"FILL" 1' }}>eco</span>
                <span className="text-xs font-medium text-on-surface">{seed.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Page (unchanged from here) ────────────────────────

export default function WikiPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<WikiArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedArticle, setSelectedArticle] = useState<WikiArticle | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // Health dashboard state
  const [health, setHealth] = useState<any>(null)
  const [healthOpen, setHealthOpen] = useState(false)

  // Ask Garden state
  const [askQuestion, setAskQuestion] = useState('')
  const [askAnswer, setAskAnswer] = useState('')
  const [askSources, setAskSources] = useState<any[]>([])
  const [asking, setAsking] = useState(false)
  const [askOpen, setAskOpen] = useState(false)

  // Load wiki articles from API
  useEffect(() => {
    const token = localStorage.getItem('greenplot_token')
    fetch('/api/wiki', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => {
        setArticles(data.articles || [])
      })
      .catch(() => {
        const stored = localStorage.getItem('greenplot_wiki')
        if (stored) { try { setArticles(JSON.parse(stored)) } catch {} }
      })
      .finally(() => setLoading(false))

    // Load health data
    fetch('/api/garden/health', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => { if (!data.error) setHealth(data) })
      .catch(() => {})
  }, [])

  // Ask garden
  const handleAsk = async () => {
    if (!askQuestion.trim()) return
    setAsking(true)
    setAskAnswer('')
    setAskSources([])

    try {
      const token = localStorage.getItem('greenplot_token')
      const res = await fetch('/api/garden/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: askQuestion }),
      })
      const data = await res.json()
      setAskAnswer(data.answer || 'No answer found.')
      setAskSources(data.sources || [])
    } catch {
      setAskAnswer('Could not reach the garden. Try again later.')
    }
    setAsking(false)
  }

  // Get unique categories
  const categories = Array.from(new Set(articles.map(a => a.category)))

  // Filter
  const filtered = articles
    .filter(a => filter === 'all' || a.category === filter)
    .filter(a => {
      if (!search) return true
      const q = search.toLowerCase()
      return a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  // Selected article detail
  if (selectedArticle) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="pt-14 pb-20 px-3 sm:px-4 md:px-6 max-w-7xl mx-auto mx-auto w-full">
          <ArticleDetail
            article={selectedArticle}
            onBack={() => setSelectedArticle(null)}
            allArticles={articles}
          />
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="pt-14 pb-20 px-3 sm:px-4 md:px-6 max-w-7xl mx-auto mx-auto w-full">
        {/* Hero */}
        <section className="mb-6 px-2">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-3xl font-extrabold tracking-tight leading-tight text-on-surface">
              Knowledge <span className="text-primary">Plants</span>
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const token = localStorage.getItem('greenplot_token')
                  window.open(`/api/wiki/export/obsidian?token=${token}`, '_blank')
                }}
                className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant/60 hover:text-primary"
                title="Export as Obsidian vault"
              >
                <span className="material-symbols-outlined text-lg">folder_zip</span>
              </button>
              <button
                onClick={() => {
                  const token = localStorage.getItem('greenplot_token')
                  window.open(`/api/garden/export-training?token=${token}`, '_blank')
                }}
                className="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant/60 hover:text-primary"
                title="Export training data"
              >
                <span className="material-symbols-outlined text-lg">model_training</span>
              </button>
            </div>
          </div>
          <p className="text-sm leading-relaxed max-w-xs text-on-surface-variant mt-1">
            Compiled articles from your garden seeds. Auto-maintained by your agents.
          </p>
        </section>

        {/* Stats bar */}
        {!loading && articles.length > 0 && (
          <div className="flex items-center gap-3 mb-5 px-2">
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>auto_stories</span>
              <span className="font-bold">{articles.length}</span> articles
            </div>
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>link</span>
              <span className="font-bold">{articles.reduce((sum, a) => sum + a.backlinks.length, 0)}</span> connections
            </div>
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant/60">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>folder</span>
              <span className="font-bold">{categories.length}</span> categories
            </div>
          </div>
        )}

        {/* Garden Health Dashboard */}
        {health && (
          <div className="mb-5">
            <button
              onClick={() => setHealthOpen(!healthOpen)}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/20 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: '"FILL" 1' }}>monitoring</span>
                <div className="text-left">
                  <p className="text-sm font-bold text-on-surface">Garden Health</p>
                  <p className="text-[10px] text-on-surface-variant">
                    {health.coverage?.enrichment || 0}% enriched · {health.coverage?.wiki || 0}% in wiki · {health.summary?.orphan_links || 0} orphans
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined text-on-surface-variant/40 transition-transform" style={{ transform: healthOpen ? 'rotate(180deg)' : '' }}>
                expand_more
              </span>
            </button>

            {healthOpen && (
              <div className="mt-3 space-y-3 animate-in slide-in-from-top duration-200">
                <Card className="bg-surface-container-low border-outline-variant/10">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-on-surface-variant">Enrichment Coverage</span>
                        <span className="font-bold text-primary">{health.coverage?.enrichment || 0}%</span>
                      </div>
                      <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${health.coverage?.enrichment || 0}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-on-surface-variant">Plants Coverage</span>
                        <span className="font-bold text-secondary">{health.coverage?.wiki || 0}%</span>
                      </div>
                      <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                        <div className="h-full bg-secondary rounded-full transition-all" style={{ width: `${health.coverage?.wiki || 0}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Wiki Lint */}
        <div className="mb-5">
          <WikiLintPanel />
        </div>

        {/* Ask Garden */}
        <div className="mb-5">
          <button
            onClick={() => setAskOpen(!askOpen)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-primary/20 transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: '"FILL" 1' }}>psychology</span>
              <div className="text-left">
                <p className="text-sm font-bold text-on-surface">Ask Your Garden</p>
                <p className="text-[10px] text-on-surface-variant">Questions grounded in your knowledge base</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant/40 transition-transform" style={{ transform: askOpen ? 'rotate(180deg)' : '' }}>
              expand_more
            </span>
          </button>

          {askOpen && (
            <div className="mt-3 space-y-3 animate-in slide-in-from-top duration-200">
              <div className="flex gap-2">
                <input
                  placeholder="What do I know about X?"
                  value={askQuestion}
                  onChange={(e) => setAskQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                  className="flex-1 px-4 py-2.5 rounded-full bg-surface-container-low border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30 transition-colors"
                />
                <Button
                  onClick={handleAsk}
                  disabled={!askQuestion.trim() || asking}
                  className="rounded-full bg-secondary text-on-primary hover:bg-secondary/90 font-bold px-5"
                >
                  {asking ? (
                    <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: '"FILL" 1' }}>search</span>
                  )}
                </Button>
              </div>

              {askAnswer && (
                <Card className="bg-surface-container-low border-outline-variant/10">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-secondary mt-0.5" style={{ fontVariationSettings: '"FILL" 1' }}>psychology</span>
                      <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap flex-1">{askAnswer}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {askSources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 px-2">Sources</p>
                  {askSources.map((src, i) => (
                    <Card key={i} className="bg-surface-container-low border-outline-variant/10 hover:border-primary/20 transition-all cursor-pointer">
                      <CardContent className="p-3 flex items-center gap-3">
                        <Badge variant="outline" className={`text-[9px] border-0 ${
                          src.type === 'wiki' ? 'bg-blue-500/10 text-blue-400' : 'bg-primary/10 text-primary'
                        }`}>{src.type === 'wiki' ? 'plant' : src.type}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-on-surface truncate">{src.title}</p>
                          <p className="text-[10px] text-on-surface-variant/60 truncate">{src.summary}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search + Category filter */}
        <div className="flex items-center gap-2 mb-5 px-2 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-lg">search</span>
            <input
              placeholder="Search plants..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-full bg-surface-container-low border border-outline-variant/10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30 transition-colors"
            />
          </div>
          {categories.length > 0 && (
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-full flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                  filter === 'all' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/60'
                }`}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                    filter === cat ? 'bg-primary/10 text-primary' : 'text-on-surface-variant/60'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Articles */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="bg-surface-container-low border-outline-variant/10">
                <CardContent className="p-4 flex gap-3">
                  <Skeleton className="w-10 h-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4 rounded-full" />
                    <Skeleton className="h-3 w-full rounded-full" />
                    <Skeleton className="h-3 w-1/2 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="default">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant">auto_stories</span>
              </EmptyMedia>
              <EmptyTitle>No plants yet</EmptyTitle>
              <EmptyDescription>
                Plants are compiled automatically from your enriched garden seeds. Drop some links and ideas first, then let the agents synthesize them.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" className="rounded-full" onClick={() => router.push('/links')}>
                <span className="material-symbols-outlined text-lg mr-1">link</span>
                Add Links First
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-3">
            {filtered.map(article => (
              <WikiCard
                key={article.id}
                article={article}
                onClick={() => setSelectedArticle(article)}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
