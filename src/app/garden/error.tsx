'use client'

export default function GardenError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-background text-on-surface">
      <span className="material-symbols-outlined text-error" style={{ fontSize: 48 }}>
        error
      </span>
      <h2 className="text-lg font-bold">Garden unavailable</h2>
      <p className="text-sm text-on-surface-variant max-w-md text-center">
        {error.message || 'Could not load your garden.'}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-full bg-primary text-background font-semibold text-sm hover:opacity-90 transition-opacity"
      >
        Try again
      </button>
    </div>
  )
}
