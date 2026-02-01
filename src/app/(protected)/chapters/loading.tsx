import Skeleton from "@/components/ui/Skeleton";

/**
 * Loading skeleton for the chapters page. Displayed automatically by Next.js
 * while the server component fetches data.
 */
export default function ChaptersLoading() {
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        {/* Title skeleton */}
        <div className="mb-10 text-center">
          <Skeleton className="mx-auto h-10 w-48" />
          <Skeleton className="mx-auto mt-3 h-5 w-80" />
        </div>

        {/* Chapter cards skeleton grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border-2 border-blue-100/50 bg-white p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-10 w-10 rounded-full" />
              </div>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1 h-4 w-2/3" />
              <div className="mt-4 flex items-center justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
