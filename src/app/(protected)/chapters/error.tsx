"use client";

/**
 * Error boundary page for the chapters route.
 * Next.js automatically renders this when the chapters page throws.
 */

export default function ChaptersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-parchment px-4">
      <div className="max-w-md text-center">
        <h2 className="font-serif text-3xl font-bold text-blue-900">
          Something went wrong
        </h2>
        <p className="mt-3 font-serif text-base text-blue-800/60">
          We could not load your chapters. This may be a temporary issue.
        </p>
        {error.message && (
          <p className="mt-2 font-serif text-sm text-red-600/70">
            {error.message}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-blue-700 px-6 py-3 font-serif text-sm font-medium text-white transition-colors hover:bg-blue-800"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
