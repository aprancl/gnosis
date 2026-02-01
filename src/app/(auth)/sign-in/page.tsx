import Link from "next/link";
import { signIn, signInWithGoogle } from "../actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-parchment px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <h1 className="font-serif text-5xl font-bold tracking-tight text-blue-900">
              Gnosis
            </h1>
          </Link>
          <p className="mt-3 font-serif text-lg text-blue-800/70 italic">
            Enter the agora of knowledge
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-blue-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-center font-serif text-2xl font-semibold text-blue-900">
            Sign In
          </h2>

          {/* Error message */}
          {params.error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-serif text-sm text-red-800">
              {params.error}
            </div>
          )}

          {/* Success message */}
          {params.message && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 font-serif text-sm text-blue-800">
              {params.message}
            </div>
          )}

          <form className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="font-serif text-sm font-medium text-ink"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="scholar@example.com"
                className="rounded-lg border border-blue-200 bg-blue-50/30 px-4 py-2.5 font-serif text-ink placeholder:text-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="font-serif text-sm font-medium text-ink"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                placeholder="Your secret word"
                className="rounded-lg border border-blue-200 bg-blue-50/30 px-4 py-2.5 font-serif text-ink placeholder:text-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <button
              formAction={signIn}
              className="mt-2 rounded-lg bg-blue-700 px-6 py-3 font-serif text-lg font-medium text-white transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2"
            >
              Enter
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-blue-100" />
            <span className="font-serif text-sm text-blue-300">or</span>
            <div className="h-px flex-1 bg-blue-100" />
          </div>

          <form action={signInWithGoogle}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-blue-200 bg-white px-6 py-3 font-serif text-base font-medium text-blue-900 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>
          </form>

          <p className="mt-6 text-center font-serif text-sm text-blue-800/60">
            New to Gnosis?{" "}
            <Link
              href="/sign-up"
              className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
            >
              Create an account
            </Link>
          </p>
        </div>

        {/* Footer quote */}
        <p className="mt-6 text-center font-serif text-sm text-blue-800/40 italic">
          &#x0393;&#x03BD;&#x1FF6;&#x03B8;&#x03B9; &#x03C3;&#x03B5;&#x03B1;&#x03C5;&#x03C4;&#x03CC;&#x03BD;
        </p>
      </div>
    </div>
  );
}
