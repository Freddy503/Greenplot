import { ChevronRight } from 'lucide-react'

interface SectionHeaderProps {
  children: React.ReactNode
  action?: string
  onAction?: () => void
}

export default function SectionHeader({ children, action, onAction }: SectionHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 4px 11px' }}>
      <div className="caps" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{children}</div>
      {action && (
        <button
          onClick={onAction}
          className="tap"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--ui)',
            color: 'var(--green-700)',
            display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          {action}
          <ChevronRight size={14} color="var(--green-700)" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
