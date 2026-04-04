'use client'

interface FullScreenGraphProps {
  seeds: any[]
  open: boolean
  onClose: () => void
  onNodeClick?: (seed: any) => void
}

export function FullScreenGraph({ seeds, open, onClose, onNodeClick }: FullScreenGraphProps) {
  if (!open || seeds.length === 0) return null

  return (
    <div className="fixed inset-0 z-[100] bg-[#fafaf8]/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0dfdd]">
        <h2 className="text-lg font-bold text-[#111211]">Garden Graph</h2>
        <button onClick={onClose} className="text-[#5c5d5c] hover:text-[#111211]">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-wrap gap-3 max-w-4xl mx-auto">
          {seeds.map((seed) => (
            <div
              key={seed.id}
              className="px-4 py-2.5 bg-white rounded-xl border border-[#e0dfdd] text-sm text-[#111211] cursor-pointer hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
              onClick={() => onNodeClick?.(seed)}
            >
              {seed.title?.slice(0, 40) || seed.id.slice(0, 10)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
