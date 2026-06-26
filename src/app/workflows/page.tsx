'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  ExternalLink,
  Filter,
  GitBranch,
  History,
  Inbox,
  LibraryBig,
  Link2,
  Loader2,
  Rocket,
  Search,
  Sparkles,
  Target,
  Trash2,
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
  suggested_action?: string
  priority?: string
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

type LearningLoopResponse = {
  loop?: Array<{ step: string; description: string }>
  chunks?: Array<{ id: string; title: string; status: string; why: string; next: string }>
  signals?: {
    total_decisions?: number
    positive_decisions?: number
    negative_decisions?: number
    actions?: Record<string, number>
    preferred_terms?: Array<{ label: string; count: number }>
    rejected_terms?: Array<{ label: string; count: number }>
    preferred_sources?: Array<{ label: string; count: number }>
    rejected_sources?: Array<{ label: string; count: number }>
  }
  error?: string
}

const EMPTY_OUTCOMES: OutcomesResponse = { stages: [], workflows: [], active_research: [], summary: {} }
const EMPTY_RELATIONSHIPS = { suggestions: [] as RelationshipSuggestion[], summary: {} as Record<string, unknown> }
const EMPTY_INBOX = { items: [] as InboxItem[], summary: {} as Record<string, unknown> }
const EMPTY_WIKI = { topics: [] as WikiTopic[], summary: {} as Record<string, unknown> }
const EMPTY_SPACES = {
  spaces: [] as ProjectSpace[],
  orphan_specs: [] as GardenObject[],
  suggestions: [] as Array<{ seed: GardenObject; space: { id: string; name: string }; reason: string; confidence: number }>,
  summary: {} as Record<string, unknown>,
}
const EMPTY_TIMELINE = {
  events: [] as TimelineEvent[],
  rising_topics: [] as Array<{ label: string; count: number }>,
  activity: [] as Array<{ week: string; count: number }>,
  summary: {} as Record<string, unknown>,
}
const EMPTY_LEARNING_LOOP = { loop: [], chunks: [], signals: {} } satisfies LearningLoopResponse

type InboxFilter = 'all' | 'thought' | 'link' | 'paper' | 'duplicates'
type InboxDecision = 'keep' | 'connect' | 'turn_into_seed' | 'draft_wiki' | 'attach_to_project' | 'discard'
type InboxNotice = { tone: 'ok' | 'error'; message: string }

const INBOX_FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'thought', label: 'Notes' },
  { key: 'link', label: 'Links' },
  { key: 'paper', label: 'Papers' },
  { key: 'duplicates', label: 'Duplicates' },
]

const INBOX_ACTIONS: Array<{ key: InboxDecision; label: string; icon: ReactNode; tone: 'green' | 'neutral' | 'danger' }> = [
  { key: 'keep', label: 'Keep', icon: <CheckCircle2 size={14} />, tone: 'green' },
  { key: 'connect', label: 'Connect', icon: <Link2 size={14} />, tone: 'neutral' },
  { key: 'turn_into_seed', label: 'Seed', icon: <Sparkles size={14} />, tone: 'green' },
  { key: 'draft_wiki', label: 'Wiki', icon: <BookOpen size={14} />, tone: 'neutral' },
  { key: 'attach_to_project', label: 'Project', icon: <Target size={14} />, tone: 'neutral' },
  { key: 'discard', label: 'Discard', icon: <Trash2 size={14} />, tone: 'danger' },
]

const FEATURE_CARDS = [
  {
    id: 'workflow-pipeline',
    label: 'Seed To Outcome Pipeline',
    metric: 'Active paths',
    outcome: 'Move ideas toward shipped artifacts',
  },
  {
    id: 'relationship-suggestions',
    label: 'Relationship Suggestions',
    metric: 'Suggested links',
    outcome: 'Connect related garden material',
  },
  {
    id: 'research-inbox',
    label: 'Research Inbox',
    metric: 'Waiting review',
    outcome: 'Triage links, papers, and notes',
  },
  {
    id: 'learning-loop',
    label: 'Learning Loop',
    metric: 'Signals captured',
    outcome: 'Improve relevance in small chunks',
  },
  {
    id: 'wiki-from-garden',
    label: 'Wiki From Garden',
    metric: 'Draft candidates',
    outcome: 'Turn clusters into cited pages',
  },
  {
    id: 'project-spaces',
    label: 'Product/Project Spaces',
    metric: 'Spaces',
    outcome: 'Keep product work in context',
  },
  {
    id: 'insight-timeline',
    label: 'Insight Timeline',
    metric: 'Signals',
    outcome: 'Track themes and repeated moves',
  },
]

function authHeader(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { headers: authHeader() })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      return fallback
    }
    return data
  } catch {
    return fallback
  }
}

function arrayOrEmpty<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function sliceSafe<T>(value: T[] | null | undefined, start: number, end?: number): T[] {
  return arrayOrEmpty(value).slice(start, end)
}

function timeLabel(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function inboxItemKey(item: InboxItem) {
  return `${item.kind}:${item.id}`
}

function normalizeAction(action: string): InboxDecision | null {
  const normalized = action.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (['keep', 'connect', 'turn_into_seed', 'draft_wiki', 'attach_to_project', 'discard'].includes(normalized)) {
    return normalized as InboxDecision
  }
  return null
}

function inboxActionLabel(action?: string) {
  const normalized = action ? normalizeAction(action) : null
  return INBOX_ACTIONS.find(item => item.key === normalized)?.label || 'Review'
}

export default function WorkflowsPage() {
  const router = useRouter()
  const [outcomes, setOutcomes] = useState<OutcomesResponse | null>(null)
  const [relationships, setRelationships] = useState<{ suggestions?: RelationshipSuggestion[]; summary?: Record<string, unknown>; error?: string }>(EMPTY_RELATIONSHIPS)
  const [inbox, setInbox] = useState<{ items?: InboxItem[]; summary?: Record<string, unknown>; error?: string }>(EMPTY_INBOX)
  const [wiki, setWiki] = useState<{ topics?: WikiTopic[]; summary?: Record<string, unknown>; error?: string }>(EMPTY_WIKI)
  const [spaces, setSpaces] = useState<{ spaces?: ProjectSpace[]; orphan_specs?: GardenObject[]; suggestions?: Array<{ seed: GardenObject; space: { id: string; name: string }; reason: string; confidence: number }>; summary?: Record<string, unknown>; error?: string }>(EMPTY_SPACES)
  const [timeline, setTimeline] = useState<{ events?: TimelineEvent[]; rising_topics?: Array<{ label: string; count: number }>; activity?: Array<{ week: string; count: number }>; summary?: Record<string, unknown>; error?: string }>(EMPTY_TIMELINE)
  const [learningLoop, setLearningLoop] = useState<LearningLoopResponse>(EMPTY_LEARNING_LOOP)
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState<string>('all')
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all')
  const [selectedInboxKey, setSelectedInboxKey] = useState<string>('')
  const [reviewedInbox, setReviewedInbox] = useState<Record<string, string>>({})
  const [actingInboxKey, setActingInboxKey] = useState<string>('')
  const [inboxNotice, setInboxNotice] = useState<InboxNotice | null>(null)
  const [draft, setDraft] = useState<WikiDraft | null>(null)
  const [draftingTopic, setDraftingTopic] = useState<string>('')
  const [publishing, setPublishing] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [outcomesData, relationshipData, inboxData, learningLoopData, wikiData, spacesData, timelineData] = await Promise.all([
      getJson<OutcomesResponse>('/api/outcomes', { ...EMPTY_OUTCOMES, error: 'Could not load workflows' }),
      getJson<typeof EMPTY_RELATIONSHIPS & { error?: string }>('/api/relationships/suggestions', EMPTY_RELATIONSHIPS),
      getJson<typeof EMPTY_INBOX & { error?: string }>('/api/research/inbox', EMPTY_INBOX),
      getJson<LearningLoopResponse>('/api/research/learning-loop', EMPTY_LEARNING_LOOP),
      getJson<typeof EMPTY_WIKI & { error?: string }>('/api/wiki/from-garden', EMPTY_WIKI),
      getJson<typeof EMPTY_SPACES & { error?: string }>('/api/spaces', EMPTY_SPACES),
      getJson<typeof EMPTY_TIMELINE & { error?: string }>('/api/insights/timeline', EMPTY_TIMELINE),
    ])
    setOutcomes(outcomesData)
    setRelationships(relationshipData)
    setInbox(inboxData)
    setLearningLoop(learningLoopData)
    setWiki(wikiData)
    setSpaces(spacesData)
    setTimeline(timelineData)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const workflows = arrayOrEmpty(outcomes?.workflows)
  const filtered = activeStage === 'all' ? workflows : workflows.filter(w => w.current_stage === activeStage)
  const relationshipSuggestions = arrayOrEmpty(relationships.suggestions)
  const inboxItems = arrayOrEmpty(inbox.items)
  const wikiTopics = arrayOrEmpty(wiki.topics)
  const projectSpaces = arrayOrEmpty(spaces.spaces)
  const timelineEvents = arrayOrEmpty(timeline.events)
  const risingTopics = arrayOrEmpty(timeline.rising_topics)
  const learningChunks = arrayOrEmpty(learningLoop.chunks)
  const learningSignals = learningLoop.signals || {}
  const topRelationships = sliceSafe(relationshipSuggestions, 0, 4)
  const activeInboxItems = useMemo(() => inboxItems.filter(item => !reviewedInbox[inboxItemKey(item)]), [inboxItems, reviewedInbox])
  const filteredInboxItems = useMemo(() => {
    if (inboxFilter === 'all') return activeInboxItems
    if (inboxFilter === 'duplicates') return activeInboxItems.filter(item => item.duplicate_count > 0)
    if (inboxFilter === 'link') return activeInboxItems.filter(item => item.kind === 'link' || item.kind === 'link-cache')
    return activeInboxItems.filter(item => item.kind === inboxFilter)
  }, [activeInboxItems, inboxFilter])
  const selectedInboxItem = filteredInboxItems.find(item => inboxItemKey(item) === selectedInboxKey) || filteredInboxItems[0] || null
  const inboxStats = useMemo(() => ({
    all: activeInboxItems.length,
    thought: activeInboxItems.filter(item => item.kind === 'thought').length,
    link: activeInboxItems.filter(item => item.kind === 'link' || item.kind === 'link-cache').length,
    paper: activeInboxItems.filter(item => item.kind === 'paper').length,
    duplicates: activeInboxItems.filter(item => item.duplicate_count > 0).length,
  }), [activeInboxItems])

  const activeResearchCount = arrayOrEmpty(outcomes?.active_research).length
  const totals = useMemo(() => ([
    workflows.length,
    relationshipSuggestions.length,
    activeInboxItems.length,
    Number(learningSignals.total_decisions || 0),
    wikiTopics.length,
    projectSpaces.length,
    timelineEvents.length,
  ]), [workflows.length, relationshipSuggestions.length, activeInboxItems.length, learningSignals.total_decisions, wikiTopics.length, projectSpaces.length, timelineEvents.length])

  function jumpToSection(sectionId: string) {
    const target = document.getElementById(sectionId)
    const scroller = document.querySelector<HTMLElement>('[data-testid="workflows-scroll"]')
    if (!target) return
    if (!scroller) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const nextTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 10
    scroller.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
  }

  function routeAfterInboxAction(action: InboxDecision, seedId?: string) {
    if (action === 'connect') jumpToSection('relationship-suggestions')
    if (action === 'draft_wiki') jumpToSection('wiki-from-garden')
    if (action === 'attach_to_project') jumpToSection('project-spaces')
    if (action === 'turn_into_seed' && seedId) router.push(`/garden?seed=${seedId}`)
  }

  async function handleInboxAction(item: InboxItem, action: InboxDecision) {
    const key = inboxItemKey(item)
    setActingInboxKey(`${key}:${action}`)
    setInboxNotice(null)
    try {
      const res = await fetch('/api/research/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          item_id: item.id,
          kind: item.kind,
          action,
          title: item.title,
          summary: item.summary || '',
          url: item.url || '',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setReviewedInbox(prev => ({ ...prev, [key]: action }))
        setInboxNotice({ tone: 'ok', message: json.message || `${inboxActionLabel(action)} saved` })
        routeAfterInboxAction(action, typeof json.seed_id === 'string' ? json.seed_id : undefined)
      } else {
        const message = typeof json.detail === 'string' ? json.detail : typeof json.error === 'string' ? json.error : 'Could not save this inbox decision'
        setInboxNotice({ tone: 'error', message })
        if (action === 'connect' || action === 'draft_wiki' || action === 'attach_to_project') routeAfterInboxAction(action)
      }
    } catch {
      setInboxNotice({ tone: 'error', message: 'Could not reach the backend. Try again after the deploy finishes.' })
    } finally {
      setActingInboxKey('')
    }
  }

  async function previewWiki(topic: WikiTopic) {
    setDraftingTopic(topic.topic)
    setDraft(null)
    const sources = arrayOrEmpty(topic.sources)
    const sourceSeedIds = sources.filter(source => source.kind === 'seed').map(source => source.id)
    const sourceLinkIds = sources.filter(source => source.kind === 'link').map(source => source.id)
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
    <div style={{ background: 'var(--bg)', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <main data-testid="workflows-scroll" className="desk-wrap" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: '24px 18px max(136px, calc(env(safe-area-inset-bottom, 0px) + 118px))', scrollBehavior: 'smooth' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 260 }}>
            <Pill tone="green" size="xs">WORKFLOWS</Pill>
            <h1 className="serif" style={{ fontSize: 36, color: 'var(--ink)', margin: '10px 0 6px', lineHeight: 1.05 }}>From idea to artifact</h1>
            <p className="body-text" style={{ fontSize: 13, color: 'var(--ink-2)', maxWidth: 620, lineHeight: 1.55 }}>
              A focused decision bench for clearing research intake, connecting material, drafting wiki pages, and moving ideas toward shipped artifacts.
            </p>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
              <Pill tone="soft" size="xs">Seed</Pill>
              <ArrowRight size={13} color="var(--ink-3)" style={{ marginTop: 2 }} />
              <Pill tone="soft" size="xs">Brief</Pill>
              <ArrowRight size={13} color="var(--ink-3)" style={{ marginTop: 2 }} />
              <Pill tone="soft" size="xs">Spec</Pill>
              <ArrowRight size={13} color="var(--ink-3)" style={{ marginTop: 2 }} />
              <Pill tone="green" size="xs">Shipped</Pill>
            </div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 8 }}>
            {FEATURE_CARDS.map((feature, index) => (
              <button
                key={feature.id}
                type="button"
                aria-label={`View ${feature.label}`}
                data-testid={`workflow-kpi-${feature.id}`}
                onClick={() => jumpToSection(feature.id)}
                className="tap"
                style={{ border: '1px solid var(--hairline)', background: index === 0 ? 'var(--green-tint)' : 'var(--surface-sunk)', borderRadius: 13, padding: '10px', minHeight: 96, cursor: 'pointer', textAlign: 'left', display: 'grid', alignContent: 'space-between', gap: 7 }}
              >
                <div className="ui" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: index === 0 ? 'var(--green-700)' : 'var(--ink-3)' }}>{String(index + 1).padStart(2, '0')}</span>
                  <span style={{ fontSize: 18, color: 'var(--ink)', lineHeight: 1 }}>{totals[index]}</span>
                </div>
                <div>
                  <div className="ui" style={{ fontSize: 11.5, fontWeight: 850, color: 'var(--ink)', lineHeight: 1.25 }}>{feature.label}</div>
                  <div className="body-text" style={{ fontSize: 10.5, color: 'var(--green-700)', fontWeight: 700, marginTop: 4 }}>{feature.metric}</div>
                  <div className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)', lineHeight: 1.3, marginTop: 3 }}>{feature.outcome}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <SectionBlock id="workflow-pipeline">
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
            {arrayOrEmpty(outcomes?.active_research).map(run => (
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
            {sliceSafe(filtered, 0, 6).map(workflow => (
              <OutcomeCard key={workflow.id} workflow={workflow} onOpen={(href) => router.push(href)} />
            ))}
          </div>
        )}
        </SectionBlock>

        <SectionBlock id="relationship-suggestions">
        <SectionHeader>Relationship Suggestions</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 10 }}>
          {topRelationships.length === 0 ? (
            <EmptyState icon={<Link2 size={32} color="var(--ink-3)" strokeWidth={1.35} />} title="No relationship suggestions yet" text="The graph is waiting for more overlap across seeds, links, papers, and wiki articles." />
          ) : topRelationships.map(suggestion => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))}
        </div>
        </SectionBlock>

        <SectionBlock id="research-inbox">
        <SectionHeader action="Links" onAction={() => router.push('/links')}>Research Inbox</SectionHeader>
        <InboxWorkbench
          items={filteredInboxItems}
          selectedItem={selectedInboxItem}
          filter={inboxFilter}
          stats={inboxStats}
          relationships={relationshipSuggestions}
          actingKey={actingInboxKey}
          notice={inboxNotice}
          loading={loading}
          onFilter={setInboxFilter}
          onSelect={(item) => setSelectedInboxKey(inboxItemKey(item))}
          onAction={handleInboxAction}
        />
        </SectionBlock>

        <SectionBlock id="learning-loop">
        <SectionHeader>Learning Loop</SectionHeader>
        <LearningLoopPanel data={learningLoop} />
        </SectionBlock>

        <SectionBlock id="wiki-from-garden">
        <SectionHeader>Wiki From Garden</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 10 }}>
          <div className="v2-card" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 9 }}>
          {sliceSafe(wikiTopics, 0, 5).map(topic => (
              <button key={topic.topic} onClick={() => previewWiki(topic)} className="tap" style={{ border: '1px solid var(--hairline)', background: 'var(--surface-sunk)', borderRadius: 13, padding: 11, textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LibraryBig size={15} color="var(--green-700)" />
                  <span className="ui" style={{ flex: 1, fontSize: 12.5, fontWeight: 850, color: 'var(--ink)' }}>{topic.topic}</span>
                  <Pill tone="green" size="xs">{topic.source_count} sources</Pill>
                </div>
                <p className="body-text" style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--ink-2)' }}>{topic.reason}</p>
              </button>
            ))}
            {wikiTopics.length === 0 && <CompactEmpty icon={<LibraryBig size={28} color="var(--ink-3)" />} title="No wiki candidates yet" />}
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
        </SectionBlock>

        <SectionBlock id="project-spaces">
        <SectionHeader>Product/Project Spaces</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--desk-cols-2)', gap: 10 }}>
          {sliceSafe(projectSpaces, 0, 4).map(space => <SpaceCard key={space.id} space={space} />)}
          {projectSpaces.length === 0 && <EmptyState icon={<Boxes size={32} color="var(--ink-3)" strokeWidth={1.35} />} title="No project spaces yet" text="Product seeds will become spaces once related specs and build tasks appear." />}
        </div>
        </SectionBlock>

        <SectionBlock id="insight-timeline">
        <SectionHeader>Insight Timeline</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(0, 1.4fr)', gap: 10 }}>
          <div className="v2-card" style={{ borderRadius: 20, padding: 14, alignSelf: 'start' }}>
            <InlineTitle icon={<Sparkles size={15} color="var(--green-700)" />} title="Rising topics" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
              {sliceSafe(risingTopics, 0, 8).map(topic => <Pill key={topic.label} tone="soft" size="xs">{topic.label} {topic.count}</Pill>)}
              {risingTopics.length === 0 && <span className="body-text" style={{ fontSize: 12, color: 'var(--ink-3)' }}>No repeated themes yet.</span>}
            </div>
          </div>
          <div className="v2-card" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 8 }}>
            {sliceSafe(timelineEvents, 0, 8).map(event => <TimelineRow key={event.id} event={event} />)}
            {timelineEvents.length === 0 && <CompactEmpty icon={<Activity size={28} color="var(--ink-3)" />} title="Timeline is quiet" />}
          </div>
        </div>
        </SectionBlock>
      </main>

      <BottomNav />
    </div>
  )
}

function SectionBlock({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} style={{ scrollMarginTop: 18, marginBottom: 18 }}>
      {children}
    </section>
  )
}

function LearningLoopPanel({ data }: { data: LearningLoopResponse }) {
  const loop = arrayOrEmpty(data.loop)
  const chunks = arrayOrEmpty(data.chunks)
  const signals = data.signals || {}
  const preferredTerms = arrayOrEmpty(signals.preferred_terms)
  const rejectedTerms = arrayOrEmpty(signals.rejected_terms)
  const preferredSources = arrayOrEmpty(signals.preferred_sources)
  const rejectedSources = arrayOrEmpty(signals.rejected_sources)
  const nextChunk = chunks.find(chunk => chunk.status === 'next') || chunks.find(chunk => chunk.status === 'waiting') || chunks.find(chunk => chunk.status === 'planned')

  return (
    <div className="v2-card" style={{ borderRadius: 20, padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(260px, 0.95fr)', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 7 }}>
            <DecisionMetric label="Decisions" value={String(signals.total_decisions || 0)} />
            <DecisionMetric label="Useful" value={String(signals.positive_decisions || 0)} />
            <DecisionMetric label="Rejected" value={String(signals.negative_decisions || 0)} />
          </div>

          <div style={{ marginTop: 12, border: '1px solid var(--hairline)', background: 'var(--surface-sunk)', borderRadius: 16, padding: 12 }}>
            <InlineTitle icon={<GitBranch size={15} color="var(--green-700)" />} title="Cycle" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: 8, marginTop: 10 }}>
              {loop.map((step, index) => (
                <div key={step.step} style={{ border: '1px solid var(--hairline)', background: index === 0 ? 'var(--green-tint)' : 'var(--surface)', borderRadius: 13, padding: 10, minHeight: 96 }}>
                  <div className="ui" style={{ fontSize: 10, fontWeight: 900, color: index === 0 ? 'var(--green-700)' : 'var(--ink-3)' }}>{String(index + 1).padStart(2, '0')}</div>
                  <div className="ui" style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--ink)', marginTop: 6 }}>{step.step}</div>
                  <p className="body-text" style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.35 }}>{step.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, border: '1px solid var(--hairline)', background: 'var(--surface-sunk)', borderRadius: 16, padding: 12 }}>
            <InlineTitle icon={<Sparkles size={15} color="var(--green-700)" />} title="Signals" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 10 }}>
              <SignalCluster title="Preferred terms" items={preferredTerms} empty="Waiting for useful picks" tone="green" />
              <SignalCluster title="Rejected terms" items={rejectedTerms} empty="No rejects yet" tone="amber" />
              <SignalCluster title="Preferred sources" items={preferredSources} empty="Waiting for sources" tone="green" />
              <SignalCluster title="Rejected sources" items={rejectedSources} empty="No blocked sources yet" tone="amber" />
            </div>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {nextChunk && (
            <div style={{ border: '1px solid var(--green-700)', background: 'var(--green-tint)', borderRadius: 16, padding: 13, marginBottom: 10 }}>
              <Pill tone="green" size="xs">{nextChunk.status}</Pill>
              <h3 className="ui" style={{ margin: '8px 0 4px', fontSize: 15, fontWeight: 900, color: 'var(--ink)' }}>{nextChunk.title}</h3>
              <p className="body-text" style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>{nextChunk.next}</p>
            </div>
          )}

          <div style={{ display: 'grid', gap: 8 }}>
            {chunks.map(chunk => (
              <div key={chunk.id} style={{ border: '1px solid var(--hairline)', background: 'var(--surface-sunk)', borderRadius: 14, padding: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Pill tone={chunk.status === 'live' ? 'green' : chunk.status === 'next' ? 'amber' : 'neutral'} size="xs">{chunk.status}</Pill>
                  <span className="ui" style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--ink)' }}>{chunk.title}</span>
                </div>
                <p className="body-text" style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.42 }}>{chunk.why}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SignalCluster({ title, items, empty, tone }: { title: string; items: Array<{ label: string; count: number }>; empty: string; tone: 'green' | 'amber' }) {
  return (
    <div>
      <div className="ui" style={{ fontSize: 11, fontWeight: 900, color: 'var(--ink-3)', marginBottom: 7 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.length === 0 ? (
          <span className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{empty}</span>
        ) : sliceSafe(items, 0, 6).map(item => (
          <Pill key={`${title}-${item.label}`} tone={tone === 'green' ? 'soft' : 'amber'} size="xs">{item.label} {item.count}</Pill>
        ))}
      </div>
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
  const relatedCount = Object.values(workflow.related || {}).reduce((sum, items) => sum + arrayOrEmpty(items).length, 0)
  const suggestions = arrayOrEmpty(workflow.suggestions)
  const history = arrayOrEmpty(workflow.history)
  const nextAction = workflow.next_action || { label: 'Open', href: '/garden', kind: 'open' }
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

      <button onClick={() => onOpen(nextAction.href)} className="tap" style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--hairline)', background: 'var(--green-tint)', borderRadius: 12, padding: '10px 11px', cursor: 'pointer', textAlign: 'left' }}>
        <CheckCircle2 size={15} color="var(--green-700)" strokeWidth={1.9} />
        <span className="ui" style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{nextAction.label}</span>
        <ArrowRight size={14} color="var(--ink-3)" />
      </button>

      {suggestions.length > 0 && (
        <div style={{ display: 'grid', gap: 5, marginTop: 12 }}>
          {suggestions.map(suggestion => (
            <div key={`${workflow.id}-${suggestion.kind}`} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Sparkles size={12} color="var(--green-700)" strokeWidth={1.8} />
              <span className="body-text" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{suggestion.label}</span>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 12, paddingTop: 10, display: 'grid', gap: 6 }}>
          {sliceSafe(history, -3).map((event, index) => (
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
  const evidence = arrayOrEmpty(suggestion.evidence)
  return (
    <div className="v2-card" style={{ borderRadius: 18, padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <IconBubble><Link2 size={17} color="var(--green-700)" /></IconBubble>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 5 }}>
            <Pill tone="green" size="xs">{suggestion.action}</Pill>
            <Pill tone="neutral" size="xs">{suggestion.confidence}%</Pill>
          </div>
          <h3 className="ui" style={{ margin: 0, fontSize: 13.5, fontWeight: 850, color: 'var(--ink)', lineHeight: 1.25 }}>{suggestion.source?.title || 'Untitled source'}</h3>
          {suggestion.target && <p className="body-text" style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--ink-2)' }}>With {suggestion.target.title}</p>}
          <p className="body-text" style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>{suggestion.reason}</p>
        </div>
      </div>
      {evidence.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {sliceSafe(evidence, 0, 5).map(word => <Pill key={word} tone="ghost" size="xs">{word}</Pill>)}
        </div>
      )}
    </div>
  )
}

function InboxWorkbench({
  items,
  selectedItem,
  filter,
  stats,
  relationships,
  actingKey,
  notice,
  loading,
  onFilter,
  onSelect,
  onAction,
}: {
  items: InboxItem[]
  selectedItem: InboxItem | null
  filter: InboxFilter
  stats: Record<InboxFilter, number>
  relationships: RelationshipSuggestion[]
  actingKey: string
  notice: InboxNotice | null
  loading: boolean
  onFilter: (filter: InboxFilter) => void
  onSelect: (item: InboxItem) => void
  onAction: (item: InboxItem, action: InboxDecision) => void
}) {
  const related = selectedItem ? relatedSuggestionsForInbox(selectedItem, relationships) : []
  return (
    <div className="v2-card" style={{ borderRadius: 20, padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Filter size={15} color="var(--green-700)" />
            <span className="ui" style={{ fontSize: 12.5, fontWeight: 850, color: 'var(--ink)' }}>Review queue</span>
            <Pill tone="neutral" size="xs">{stats.all} waiting</Pill>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))', gap: 7, marginBottom: 10 }}>
            {INBOX_FILTERS.map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => onFilter(option.key)}
                className="tap"
                style={{ border: `1px solid ${filter === option.key ? 'var(--green-700)' : 'var(--hairline)'}`, background: filter === option.key ? 'var(--green-tint)' : 'var(--surface-sunk)', borderRadius: 11, padding: '8px 9px', cursor: 'pointer', textAlign: 'left' }}
              >
                <div className="ui" style={{ fontSize: 10.5, fontWeight: 850, color: filter === option.key ? 'var(--green-700)' : 'var(--ink-3)' }}>{option.label}</div>
                <div className="ui" style={{ fontSize: 16, color: 'var(--ink)', marginTop: 2 }}>{stats[option.key]}</div>
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 8, maxHeight: 520, overflow: 'auto', paddingRight: 2 }}>
            {loading ? (
              <div style={{ height: 180, borderRadius: 16, background: 'var(--surface-sunk)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ) : items.length === 0 ? (
              <CompactEmpty icon={<Inbox size={28} color="var(--ink-3)" />} title="Inbox is clear" />
            ) : items.map(item => (
              <InboxQueueRow key={inboxItemKey(item)} item={item} active={selectedItem ? inboxItemKey(selectedItem) === inboxItemKey(item) : false} onClick={() => onSelect(item)} />
            ))}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {selectedItem ? (
            <InboxDetail
              item={selectedItem}
              related={related}
              actingKey={actingKey}
              notice={notice}
              onAction={onAction}
            />
          ) : (
            <div style={{ minHeight: 360, border: '1px solid var(--hairline)', background: 'var(--surface-sunk)', borderRadius: 16, padding: 20, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div>
                <Search size={30} color="var(--ink-3)" />
                <div className="ui" style={{ marginTop: 8, fontSize: 13, fontWeight: 850, color: 'var(--ink)' }}>Nothing to review</div>
                <p className="body-text" style={{ margin: '5px auto 0', maxWidth: 280, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>New links, papers, and raw notes will land here before they enter the garden.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InboxQueueRow({ item, active, onClick }: { item: InboxItem; active: boolean; onClick: () => void }) {
  const tags = arrayOrEmpty(item.suggested_tags)
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`research-inbox-item-${item.kind}-${item.id}`}
      className="tap"
      style={{ border: `1px solid ${active ? 'var(--green-700)' : 'var(--hairline)'}`, background: active ? 'var(--green-tint)' : 'var(--surface-sunk)', borderRadius: 13, padding: 11, textAlign: 'left', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <Inbox size={15} color="var(--green-700)" style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
            <Pill tone="neutral" size="xs">{item.kind.replace('-', ' ')}</Pill>
            <Pill tone={item.duplicate_count > 0 ? 'amber' : 'green'} size="xs">{item.duplicate_count} dupes</Pill>
            {item.priority && <Pill tone="ghost" size="xs">{item.priority}</Pill>}
          </div>
          <h3 className="ui" style={{ margin: 0, fontSize: 12.5, fontWeight: 850, color: 'var(--ink)', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
            {sliceSafe(tags, 0, 3).map(tag => <Pill key={`${item.id}-${tag}`} tone="ghost" size="xs">{tag}</Pill>)}
            {item.created_at && <span className="body-text" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-3)' }}>{timeLabel(item.created_at)}</span>}
          </div>
        </div>
      </div>
    </button>
  )
}

function InboxDetail({ item, related, actingKey, notice, onAction }: { item: InboxItem; related: RelationshipSuggestion[]; actingKey: string; notice: InboxNotice | null; onAction: (item: InboxItem, action: InboxDecision) => void }) {
  const tags = arrayOrEmpty(item.suggested_tags)
  const allowedActions = new Set<InboxDecision>(arrayOrEmpty(item.actions).map(action => normalizeAction(action)).filter((action): action is InboxDecision => Boolean(action)))
  for (const fallback of ['keep', 'connect', 'turn_into_seed', 'draft_wiki', 'attach_to_project', 'discard'] as InboxDecision[]) {
    if (fallback === 'turn_into_seed' && item.kind === 'paper') continue
    allowedActions.add(fallback)
  }

  return (
    <div style={{ border: '1px solid var(--hairline)', background: 'var(--surface-sunk)', borderRadius: 16, padding: 14, minHeight: 360 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <IconBubble><Inbox size={18} color="var(--green-700)" /></IconBubble>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 6 }}>
            <Pill tone="neutral" size="xs">{item.kind.replace('-', ' ')}</Pill>
            <Pill tone="soft" size="xs">{item.classification}</Pill>
            <Pill tone={item.duplicate_count > 0 ? 'amber' : 'green'} size="xs">{item.duplicate_count} dupes</Pill>
            <Pill tone="ghost" size="xs">{item.status}</Pill>
          </div>
          <h3 className="ui" style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--ink)', lineHeight: 1.25 }}>{item.title}</h3>
          {item.summary && <p className="body-text" style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{item.summary}</p>}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="ui" style={{ marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green-700)', fontSize: 11.5, fontWeight: 800, textDecoration: 'none' }}>
              Open source <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 14 }}>
        <DecisionMetric label="Suggested" value={inboxActionLabel(item.suggested_action)} />
        <DecisionMetric label="Classification" value={item.classification || item.kind} />
        <DecisionMetric label="Review age" value={timeLabel(item.created_at) || 'New'} />
      </div>

      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 13 }}>
          {sliceSafe(tags, 0, 8).map(tag => <Pill key={`${item.id}-detail-${tag}`} tone="ghost" size="xs">{tag}</Pill>)}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 15, paddingTop: 14 }}>
        <InlineTitle icon={<Sparkles size={15} color="var(--green-700)" />} title="Decision" />
        {notice && (
          <div className="body-text" style={{ marginTop: 9, border: `1px solid ${notice.tone === 'ok' ? 'var(--green-700)' : '#fecdd3'}`, background: notice.tone === 'ok' ? 'var(--green-tint)' : '#fff1f2', color: notice.tone === 'ok' ? 'var(--green-700)' : '#9f1239', borderRadius: 12, padding: '8px 10px', fontSize: 11.5, lineHeight: 1.4 }}>
            {notice.message}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 8, marginTop: 10 }}>
          {INBOX_ACTIONS.filter(action => allowedActions.has(action.key)).map(action => {
            const busy = actingKey === `${inboxItemKey(item)}:${action.key}`
            return (
              <button
                key={action.key}
                type="button"
                data-testid={`research-inbox-action-${action.key}`}
                onClick={() => onAction(item, action.key)}
                disabled={Boolean(actingKey)}
                className="tap ui"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: `1px solid ${action.tone === 'green' ? 'var(--green-700)' : 'var(--hairline)'}`, background: action.tone === 'green' ? 'var(--green-tint)' : 'var(--surface)', color: action.tone === 'danger' ? '#9f1239' : 'var(--ink)', borderRadius: 12, padding: '10px 9px', fontSize: 11.5, fontWeight: 850, cursor: actingKey ? 'default' : 'pointer', opacity: actingKey && !busy ? 0.55 : 1 }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : action.icon}
                {action.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 15, paddingTop: 14 }}>
        <InlineTitle icon={<Link2 size={15} color="var(--green-700)" />} title="Likely connections" />
        <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
          {related.length === 0 ? (
            <p className="body-text" style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>No strong relationship suggestions yet. Keeping or seeding it will give the graph more to work with.</p>
          ) : related.map(suggestion => (
            <div key={`${item.id}-${suggestion.id}`} style={{ border: '1px solid var(--hairline)', background: 'var(--surface)', borderRadius: 12, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <Pill tone="green" size="xs">{suggestion.action}</Pill>
                <span className="ui" style={{ fontSize: 11.5, fontWeight: 850, color: 'var(--ink)' }}>{suggestion.source?.title || suggestion.target?.title}</span>
              </div>
              <p className="body-text" style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>{suggestion.reason}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DecisionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--hairline)', background: 'var(--surface)', borderRadius: 12, padding: 10, minHeight: 64 }}>
      <div className="ui" style={{ fontSize: 10.5, fontWeight: 850, color: 'var(--ink-3)' }}>{label}</div>
      <div className="ui" style={{ marginTop: 5, fontSize: 12.5, fontWeight: 850, color: 'var(--ink)', lineHeight: 1.25 }}>{value}</div>
    </div>
  )
}

function relatedSuggestionsForInbox(item: InboxItem, relationships: RelationshipSuggestion[]) {
  const itemWords = new Set(`${item.title} ${item.summary || ''} ${arrayOrEmpty(item.suggested_tags).join(' ')}`.toLowerCase().match(/[a-z0-9]{3,}/g) || [])
  return relationships
    .map(suggestion => {
      const haystack = `${suggestion.source?.title || ''} ${suggestion.target?.title || ''} ${suggestion.reason || ''} ${arrayOrEmpty(suggestion.evidence).join(' ')}`.toLowerCase()
      const score = Array.from(itemWords).reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0)
      return { suggestion, score }
    })
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score || b.suggestion.confidence - a.suggestion.confidence)
    .slice(0, 3)
    .map(item => item.suggestion)
}

function SpaceCard({ space }: { space: ProjectSpace }) {
  const counts = Object.entries(space.counts || {}).filter(([, count]) => count > 0)
  const members = arrayOrEmpty(space.members)
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
        <Pill tone="neutral" size="xs">{members.length} members</Pill>
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
