'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Insight {
  title: string
  content: string
  selected: boolean
}

interface GardenHarvestSheetProps {
  insights: Insight[]
  loading: boolean
  error: string
  onSave: (selected: Insight[]) => void
  onClose: () => void
  saving: boolean
}

export function GardenHarvestSheet({
  insights: initialInsights,
  loading,
  error,
  onSave,
  onClose,
  saving,
}: GardenHarvestSheetProps) {
  const [insights, setInsights] = useState(initialInsights)

  const toggleInsight = (idx: number) => {
    setInsights((prev) =>
      prev.map((ins, i) => (i === idx ? { ...ins, selected: !ins.selected } : ins))
    )
  }

  const selectedCount = insights.filter((i) => i.selected).length

  // Sync with parent when insights change
  if (insights !== initialInsights && initialInsights.length > 0 && insights.length === 0) {
    setInsights(initialInsights)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-in fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300">
        <div className="max-w-lg mx-auto bg-surface-container-high rounded-t-3xl p-6 pb-8 shadow-2xl border-t border-outline-variant/10">
          {/* Handle */}
          <div className="w-10 h-1 rounded-full bg-on-surface-variant/20 mx-auto mb-5" />

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{ fontVariationSettings: '"FILL" 1' }}
                >
                  eco
                </span>
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-on-surface">Add to Garden</h3>
                <p className="text-xs text-on-surface-variant">
                  Review insights from this conversation
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>
                close
              </span>
            </button>
          </div>

          {/* Content */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <span
                className="material-symbols-outlined text-primary animate-spin"
                style={{ fontSize: '32px' }}
              >
                progress_activity
              </span>
              <p className="text-sm text-on-surface-variant">Extracting insights...</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl px-4 py-3 mb-4 text-sm bg-error/10 text-error">
              {error}
            </div>
          )}

          {!loading && insights.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <span
                className="material-symbols-outlined text-on-surface-variant/40"
                style={{ fontSize: '32px' }}
              >
                search_off
              </span>
              <p className="text-sm text-on-surface-variant">No extractable insights found in this conversation.</p>
            </div>
          )}

          {!loading && insights.length > 0 && (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto mb-4">
              {insights.map((insight, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleInsight(idx)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all active:scale-[0.98] ${
                    insight.selected
                      ? 'bg-primary/8 border-primary/25'
                      : 'bg-surface-container border-outline-variant/10 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                        insight.selected
                          ? 'bg-primary text-on-primary'
                          : 'border-2 border-on-surface-variant/30'
                      }`}
                    >
                      {insight.selected && (
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: '"wght" 700' }}>
                          check
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-on-surface mb-1">{insight.title}</p>
                      <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-3">
                        {insight.content}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          {!loading && insights.length > 0 && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-on-surface-variant/60 flex-1">
                {selectedCount} seed{selectedCount !== 1 ? 's' : ''} selected
              </p>
              <Button
                variant="ghost"
                onClick={onClose}
                className="rounded-full text-on-surface-variant"
              >
                Cancel
              </Button>
              <Button
                onClick={() => onSave(insights.filter((i) => i.selected))}
                disabled={selectedCount === 0 || saving}
                className="rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: '16px' }}>
                      progress_activity
                    </span>
                    Planting...
                  </span>
                ) : (
                  `Plant ${selectedCount} Seed${selectedCount !== 1 ? 's' : ''} 🌱`
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
