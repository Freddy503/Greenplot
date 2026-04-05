'use client'

import { useState } from 'react'

interface LintResult {
  stale: number
  orphans: number
  gaps: number
  quality_issues: number
  total_issues: number
  report_preview: string
}

export function WikiLintPanel() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<LintResult | null>(null)
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
        setResult(data.lint_result || data)
      } else {
        setError(data.error || 'Lint failed')
      }
    } catch (e) {
      setError('Failed to run lint check')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={runLint}
        disabled={running}
        className="w-full flex items-center justify-between p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10 hover:border-warning/20 transition-all disabled:opacity-50"
      >
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-warning" style={{ fontVariationSettings: '"FILL" 1' }}>
            {running ? 'progress_activity animate-spin' : 'build'}
          </span>
          <div className="text-left">
            <p className="text-sm font-bold text-on-surface">Wiki Lint</p>
            <p className="text-[10px] text-on-surface-variant">
              {running ? 'Checking articles...' : 'Check for stale, orphan, and gap issues'}
            </p>
          </div>
        </div>
        {!running && result && (
          <span className={`text-xs font-bold ${result.total_issues > 10 ? 'text-error' : result.total_issues > 0 ? 'text-warning' : 'text-primary'}`}>
            {result.total_issues} issues
          </span>
        )}
      </button>

      {error && (
        <div className="px-4 py-3 rounded-full bg-error/10 border border-error/20">
          <p className="text-xs text-error">{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-2xl bg-surface-container-low border border-outline-variant/10 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Stale', value: result.stale, color: 'text-secondary', icon: 'schedule' },
              { label: 'Orphans', value: result.orphans, color: 'text-error', icon: 'offline_bolt' },
              { label: 'Gaps', value: result.gaps, color: 'text-warning', icon: 'hourglass_empty' },
              { label: 'Quality', value: result.quality_issues, color: 'text-error', icon: 'error' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 p-2 rounded-xl bg-surface-container">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>
                  {item.icon}
                </span>
                <div>
                  <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-[9px] text-on-surface-variant">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
