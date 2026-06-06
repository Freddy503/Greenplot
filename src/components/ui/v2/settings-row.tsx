import { LucideIcon } from 'lucide-react'

interface SettingsRowProps {
  Icon?: LucideIcon
  iconColor?: string
  title: string
  sub?: string
  right?: React.ReactNode
  last?: boolean
  onClick?: () => void
  titleStyle?: React.CSSProperties
}

export default function SettingsRow({ Icon, iconColor = 'var(--green-700)', title, sub, right, last, onClick, titleStyle }: SettingsRowProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 13,
        padding: '13px 16px',
        borderBottom: last ? 'none' : '1px solid var(--hairline)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {Icon && (
        <span style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'var(--green-tint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={18} color={iconColor} strokeWidth={1.75} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ui" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', ...titleStyle }}>{title}</div>
        {sub && <div className="body-text" style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}
