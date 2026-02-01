import Link from "next/link";
import { signIn } from "../actions";

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

          <p className="text-center font-serif text-sm text-blue-800/60">
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
