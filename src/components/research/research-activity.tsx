'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Sprout, Globe, FileText, BookOpen, GitBranch, Flame, Rss,
  Loader2, Check, Telescope, ArrowRight, Sparkles,
} from 'lucide-react'

// The agents, in the order they fan out. label + icon for the live feed.
const AGENTS: { key: string; label: string; Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }[] = [
  { key: 'garden', label: 'Your garden', Icon: Sprout },
  { key: 'exa', label: 'Web search', Icon: Globe },
  { key: 'arxiv', label: 'arXiv papers', Icon: FileText },
  { key: 'openalex', label: 'Journals · OpenAlex', Icon: BookOpen },
  { key: 'github', label: 'GitHub repos', Icon: GitBranch },
  { key: 'hackernews', label: 'Hacker News', Icon: Flame },
  { key: 'rss', label: 'Feeds · Nature, labs', Icon: Rss },
]

const PHASE: Record<string, string> = {
  queued: 'Waking the agents…',
  scoping: 'Scoping your focus…',
  scouting: 'Agents scouting your sources…',
  synthesizing: 'Reading sources in full · connecting the dots…',
  reporting: 'Writing your brief…',
  done: 'Your first brief is ready',
  error: 'Hit a snag — you can retry from the garden',
}

type RunStatus = {
  status: string
  theme: string | null
  finding_count: number
  findings_by_source: Record<string, number>
  result_seed_id: string | null
}

const SCOUTING = new Set(['queued', 'scoping', 'scouting'])
const ACTIVE = new Set(['queued', 'scoping', 'scouting', 'synthesizing', 'reporting'])

export default function ResearchActivity({ runId, onOpen, onDone }: {
  runId: string
  onOpen?: (seedId: string) => void
  onDone?: (seedId: string | null) => void
}) {
  const [run, setRun] = useState<RunStatus | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notified = useRef(false)

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const t = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
        const r = await fetch(`/api/research/runs/${runId}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
        if (r.ok && alive) {
          const d = await r.json()
          setRun(d)
          if (d.status === 'done' && !notified.current) { notified.current = true; onDone?.(d.result_seed_id || null) }
          if (ACTIVE.has(d.status)) timer.current = setTimeout(tick, 2500)
        } else if (alive) {
          timer.current = setTimeout(tick, 4000)
        }
      } catch {
        if (alive) timer.current = setTimeout(tick, 5000)
      }
    }
    tick()
    return () => { alive = false; if (timer.current) clearTimeout(timer.current) }
  }, [runId, onDone])

  const status = run?.status || 'queued'
  const bySource = run?.findings_by_source || {}
  const totalFound = run?.finding_count || 0
  const scoutingDone = !SCOUTING.has(status)  // past scouting → all agents reported

  const agentState = (key: string): 'done' | 'active' | 'pending' => {
    if (key in bySource || scoutingDone) return 'done'
    if (status === 'scouting' || status === 'scoping') return 'active'
    return 'pending'
  }

  return (
    <div className="v2-card" style={{ borderRadius: 20, padding: 16, width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--green-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {status === 'done'
            ? <Sparkles size={17} color="var(--green-700)" strokeWidth={1.9} />
            : <Telescope size={17} color="var(--green-700)" strokeWidth={1.9} />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="ui" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
            {status === 'done' ? 'Your garden is taking shape' : 'Researching your interests'}
          </div>
          <div className="body-text" style={{ fontSize: 11.5, color: 'var(--green-700)', fontWeight: 600 }}>
            {PHASE[status] || 'Working…'}{run?.theme ? ` · ${run.theme}` : ''}
          </div>
        </div>
        {totalFound > 0 && (
          <span className="ui" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--green-deep)', background: 'var(--green-tint)', borderRadius: 9999, padding: '4px 10px', flexShrink: 0 }}>
            {totalFound} found
          </span>
        )}
      </div>

      {/* Agents lighting up */}
      <div style={{ display: 'grid', gap: 7 }}>
        {AGENTS.map(({ key, label, Icon }) => {
          const st = agentState(key)
          const count = bySource[key]
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 12,
              background: st === 'done' ? 'var(--green-tint)' : 'var(--surface-sunk)',
              opacity: st === 'pending' ? 0.5 : 1,
              transition: 'background .4s ease, opacity .4s ease',
            }}>
              <Icon size={15} strokeWidth={1.9} color={st === 'done' ? 'var(--green-700)' : 'var(--ink-3)'} />
              <span className="ui" style={{ fontSize: 12.5, fontWeight: 600, color: st === 'pending' ? 'var(--ink-3)' : 'var(--ink)', flex: 1 }}>{label}</span>
              {st === 'done' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {typeof count === 'number' && count > 0 && (
                    <span className="ui" style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-700)' }}>{count}</span>
                  )}
                  <Check size={14} strokeWidth={2.5} color="var(--green-700)" />
                </span>
              ) : st === 'active' ? (
                <Loader2 size={14} strokeWidth={2} className="animate-spin" color="var(--green-700)" />
              ) : (
                <span style={{ width: 7, height: 7, borderRadius: 9999, background: 'var(--ink-3)', opacity: 0.4 }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Synthesis shimmer */}
      {(status === 'synthesizing' || status === 'reporting') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '9px 12px', borderRadius: 12, background: 'var(--green-tint)' }}>
          <Loader2 size={13} strokeWidth={2} className="animate-spin" color="var(--green-700)" />
          <span className="ui" style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-deep)' }}>
            {status === 'synthesizing' ? 'Reading the best sources in full + finding your gap…' : 'Writing your cited brief…'}
          </span>
        </div>
      )}

      {/* Done → the payoff card */}
      {status === 'done' && (
        <button
          onClick={() => run?.result_seed_id && (onOpen ? onOpen(run.result_seed_id) : undefined)}
          className="tap ui"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, background: 'var(--green)', color: '#06281a', border: 'none', borderRadius: 13, padding: '12px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <Sparkles size={15} strokeWidth={2} />
          <span style={{ flex: 1, textAlign: 'left' }}>Read your first research brief</span>
          <ArrowRight size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
