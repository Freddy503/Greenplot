import { Skeleton } from '@/components/ui/skeleton'
import Header from '@/components/layout/header'
import BottomNav from '@/components/layout/bottom-nav'

export default function GardenLoading() {
  return (
    <div className="flex flex-col h-dvh bg-background">
      <Header />
      <main className="pt-14 pb-20 px-4 flex-1 min-h-0 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* Title skeleton */}
          <div className="py-6 space-y-2">
            <Skeleton className="h-7 w-48 rounded-full" />
            <Skeleton className="h-4 w-72 rounded-full" />
          </div>

          {/* Filter bar skeleton */}
          <div className="flex gap-2 mb-6">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-20 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-full" />
          </div>

          {/* Grid skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-outline-variant/10 p-5 space-y-3">
                <Skeleton className="h-5 w-3/4 rounded-full" />
                <Skeleton className="h-3 w-full rounded-full" />
                <Skeleton className="h-3 w-5/6 rounded-full" />
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
