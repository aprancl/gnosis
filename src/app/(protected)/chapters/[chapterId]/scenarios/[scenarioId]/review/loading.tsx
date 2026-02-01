import Skeleton from "@/components/ui/Skeleton";

/**
 * Loading skeleton for the scenario review page. Displayed automatically by
 * Next.js while the server component fetches review data.
 */
export default function ReviewLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      {/* Header skeleton */}
      <header className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
      </header>

      {/* Main content skeleton */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        {/* Title area */}
        <div className="mb-8 text-center">
          <Skeleton className="mx-auto h-10 w-56" />
          <Skeleton className="mx-auto mt-2 h-5 w-72" />
        </div>

        {/* Stats cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm"
            >
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-8 w-16" />
            </div>
          ))}
        </div>

        {/* Transcript skeleton */}
        <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
          <Skeleton className="mb-4 h-6 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <Skeleton className="h-16 flex-1 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
