'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Sprout, Globe, FileText, BookOpen, GitBranch, Flame, Rss,
  Loader2, Check, Telescope, ArrowRight, Sparkles,
} from 'lucide-react'

// The agents, in the order they fan out. label + icon for the live feed.
type IconCmp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
const AGENTS: { key: string; label: string; Icon: IconCmp }[] = [
  { key: 'garden', label: 'Your garden', Icon: Sprout },
  { key: 'exa', label: 'Web search', Icon: Globe },
  { key: 'arxiv', label: 'arXiv papers', Icon: FileText },
  { key: 'openalex', label: 'Journals · OpenAlex', Icon: BookOpen },
  { key: 'github', label: 'GitHub repos', Icon: GitBranch },
  { key: 'hackernews', label: 'Hacker News', Icon: Flame },
  { key: 'rss', label: 'Feeds · Nature, labs', Icon: Rss },
]
const SOURCE_ICON: Record<string, IconCmp> = Object.fromEntries(AGENTS.map(a => [a.key, a.Icon]))
const SOURCE_VERB: Record<string, string> = {
  garden: 'Connected', exa: 'Found on the web', arxiv: 'Found on arXiv',
  openalex: 'Found in journals', github: 'Found on GitHub', hackernews: 'Spotted on HN', rss: 'Picked up',
}

const PHASE: Record<string, string> = {
  queued: 'Waking the agents…',
  scoping: 'Scoping your focus…',
  scouting: 'Agents scouting your sources…',
  synthesizing: 'Reading sources in full · connecting the dots…',
  reporting: 'Writing your brief…',
  done: 'Your first brief is ready',
  error: 'Hit a snag — you can retry from the garden',
}

type Finding = { source: string; title: string; url: string }
type RunStatus = {
  status: string
  theme: string | null
  finding_count: number
  findings_by_source: Record<string, number>
  recent_findings?: Finding[]
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
  // Keep callbacks in a ref so the polling effect depends ONLY on runId — an
  // inline onDone (e.g. () => loadRuns()) would otherwise restart polling on
  // every parent re-render.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    let alive = true
    notified.current = false  // fresh run id → allow the done callback again
    const tick = async () => {
      try {
        const t = typeof window !== 'undefined' ? localStorage.getItem('greenplot_token') || '' : ''
        const r = await fetch(`/api/research/runs/${runId}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
        if (r.ok && alive) {
          const d = await r.json()
          setRun(d)
          if (d.status === 'done' && !notified.current) { notified.current = true; onDoneRef.current?.(d.result_seed_id || null) }
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
  }, [runId])

  const status = run?.status || 'queued'
  const bySource = run?.findings_by_source || {}
  const totalFound = run?.finding_count || 0
  const scoutingDone = !SCOUTING.has(status)  // past scouting → all agents reported

  const agentState = (key: string): 'done' | 'active' | 'pending' => {
    if (key in bySource || scoutingDone) return 'done'
    if (status === 'scouting' || status === 'scoping') return 'active'
    return 'pending'
  }

  const findings = run?.recent_findings || []

  // While synthesizing (no new findings stream in), rotate live narration —
  // including the real titles being read — so the wait never feels stuck.
  const [narrIdx, setNarrIdx] = useState(0)
  useEffect(() => {
    if (status !== 'synthesizing' && status !== 'reporting') return
    const id = setInterval(() => setNarrIdx(i => i + 1), 2600)
    return () => clearInterval(id)
  }, [status])
  const synthLines = [
    ...findings.slice(0, 8).map(f => `Reading “${f.title}” in full…`),
    'Connecting the dots across your sources…',
    'Comparing where the sources agree and disagree…',
    'Finding the gap your garden hasn’t closed yet…',
    'Writing your cited brief…',
  ]
  const narr = synthLines[narrIdx % synthLines.length] || 'Synthesizing…'

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

      {/* Live discoveries — real titles streaming in (the wow) */}
      {findings.length > 0 && status !== 'done' && (
        <div style={{ marginTop: 12 }}>
          <div className="caps" style={{ fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.08em', margin: '0 2px 7px' }}>Latest discoveries</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {findings.slice(0, 6).map((f) => {
              const Icon = SOURCE_ICON[f.source] || Globe
              return (
                <div key={f.url || f.title} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 10,
                  background: 'var(--surface-sunk)', border: '1px solid var(--hairline)',
                  animation: 'gp-discover .45s cubic-bezier(.2,.8,.2,1) both',
                }}>
                  <Icon size={13} strokeWidth={1.9} color="var(--green-700)" />
                  <span className="ui" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title || f.url}</span>
                  <span className="ui" style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--ink-3)', flexShrink: 0 }}>{SOURCE_VERB[f.source] || 'Found'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Synthesis narration — rotates through the real titles being read */}
      {(status === 'synthesizing' || status === 'reporting') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '9px 12px', borderRadius: 12, background: 'var(--green-tint)' }}>
          <Loader2 size={13} strokeWidth={2} className="animate-spin" color="var(--green-700)" />
          <span key={narrIdx} className="ui" style={{ fontSize: 12, fontWeight: 600, color: 'var(--green-deep)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', animation: 'gp-discover .4s ease both' }}>
            {narr}
          </span>
        </div>
      )}

      <style>{`@keyframes gp-discover { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }`}</style>

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
