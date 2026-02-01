import Skeleton from "@/components/ui/Skeleton";

/**
 * Loading skeleton for the dashboard page. Displayed automatically by Next.js
 * while the server component fetches data.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      {/* Header skeleton */}
      <header className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Skeleton className="h-8 w-24" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-20 rounded-lg" />
          </div>
        </div>
      </header>

      {/* Main content skeleton */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {/* Welcome section */}
        <div className="mb-10">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="mt-2 h-5 w-64" />
        </div>

        {/* Stats cards */}
        <div className="mb-10 grid gap-6 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-8 w-20" />
            </div>
          ))}
        </div>

        {/* Quick action cards */}
        <div className="mb-10 grid gap-6 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm"
            >
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
              <Skeleton className="mt-4 h-4 w-24" />
            </div>
          ))}
        </div>

        {/* Recent activity */}
        <Skeleton className="mb-4 h-8 w-40" />
        <div className="rounded-xl border border-blue-200 bg-white shadow-sm">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-blue-100 px-6 py-4 last:border-b-0"
            >
              <div>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-1 h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
