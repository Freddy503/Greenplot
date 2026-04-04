'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface ActivityItem {
  icon: string
  text: string
  color: string
}

interface ActivitySummaryData {
  timestamp: string
  stats: {
    total_seeds: number
    total_links: number
    total_articles: number
    seeds_today: number
    links_today: number
    connections_week: number
    pending: number
  }
  activities: ActivityItem[]
}

export function ActivitySummary({ token }: { token: string }) {
  const [data, setData] = useState<ActivitySummaryData | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check if already dismissed this session
    const lastDismissed = localStorage.getItem('greenplot_activity_dismissed')
    if (lastDismissed) {
      const dismissedTime = new Date(lastDismissed).getTime()
      const hoursSinceDismiss = (Date.now() - dismissedTime) / (1000 * 60 * 60)
      if (hoursSinceDismiss < 4) {
        setDismissed(true)
        return
      }
    }

    fetch('/api/activity/summary', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(d => {
        if (d.activities && d.activities.length > 0) {
          setData(d)
        }
      })
      .catch(() => {})
  }, [token])

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('greenplot_activity_dismissed', new Date().toISOString())
  }

  if (dismissed || !data) return null

  return (
    <div className="animate-in slide-in-from-top duration-300 mb-4">
      <Card className="bg-surface-container-low border-primary/20 relative overflow-hidden">
        {/* Subtle gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
        
        <CardContent className="p-4 relative">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span 
                className="material-symbols-outlined text-primary text-lg" 
                style={{ fontVariationSettings: '"FILL" 1' }}
              >
                trending_up
              </span>
              <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
                What's New
              </span>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant/40 hover:text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>

          {/* Activity items */}
          <div className="space-y-2">
            {data.activities.map((activity, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span 
                  className={`material-symbols-outlined text-sm ${activity.color}`}
                  style={{ fontVariationSettings: '"FILL" 1' }}
                >
                  {activity.icon}
                </span>
                <span className="text-sm text-on-surface">{activity.text}</span>
              </div>
            ))}
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-outline-variant/10">
            <div className="flex items-center gap-1 text-[10px] text-on-surface-variant/60">
              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: '"FILL" 1' }}>eco</span>
              <span className="font-bold">{data.stats.total_seeds}</span> seeds
            </div>
            <div className="flex items-center gap-1 text-[10px] text-on-surface-variant/60">
              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: '"FILL" 1' }}>link</span>
              <span className="font-bold">{data.stats.total_links}</span> sources
            </div>
            <div className="flex items-center gap-1 text-[10px] text-on-surface-variant/60">
              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: '"FILL" 1' }}>auto_stories</span>
              <span className="font-bold">{data.stats.total_articles}</span> articles
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
