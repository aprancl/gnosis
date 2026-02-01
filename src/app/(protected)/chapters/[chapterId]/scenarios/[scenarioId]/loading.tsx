import Skeleton from "@/components/ui/Skeleton";

/**
 * Loading skeleton for the scenario chat page. Displayed automatically by
 * Next.js while the server component fetches scenario data.
 */
export default function ScenarioLoading() {
  return (
    <div className="flex h-screen flex-col bg-parchment">
      {/* Top navigation bar skeleton */}
      <header className="flex items-center justify-between border-b border-blue-200 bg-white/90 px-4 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-16" />
        <div className="w-24" />
      </header>

      {/* Chat header skeleton */}
      <div className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
          <Skeleton className="mt-1 h-3 w-40" />
        </div>
      </div>

      {/* Messages area skeleton */}
      <div className="flex-1 overflow-hidden px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="py-12 text-center">
            <Skeleton className="mx-auto h-16 w-16 rounded-full" />
            <Skeleton className="mx-auto mt-4 h-5 w-64" />
          </div>
        </div>
      </div>

      {/* Input area skeleton */}
      <div className="border-t border-blue-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
