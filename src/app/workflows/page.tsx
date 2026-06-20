'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowRight,
  Boxes,
  CheckCircle2,
  GitBranch,
  History,
  Inbox,
  LibraryBig,
  Link2,
  Loader2,
  Rocket,
  Sparkles,
} from 'lucide-react'

import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'
import Pill from '@/components/ui/v2/pill'
import SectionHeader from '@/components/ui/v2/section-header'

type Stage = { key: string; label: string; count: number }
type GardenObject = {
  id: string
  kind?: string
  title: string
  summary?: string
  domain?: string
  seed_type?: string
  created_at?: string
  tags?: string[]
  url?: string
  stage?: string
}

type OutcomeWorkflow = {
  id: string
  title: string
  current_stage: string
  stage_label: string
  item: GardenObject
  related: Record<string, GardenObject[]>
  next_action: { label: string; href: string; kind: string }
  history: Array<{ at?: string; title: string; detail?: string }>
  suggestions: Array<{ kind: string; label: string }>
}

type OutcomesResponse = {
  stages: Stage[]
  workflows: OutcomeWorkflow[]
  active_research: Array<{ id: string; theme?: string; status: string; result_seed_id?: string | null; finding_count?: number }>
  summary: Record<string, number>
  error?: string
}

type RelationshipSuggestion = {
  id: string
  action: string
  confidence: number
  reason: string
  source: GardenObject
  target?: GardenObject | null
  evidence: string[]
  next_actions: string[]
}

type InboxItem = {
  id: string
  kind: string
  title: string
  summary?: string
  status: string
  classification: string
  suggested_tags: string[]
  duplicate_count: number
  created_at?: string
  actions: string[]
  url?: string
}

type WikiTopic = {
  topic: string
  category: string
  source_count: number
  seed_count: number
  link_count: number
  reason: string
  sources: GardenObject[]
}

type WikiDraft = {
  title: string
  category: string
  summary: string
  content: string
  source_seed_ids: string[]
  source_link_ids: string[]
}

type ProjectSpace = {
  id: string
  name: string
  summary?: string
  members: GardenObject[]
  counts: Record<string, number>
  next_action: string
}

type TimelineEvent = {
  id: string
  at?: string
  kind: string
  title: string
  detail?: string
  importance: number
  tags: string[]
}

const FEATURE_ORDER = [
  'Seed To Outcome Pipeline',
  'Relationship Suggestions',
  'Research Inbox',
  'Wiki From Garden',
  'Product/Project Spaces',
  'Insight Timeline',
]

function authHeader(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { headers: authHeader() })
    return await res.json()
  } catch {
    return fallback
  }
}

function timeLabel(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function WorkflowsPage() {
  const router = useRouter()
  const [outcomes, setOutcomes] = useState<OutcomesResponse | null>(null)
  const [relationships, setRelationships] = useState<{ suggestions: RelationshipSuggestion[]; summary: Record<string, unknown> }>({ suggestions: [], summary: {} })
  const [inbox, setInbox] = useState<{ items: InboxItem[]; summary: Record<string, unknown> }>({ items: [], summary: {} })
  const [wiki, setWiki] = useState<{ topics: WikiTopic[]; summary: Record<string, unknown> }>({ topics: [], summary: {} })
  const [spaces, setSpaces] = useState<{ spaces: ProjectSpace[]; orphan_specs: GardenObject[]; suggestions: Array<{ seed: GardenObject; space: { id: string; name: string }; reason: string; confidence: number }>; summary: Record<string, unknown> }>({ spaces: [], orphan_specs: [], suggestions: [], summary: {} })
  const [timeline, setTimeline] = useState<{ events: TimelineEvent[]; rising_topics: Array<{ label: string; count: number }>; activity: Array<{ week: string; count: number }>; summary: Record<string, unknown> }>({ events: [], rising_topics: [], activity: [], summary: {} })
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState<string>('all')
  const [draft, setDraft] = useState<WikiDraft | null>(null)
  const [draftingTopic, setDraftingTopic] = useState<string>('')
  const [publishing, setPublishing] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [outcomesData, relationshipData, inboxData, wikiData, spacesData, timelineData] = await Promise.all([
      getJson<OutcomesResponse>('/api/outcomes', { stages: [], workflows: [], active_research: [], summary: {}, error: 'Could not load workflows' }),
      getJson<{ suggestions: RelationshipSuggestion[]; summary: Record<string, unknown> }>('/api/relationships/suggestions', { suggestions: [], summary: {} }),
      getJson<{ items: InboxItem[]; summary: Record<string, unknown> }>('/api/research/inbox', { items: [], summary: {} }),
      getJson<{ topics: WikiTopic[]; summary: Record<string, unknown> }>('/api/wiki/from-garden', { topics: [], summary: {} }),
      getJson<{ spaces: ProjectSpace[]; orphan_specs: GardenObject[]; suggestions: Array<{ seed: GardenObject; space: { id: string; name: string }; reason: string; confidence: number }>; summary: Record<string, unknown> }>('/api/spaces', { spaces: [], orphan_specs: [], suggestions: [], summary: {} }),
      getJson<{ events: TimelineEvent[]; rising_topics: Array<{ label: string; count: number }>; activity: Array<{ week: string; count: number }>; summary: Record<string, unknown> }>('/api/insights/timeline', { events: [], rising_topics: [], activity: [], summary: {} }),
    ])
    setOutcomes(outcomesData)
    setRelationships(relationshipData)
    setInbox(inboxData)
    setWiki(wikiData)
    setSpaces(spacesData)
    setTimeline(timelineData)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const workflows = outcomes?.workflows || []
  const filtered = activeStage === 'all' ? workflows : workflows.filter(w => w.current_stage === activeStage)
  const topRelationships = relationships.suggestions.slice(0, 8)
  const inboxPreview = inbox.items.slice(0, 8)

  const activeResearchCount = outcomes?.active_research?.length || 0
  const totals = useMemo(() => ([
    workflows.length,
    relationships.suggestions.length,
    inbox.items.length,
    wiki.topics.length,
    spaces.spaces.length,
    timeline.events.length,
  ]), [workflows.length, relationships.suggestions.length, inbox.items.length, wiki.topics.length, spaces.spaces.length, timeline.events.length])

  async function previewWiki(topic: WikiTopic) {
    setDraftingTopic(topic.topic)
    setDraft(null)
    const sourceSeedIds = topic.sources.filter(source => source.kind === 'seed').map(source => source.id)
    const sourceLinkIds = topic.sources.filter(source => source.kind === 'link').map(source => source.id)
    try {
      const res = await fetch('/api/wiki/from-garden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ action: 'preview', topic: topic.topic, category: topic.category, source_seed_ids: sourceSeedIds, source_link_ids: sourceLinkIds }),
      })
      const json = await res.json()
      setDraft(json.draft || null)
    } finally {
      setDraftingTopic('')
    }
  }

  async function approveDraft() {
    if (!draft) return
    setPublishing(true)
    try {
      await fetch('/api/wiki/from-garden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ action: 'approve', ...draft, topic: draft.title }),
      })
      setDraft(null)
      loadAll()
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', overflowX: 'hidden' }}>
      <Header />

      <main className="desk-wrap" style={{ padding: '24px 18px 120px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 260 }}>
            <Pill tone="green" size="xs">WORKFLOWS</Pill>
            <h1 className="serif" style={{ fontSize: 36, color: 'var(--ink)', margin: '10px 0 6px', lineHeight: 1.05 }}>From idea to artifact</h1>
            <p className="body-text" style={{ fontSize: 13, color: 'var(--ink-2)', maxWidth: 620, lineHeight: 1.55 }}>
              The ordered operating layer for Greenplot: outcomes, relationships, inbox, wiki drafting, project spaces, and the living timeline.
            </p>
          </div>
          <button
            onClick={loadAll}
            className="tap ui"
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--green)', color: '#06281a', border: 'none', borderRadius: 9999, padding: '10px 16px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Refresh
          </button>
        </div>

        <div className="v2-card" style={{ borderRadius: 20, padding: 14, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 8 }}>
            {FEATURE_ORDER.map((feature, index) => (
              <div key={feature} style={{ border: '1px solid var(--hairline)', background: index === 0 ? 'var(--green-tint)' : 'var(--surface-sunk)', borderRadius: 13, padding: '10px 9px', minHeight: 78 }}>
                <div className="ui" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: index === 0 ? 'var(--green-700)' : 'var(--ink-3)' }}>{String(index + 1).padStart(2, '0')}</span>
                  <span style={{ fontSize: 18, color: 'var(--ink)', lineHeight: 1 }}>{totals[index]}</span>
                </div>
                <div className="ui" style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.25, marginTop: 7 }}>{feature}</div>
              </div>
            ))}
          </div>
        </div>

        <SectionHeader action="New spec" onAction={() => router.push('/chat?mode=spec')}>Seed To Outcome Pipeline</SectionHeader>
        <div className="v2-card" style={{ borderRadius: 20, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(98px, 1fr))', gap: 8 }}>
            <StageButton active={activeStage === 'all'} label="All" count={workflows.length} onClick={() => setActiveStage('all')} />
            {(outcomes?.stages || []).map(stage => (
              <StageButton key={stage.key} active={activeStage === stage.key} label={stage.label} count={stage.count} onClick={() => setActiveStage(stage.key)} />
            ))}
          </div>
        </div>

        {activeResearchCount > 0 && (
          <div className="v2-card" style={{ borderRadius: 18, padding: 14, marginBottom: 16, display: 'grid', gap: 8 }}>
            <InlineTitle icon={<Loader2 size={15} className="animate-spin" color="var(--green-700)" />} title="Active research" />
            {outcomes?.active_research.map(run => (
              <button key={run.id} onClick={() => router.push('/garden')} className="tap" style={{ border: 'none', background: 'var(--surface-sunk)', borderRadius: 12, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
                <GitBranch size={14} color="var(--green-700)" />
                <span className="ui" style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.theme || 'Untitled research run'}</span>
                <Pill tone="neutral" size="xs">{run.status}</Pill>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Rocket size={34} color="var(--ink-3)" strokeWidth={1.35} />} title="No workflows in this stage yet" text="Plant a seed, run research, or draft a spec to start the pipeline." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 10 }}>
            {filtered.slice(0, 12).map(workflow => (
              <OutcomeCard key={workflow.id} workflow={workflow} onOpen={(href) => router.push(href)} />
            ))}
          </div>
        )}

        <SectionHeader>Relationship Suggestions</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 10 }}>
          {topRelationships.length === 0 ? (
            <EmptyState icon={<Link2 size={32} color="var(--ink-3)" strokeWidth={1.35} />} title="No relationship suggestions yet" text="The graph is waiting for more overlap across seeds, links, papers, and wiki articles." />
          ) : topRelationships.map(suggestion => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))}
        </div>

        <SectionHeader>Research Inbox</SectionHeader>
        <div className="v2-card" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 8 }}>
          {inboxPreview.length === 0 ? (
            <CompactEmpty icon={<Inbox size={28} color="var(--ink-3)" />} title="Inbox is clear" />
          ) : inboxPreview.map(item => (
            <InboxRow key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>

        <SectionHeader>Wiki From Garden</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 10 }}>
          <div className="v2-card" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 9 }}>
            {wiki.topics.slice(0, 7).map(topic => (
              <button key={topic.topic} onClick={() => previewWiki(topic)} className="tap" style={{ border: '1px solid var(--hairline)', background: 'var(--surface-sunk)', borderRadius: 13, padding: 11, textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LibraryBig size={15} color="var(--green-700)" />
                  <span className="ui" style={{ flex: 1, fontSize: 12.5, fontWeight: 850, color: 'var(--ink)' }}>{topic.topic}</span>
                  <Pill tone="green" size="xs">{topic.source_count} sources</Pill>
                </div>
                <p className="body-text" style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--ink-2)' }}>{topic.reason}</p>
              </button>
            ))}
            {wiki.topics.length === 0 && <CompactEmpty icon={<LibraryBig size={28} color="var(--ink-3)" />} title="No wiki candidates yet" />}
          </div>
          <div className="v2-card" style={{ borderRadius: 20, padding: 14, minHeight: 260 }}>
            <InlineTitle icon={<LibraryBig size={15} color="var(--green-700)" />} title="Draft preview" />
            {draftingTopic && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <Loader2 size={15} className="animate-spin" color="var(--green-700)" />
                <span className="ui" style={{ fontSize: 12, fontWeight: 750, color: 'var(--ink-2)' }}>Drafting {draftingTopic}</span>
              </div>
            )}
            {!draftingTopic && !draft && <p className="body-text" style={{ marginTop: 14, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>Pick a topic to assemble sources, draft a page, and approve it into the wiki.</p>}
            {draft && (
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                <h2 className="ui" style={{ margin: 0, fontSize: 15, fontWeight: 850, color: 'var(--ink)' }}>{draft.title}</h2>
                <p className="body-text" style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{draft.summary}</p>
                <pre style={{ margin: 0, maxHeight: 190, overflow: 'auto', whiteSpace: 'pre-wrap', background: 'var(--surface-sunk)', border: '1px solid var(--hairline)', borderRadius: 12, padding: 12, fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.45 }}>{draft.content}</pre>
                <button onClick={approveDraft} disabled={publishing} className="tap ui" style={{ border: 'none', background: 'var(--green)', color: '#06281a', borderRadius: 9999, padding: '10px 14px', fontSize: 12.5, fontWeight: 850, cursor: publishing ? 'default' : 'pointer' }}>
                  {publishing ? 'Publishing...' : 'Approve wiki page'}
                </button>
              </div>
            )}
          </div>
        </div>

        <SectionHeader>Product/Project Spaces</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 10 }}>
          {spaces.spaces.slice(0, 8).map(space => <SpaceCard key={space.id} space={space} />)}
          {spaces.spaces.length === 0 && <EmptyState icon={<Boxes size={32} color="var(--ink-3)" strokeWidth={1.35} />} title="No project spaces yet" text="Product seeds will become spaces once related specs and build tasks appear." />}
        </div>

        <SectionHeader>Insight Timeline</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(0, 1.4fr)', gap: 10 }}>
          <div className="v2-card" style={{ borderRadius: 20, padding: 14, alignSelf: 'start' }}>
            <InlineTitle icon={<Sparkles size={15} color="var(--green-700)" />} title="Rising topics" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
              {timeline.rising_topics.slice(0, 12).map(topic => <Pill key={topic.label} tone="soft" size="xs">{topic.label} {topic.count}</Pill>)}
              {timeline.rising_topics.length === 0 && <span className="body-text" style={{ fontSize: 12, color: 'var(--ink-3)' }}>No repeated themes yet.</span>}
            </div>
          </div>
          <div className="v2-card" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 8 }}>
            {timeline.events.slice(0, 14).map(event => <TimelineRow key={event.id} event={event} />)}
            {timeline.events.length === 0 && <CompactEmpty icon={<Activity size={28} color="var(--ink-3)" />} title="Timeline is quiet" />}
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}

function StageButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="tap" style={{ minHeight: 62, border: `1px solid ${active ? 'var(--green-700)' : 'var(--hairline)'}`, background: active ? 'var(--green-tint)' : 'var(--surface-sunk)', borderRadius: 13, padding: 9, cursor: 'pointer', textAlign: 'left' }}>
      <div className="ui" style={{ fontSize: 10.5, fontWeight: 800, color: active ? 'var(--green-700)' : 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div className="serif" style={{ fontSize: 24, lineHeight: 1, color: 'var(--ink)', marginTop: 6 }}>{count}</div>
    </button>
  )
}

function OutcomeCard({ workflow, onOpen }: { workflow: OutcomeWorkflow; onOpen: (href: string) => void }) {
  const relatedCount = Object.values(workflow.related).reduce((sum, items) => sum + items.length, 0)
  return (
    <div className="v2-card tap" style={{ borderRadius: 18, padding: 15 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <IconBubble><Rocket size={18} color="var(--green-700)" strokeWidth={1.75} /></IconBubble>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
            <Pill tone="green" size="xs">{workflow.stage_label}</Pill>
            {relatedCount > 0 && <Pill tone="neutral" size="xs">{relatedCount} linked</Pill>}
          </div>
          <h2 className="ui" style={{ fontSize: 14, fontWeight: 850, color: 'var(--ink)', margin: 0, lineHeight: 1.25 }}>{workflow.title}</h2>
          {workflow.item.summary && <ClampText>{workflow.item.summary}</ClampText>}
        </div>
      </div>

      <button onClick={() => onOpen(workflow.next_action.href)} className="tap" style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--hairline)', background: 'var(--green-tint)', borderRadius: 12, padding: '10px 11px', cursor: 'pointer', textAlign: 'left' }}>
        <CheckCircle2 size={15} color="var(--green-700)" strokeWidth={1.9} />
        <span className="ui" style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{workflow.next_action.label}</span>
        <ArrowRight size={14} color="var(--ink-3)" />
      </button>

      {workflow.suggestions.length > 0 && (
        <div style={{ display: 'grid', gap: 5, marginTop: 12 }}>
          {workflow.suggestions.map(suggestion => (
            <div key={`${workflow.id}-${suggestion.kind}`} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Sparkles size={12} color="var(--green-700)" strokeWidth={1.8} />
              <span className="body-text" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{suggestion.label}</span>
            </div>
          ))}
        </div>
      )}

      {workflow.history.length > 0 && (
        <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 12, paddingTop: 10, display: 'grid', gap: 6 }}>
          {workflow.history.slice(-3).map((event, index) => (
            <div key={`${workflow.id}-history-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={12} color="var(--ink-3)" strokeWidth={1.75} />
              <span className="ui" style={{ fontSize: 10.5, fontWeight: 750, color: 'var(--ink)' }}>{event.title}</span>
              <span className="body-text" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-3)' }}>{timeLabel(event.at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SuggestionCard({ suggestion }: { suggestion: RelationshipSuggestion }) {
  return (
    <div className="v2-card" style={{ borderRadius: 18, padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <IconBubble><Link2 size={17} color="var(--green-700)" /></IconBubble>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 5 }}>
            <Pill tone="green" size="xs">{suggestion.action}</Pill>
            <Pill tone="neutral" size="xs">{suggestion.confidence}%</Pill>
          </div>
          <h3 className="ui" style={{ margin: 0, fontSize: 13.5, fontWeight: 850, color: 'var(--ink)', lineHeight: 1.25 }}>{suggestion.source.title}</h3>
          {suggestion.target && <p className="body-text" style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--ink-2)' }}>With {suggestion.target.title}</p>}
          <p className="body-text" style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>{suggestion.reason}</p>
        </div>
      </div>
      {suggestion.evidence.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {suggestion.evidence.slice(0, 5).map(word => <Pill key={word} tone="ghost" size="xs">{word}</Pill>)}
        </div>
      )}
    </div>
  )
}

function InboxRow({ item }: { item: InboxItem }) {
  return (
    <div style={{ border: '1px solid var(--hairline)', background: 'var(--surface-sunk)', borderRadius: 13, padding: 11 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <Inbox size={15} color="var(--green-700)" style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
            <Pill tone="neutral" size="xs">{item.kind}</Pill>
            <Pill tone={item.duplicate_count > 0 ? 'amber' : 'green'} size="xs">{item.duplicate_count} dupes</Pill>
            <Pill tone="ghost" size="xs">{item.status}</Pill>
          </div>
          <h3 className="ui" style={{ margin: 0, fontSize: 12.5, fontWeight: 850, color: 'var(--ink)' }}>{item.title}</h3>
          {item.summary && <ClampText>{item.summary}</ClampText>}
        </div>
      </div>
    </div>
  )
}

function SpaceCard({ space }: { space: ProjectSpace }) {
  const counts = Object.entries(space.counts || {}).filter(([, count]) => count > 0)
  return (
    <div className="v2-card" style={{ borderRadius: 18, padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <IconBubble><Boxes size={17} color="var(--green-700)" /></IconBubble>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="ui" style={{ margin: 0, fontSize: 14, fontWeight: 850, color: 'var(--ink)' }}>{space.name}</h3>
          {space.summary && <ClampText>{space.summary}</ClampText>}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
        {counts.map(([label, count]) => <Pill key={label} tone="soft" size="xs">{label} {count}</Pill>)}
        <Pill tone="neutral" size="xs">{space.members.length} members</Pill>
      </div>
      <div className="ui" style={{ marginTop: 12, fontSize: 12, fontWeight: 800, color: 'var(--green-700)' }}>{space.next_action}</div>
    </div>
  )
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--hairline)', background: 'var(--surface-sunk)', borderRadius: 13, padding: 11 }}>
      <Activity size={15} color="var(--green-700)" style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <h3 className="ui" style={{ margin: 0, fontSize: 12.5, fontWeight: 850, color: 'var(--ink)' }}>{event.title}</h3>
          <Pill tone="ghost" size="xs">{event.kind}</Pill>
          {event.at && <span className="body-text" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-3)' }}>{timeLabel(event.at)}</span>}
        </div>
        {event.detail && <p className="body-text" style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--ink-2)' }}>{event.detail}</p>}
      </div>
    </div>
  )
}

function InlineTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon}
      <span className="ui" style={{ fontSize: 12.5, fontWeight: 850, color: 'var(--ink)' }}>{title}</span>
    </div>
  )
}

function IconBubble({ children }: { children: ReactNode }) {
  return (
    <span style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{children}</span>
  )
}

function ClampText({ children }: { children: ReactNode }) {
  return <p className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45, margin: '5px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{children}</p>
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="v2-card" style={{ borderRadius: 20, padding: 28, textAlign: 'center' }}>
      <div style={{ margin: '0 auto 10px', display: 'inline-flex' }}>{icon}</div>
      <div className="ui" style={{ fontSize: 13, fontWeight: 850, color: 'var(--ink)' }}>{title}</div>
      <p className="body-text" style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 5 }}>{text}</p>
    </div>
  )
}

function CompactEmpty({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div style={{ padding: 20, textAlign: 'center' }}>
      <div style={{ marginBottom: 8, display: 'inline-flex' }}>{icon}</div>
      <div className="ui" style={{ fontSize: 12.5, fontWeight: 850, color: 'var(--ink)' }}>{title}</div>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 10 }}>
      {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 180, borderRadius: 18, background: 'var(--surface-sunk)', animation: 'pulse 1.5s ease-in-out infinite' }} />)}
    </div>
  )
}
