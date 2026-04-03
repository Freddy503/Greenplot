'use client'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-[#01120b] text-[#e4fcf0]">
      <span className="material-symbols-outlined text-red-400" style={{ fontSize: 48 }}>
        error
      </span>
      <h2 className="text-lg font-bold">Something went wrong</h2>
      <p className="text-sm text-gray-400 max-w-md text-center">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-full bg-[#69f6b8] text-[#01120b] font-semibold text-sm hover:opacity-90 transition-opacity"
      >
        Try again
      </button>
    </div>
  )
}
