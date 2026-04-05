'use client'

import { useState } from 'react'

interface LintReport {
  success: boolean
  lint_before: {
    stale_articles: any[]
    orphan_articles: any[]
    knowledge_gaps: any[]
    quality_issues: any[]
    total_issues: number
  }
  lint_after?: {
    stale_articles: any[]
    orphan_articles: any[]
    knowledge_gaps: any[]
    quality_issues: any[]
    total_issues: number
  }
  report: string
  auto_created: number
  created_articles: any[]
}

export function WikiLintPanel() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<LintReport | null>(null)
  const [error, setError] = useState('')

  const runLint = async () => {
    setRunning(true)
    setError('')
    try {
      const token = localStorage.getItem('greenplot_token') || ''
      const res = await fetch('/api/wiki/lint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
      const data = await res.json()
      if (data.success) {
        setReport(data)
      } else {
        setError(data.error || data.detail || 'Lint failed')
      }
    } catch (e) {
      setError('Failed to run lint check')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        onClick={runLint}
        disabled={running}
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-warning/20 transition-all disabled:opacity-50"
      >
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-warning" style={{ fontVariationSettings: '"FILL" 1' }}>
            {running ? 'progress_activity' : 'build'}
          </span>
          <div className="text-left">
            <p className="text-sm font-bold text-on-surface">Wiki Lint</p>
            <p className="text-[10px] text-on-surface-variant">
              {running ? 'Analyzing articles...' : 'Run quality check — finds stale, orphan, gap issues'}
            </p>
          </div>
        </div>
        {running && <span className="material-symbols-outlined text-warning animate-spin">progress_activity</span>}
      </button>

      {error && (
        <div className="p-4 rounded-2xl bg-error/10 border border-error/20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: '"FILL" 1' }}>error</span>
            <p className="text-xs text-error">{error}</p>
          </div>
        </div>
      )}

      {report && (
        <div className="rounded-2xl bg-surface-container-low border border-outline-variant/10 overflow-hidden">
          {/* Summary cards */}
          <div className="p-4 grid grid-cols-2 gap-3">
            {[
              { label: 'Stale', value: report.lint_before.stale_articles.length, color: 'text-secondary', icon: 'schedule' },
              { label: 'Orphans', value: report.lint_before.orphan_articles.length, color: 'text-red-400', icon: 'psychology_alt' },
              { label: 'Gaps', value: report.lint_before.knowledge_gaps.length, color: 'text-warning', icon: 'hourglass_empty' },
              { label: 'Quality', value: report.lint_before.quality_issues.length, color: 'text-error', icon: 'report' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>
                  {item.icon}
                </span>
                <div>
                  <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-[9px] uppercase tracking-wider text-on-surface-variant">{item.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Auto-created */}
          {report.auto_created > 0 && (
            <div className="px-4 py-3 bg-primary/5 border-t border-primary/10">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
                <p className="text-xs font-bold text-primary">Auto-created {report.auto_created} wiki articles</p>
              </div>
              {report.created_articles.map((a, i) => (
                <p key={i} className="text-[10px] text-on-surface-variant ml-6">
                  ✅ {a.title} ({a.seeds || 0} seeds, {a.links || 0} links)
                </p>
              ))}
            </div>
          )}

          {/* Full report */}
          <div className="px-4 py-3 border-t border-outline-variant/10">
            <p className="text-sm font-bold text-on-surface mb-2">Full Report</p>
            <pre className="text-[10px] text-on-surface-variant/80 whitespace-pre-wrap font-mono max-h-64 overflow-auto bg-surface-container rounded-xl p-3">
              {report.report}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
