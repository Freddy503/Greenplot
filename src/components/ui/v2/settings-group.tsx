import SectionHeader from './section-header'

interface SettingsGroupProps {
  label: string
  children: React.ReactNode
}

export default function SettingsGroup({ label, children }: SettingsGroupProps) {
  return (
    <>
      <SectionHeader>{label}</SectionHeader>
      <div className="v2-card" style={{ borderRadius: 18, overflow: 'hidden', padding: 0, marginBottom: 6 }}>
        {children}
      </div>
    </>
  )
}
