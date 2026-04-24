'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-4 bg-background text-on-surface">
      <span className="material-symbols-outlined text-6xl text-error">error</span>
      <h1 className="text-2xl font-normal text-on-surface">Something went wrong</h1>
      <p className="text-sm text-on-surface-variant max-w-sm text-center">
        We encountered an unexpected error. Please try again.
      </p>
      <Button
        onClick={() => reset()}
        className="px-4 py-2 rounded-full bg-primary text-on-primary font-semibold text-sm hover:opacity-90 transition-opacity"
      >
        Try again
      </Button>
    </div>
  )
}
