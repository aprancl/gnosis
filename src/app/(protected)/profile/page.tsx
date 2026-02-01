import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { updateProfile } from "./actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch the profile (select only needed columns)
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user!.id)
    .single();

  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/dashboard">
            <h1 className="font-serif text-2xl font-bold tracking-tight text-blue-900">
              Gnosis
            </h1>
          </Link>
          <div className="flex items-center gap-4">
            <span className="font-serif text-sm text-blue-800/60">
              {profile?.display_name || user?.email}
            </span>
            <form>
              <button
                formAction={signOut}
                className="rounded-lg border border-blue-200 bg-white px-4 py-2 font-serif text-sm text-blue-700 transition-colors hover:bg-blue-50"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-1 font-serif text-sm text-blue-700 hover:text-blue-900"
        >
          &larr; Back to Dashboard
        </Link>

        <h2 className="mt-4 font-serif text-3xl font-bold text-blue-900">
          Profile Settings
        </h2>
        <p className="mt-2 font-serif text-blue-800/60">
          Customize how you appear in the agora.
        </p>

        {/* Messages */}
        {params.error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-serif text-sm text-red-800">
            {params.error}
          </div>
        )}
        {params.message && (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 font-serif text-sm text-blue-800">
            {params.message}
          </div>
        )}

        {/* Profile form */}
        <div className="mt-8 rounded-xl border border-blue-200 bg-white p-8 shadow-sm">
          <form className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="font-serif text-sm font-medium text-ink"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={user?.email ?? ""}
                disabled
                className="rounded-lg border border-blue-100 bg-blue-50/30 px-4 py-2.5 font-serif text-ink/50 cursor-not-allowed"
              />
              <p className="font-serif text-xs text-blue-800/40">
                Email cannot be changed here.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="display_name"
                className="font-serif text-sm font-medium text-ink"
              >
                Display Name
              </label>
              <input
                id="display_name"
                name="display_name"
                type="text"
                defaultValue={profile?.display_name ?? ""}
                placeholder="How shall we address you, Scholar?"
                className="rounded-lg border border-blue-200 bg-blue-50/30 px-4 py-2.5 font-serif text-ink placeholder:text-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <button
              formAction={updateProfile}
              className="mt-2 self-start rounded-lg bg-blue-700 px-6 py-3 font-serif text-lg font-medium text-white transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2"
            >
              Save Changes
            </button>
          </form>
        </div>

        {/* Account info */}
        <div className="mt-8 rounded-xl border border-blue-100 bg-white/50 p-6">
          <h3 className="font-serif text-lg font-semibold text-blue-900">
            Account Information
          </h3>
          <dl className="mt-4 space-y-3">
            <div className="flex justify-between">
              <dt className="font-serif text-sm text-blue-800/60">
                Member since
              </dt>
              <dd className="font-serif text-sm text-ink">
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : "Unknown"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-serif text-sm text-blue-800/60">User ID</dt>
              <dd className="font-mono text-xs text-blue-800/40">
                {user?.id}
              </dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
