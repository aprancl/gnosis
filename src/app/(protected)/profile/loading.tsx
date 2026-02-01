import Skeleton from "@/components/ui/Skeleton";

/**
 * Loading skeleton for the profile page. Displayed automatically by Next.js
 * while the server component fetches data.
 */
export default function ProfileLoading() {
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
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <Skeleton className="mb-8 h-4 w-36" />
        <Skeleton className="mt-4 h-9 w-48" />
        <Skeleton className="mt-2 h-5 w-64" />

        {/* Form skeleton */}
        <div className="mt-8 rounded-xl border border-blue-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <Skeleton className="mt-2 h-12 w-36 rounded-lg" />
          </div>
        </div>

        {/* Account info skeleton */}
        <div className="mt-8 rounded-xl border border-blue-100 bg-white/50 p-6">
          <Skeleton className="h-6 w-44" />
          <div className="mt-4 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
