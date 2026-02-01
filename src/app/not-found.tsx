import Link from "next/link";

/**
 * Custom 404 page. Shown when a route does not match any known page.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-parchment px-4">
      <div className="max-w-md text-center">
        <p className="font-serif text-6xl font-bold text-blue-200">404</p>
        <h1 className="mt-4 font-serif text-3xl font-bold text-blue-900">
          Page Not Found
        </h1>
        <p className="mt-3 font-serif text-base text-blue-800/60">
          The page you are looking for does not exist, or has been moved.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-blue-700 px-6 py-3 font-serif text-sm font-medium text-white transition-colors hover:bg-blue-800"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-blue-200 bg-white px-6 py-3 font-serif text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
          >
            Home
          </Link>
        </div>
        <p className="mt-10 font-serif text-sm text-blue-800/30 italic">
          &#x0393;&#x03BD;&#x1FF6;&#x03B8;&#x03B9; &#x03C3;&#x03B5;&#x03B1;&#x03C5;&#x03C4;&#x03CC;&#x03BD;
        </p>
      </div>
    </div>
  );
}
