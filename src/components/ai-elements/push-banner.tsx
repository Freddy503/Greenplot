'use client'

// PushArrivalBanner — the moment the web app opens on a push (Greenplot
// Redesign · surfaces-e). An iOS-style banner slides down under the status
// bar; tapping it expands into the briefing sheet, × dismisses.

import { Leaf, X } from 'lucide-react'
import { sparkTypeConfig, type SparkNotification } from '@/components/ai-elements/spark-card'

interface PushBannerProps {
  notification: SparkNotification
  body?: string
  onOpen: () => void
  onDismiss: () => void
}

export function PushArrivalBanner({ notification, body, onOpen, onDismiss }: PushBannerProps) {
  const cfg = sparkTypeConfig(notification.type)
  const sub = body || notification.subtitle || 'Tap to read.'

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, top: 0, zIndex: 90,
      padding: 'calc(env(safe-area-inset-top) + 10px) 10px 0',
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div
        className="push-bannerdown tap"
        onClick={onOpen}
        role="button"
        style={{
          pointerEvents: 'auto', width: '100%', maxWidth: 520,
          borderRadius: 18, padding: '11px 13px',
          display: 'flex', gap: 11, alignItems: 'center', cursor: 'pointer',
          background: 'rgba(252,251,248,0.94)',
          backdropFilter: 'blur(16px) saturate(140%)', WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          boxShadow: '0 14px 40px -10px rgba(8,20,12,0.45), inset 0 0 0 1px rgba(255,255,255,0.6)',
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(160deg,#34d97a,#16a34a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 5px 12px -5px rgba(34,197,94,0.6)',
        }}>
          <Leaf size={20} color="#06281a" strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span className="caps" style={{ fontSize: 9.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>Greenplot · {cfg.label}</span>
            <span className="body-text" style={{ fontSize: 10.5, color: 'var(--ink-3)', flexShrink: 0 }}>now</span>
          </div>
          <div className="ui" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {notification.title}
          </div>
          <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sub}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss() }}
          className="tap"
          aria-label="Dismiss"
          style={{ width: 26, height: 26, borderRadius: 99, flexShrink: 0, background: 'var(--surface-sunk)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <X size={13} color="var(--ink-3)" strokeWidth={2} />
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pushBannerDown { from { transform: translateY(-130%); } to { transform: translateY(0); } }
        .push-bannerdown { animation: pushBannerDown .45s cubic-bezier(.16,1,.3,1) both; }
      ` }} />
    </div>
  )
}
