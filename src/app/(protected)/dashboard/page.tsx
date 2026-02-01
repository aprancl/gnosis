import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { setupProfile } from "@/app/(protected)/profile/actions";
import { getOverallStats, getUserProgress } from "@/lib/progress/tracker";
import type { Profile, Chapter, Scenario, UserProgress } from "@/types/database";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch user profile (select only needed columns)
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, current_chapter_id")
    .eq("id", user!.id)
    .single<Pick<Profile, "display_name" | "current_chapter_id">>();

  // Determine if this is a new user (no profile or no display name)
  const isNewUser = !profile;
  const displayName = profile?.display_name || null;
  const greeting = displayName || user?.email?.split("@")[0] || "Scholar";

  // ── New User Welcome Screen ──────────────────────────────────────────
  if (isNewUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-parchment px-4">
        <div className="w-full max-w-lg text-center">
          <h1 className="font-serif text-5xl font-bold tracking-tight text-blue-900">
            Welcome to Gnosis
          </h1>
          <p className="mt-4 font-serif text-lg text-blue-800/70 italic">
            Your journey into Koine Greek begins here.
          </p>

          {params.error && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-serif text-sm text-red-800">
              {params.error}
            </div>
          )}

          <div className="mt-10 rounded-xl border border-blue-200 bg-white p-8 shadow-sm text-left">
            <h2 className="font-serif text-2xl font-semibold text-blue-900 text-center">
              Set Up Your Profile
            </h2>
            <p className="mt-2 font-serif text-sm text-blue-800/60 text-center">
              How shall the scholars of the agora know you?
            </p>

            <form className="mt-6 flex flex-col gap-5">
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
                  placeholder="e.g., Alexandros, Sophia, Marcus..."
                  className="rounded-lg border border-blue-200 bg-blue-50/30 px-4 py-2.5 font-serif text-ink placeholder:text-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <button
                formAction={setupProfile}
                className="mt-2 rounded-lg bg-blue-700 px-6 py-3 font-serif text-lg font-medium text-white transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2"
              >
                Begin Chapter 1
              </button>
            </form>
          </div>

          <p className="mt-6 font-serif text-sm text-blue-800/40 italic">
            &#x0393;&#x03BD;&#x1FF6;&#x03B8;&#x03B9; &#x03C3;&#x03B5;&#x03B1;&#x03C5;&#x03C4;&#x03CC;&#x03BD;
          </p>
        </div>
      </div>
    );
  }

  // ── Fetch real progress data via tracker ─────────────────────────────
  const [stats, allProgress] = await Promise.all([
    getOverallStats(user!.id),
    getUserProgress(user!.id),
  ]);

  // Fetch current chapter info if set (select only needed columns)
  let currentChapter: Pick<Chapter, "id" | "chapter_number" | "title"> | null = null;
  if (profile?.current_chapter_id) {
    const { data } = await supabase
      .from("chapters")
      .select("id, chapter_number, title")
      .eq("id", profile.current_chapter_id)
      .single<Pick<Chapter, "id" | "chapter_number" | "title">>();
    currentChapter = data;
  }

  // Build recent completed scenarios from progress data (last 5)
  const recentCompleted = allProgress
    .filter((p) => p.completed)
    .slice(0, 5);

  let recentScenarios: (UserProgress & { scenario?: Scenario })[] = [];
  if (recentCompleted.length > 0) {
    const scenarioIds = recentCompleted.map((p) => p.scenario_id);
    const { data: scenarios } = await supabase
      .from("scenarios")
      .select("id, title")
      .in("id", scenarioIds);

    recentScenarios = recentCompleted.map((p) => ({
      ...p,
      scenario: (scenarios as Scenario[] | null)?.find(
        (s) => s.id === p.scenario_id
      ),
    }));
  }

  // ── Main Dashboard ───────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="font-serif text-2xl font-bold tracking-tight text-blue-900">
            Gnosis
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/profile"
              className="font-serif text-sm text-blue-800/60 hover:text-blue-700 transition-colors"
            >
              {displayName || user?.email}
            </Link>
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {/* Welcome section */}
        <div className="mb-10">
          <h2 className="font-serif text-4xl font-bold text-blue-900">
            Welcome back, {greeting}
          </h2>
          <p className="mt-2 font-serif text-lg text-blue-800/60">
            Continue your journey through the ancient world.
          </p>
        </div>

        {/* Stats and progress */}
        <div className="grid gap-6 sm:grid-cols-4 mb-10">
          {/* Progress card */}
          <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
            <p className="font-serif text-sm font-medium text-blue-800/60 uppercase tracking-wide">
              Scenarios Completed
            </p>
            <p className="mt-2 font-serif text-3xl font-bold text-blue-900">
              {stats.totalCompleted}
              {stats.totalScenarios > 0 ? (
                <span className="text-lg font-normal text-blue-800/40">
                  {" "}/ {stats.totalScenarios}
                </span>
              ) : null}
            </p>
          </div>

          {/* Current chapter card */}
          <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
            <p className="font-serif text-sm font-medium text-blue-800/60 uppercase tracking-wide">
              Current Chapter
            </p>
            {currentChapter ? (
              <p className="mt-2 font-serif text-lg font-semibold text-blue-900">
                Ch. {currentChapter.chapter_number}: {currentChapter.title}
              </p>
            ) : (
              <p className="mt-2 font-serif text-lg text-blue-800/40">
                Not started
              </p>
            )}
          </div>

          {/* Streak card */}
          <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
            <p className="font-serif text-sm font-medium text-blue-800/60 uppercase tracking-wide">
              Streak
            </p>
            <p className="mt-2 font-serif text-3xl font-bold text-blue-900">
              {stats.streak}
              <span className="text-lg font-normal text-blue-800/40">
                {" "}{stats.streak === 1 ? "day" : "days"}
              </span>
            </p>
          </div>

          {/* Vocabulary card */}
          <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
            <p className="font-serif text-sm font-medium text-blue-800/60 uppercase tracking-wide">
              Vocabulary
            </p>
            <p className="mt-2 font-serif text-3xl font-bold text-blue-900">
              {stats.vocabCount}
              <span className="text-lg font-normal text-blue-800/40">
                {" "}words
              </span>
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid gap-6 sm:grid-cols-2 mb-10">
          {/* Continue learning */}
          <Link
            href={currentChapter ? `/chapters/${currentChapter.id}` : "/chapters"}
            className="group rounded-xl border border-blue-200 bg-white p-6 shadow-sm transition-all hover:border-blue-400 hover:shadow-md"
          >
            <h3 className="font-serif text-xl font-semibold text-blue-900 group-hover:text-blue-700">
              {currentChapter ? "Continue Learning" : "Start Learning"}
            </h3>
            <p className="mt-2 font-serif text-sm text-blue-800/60">
              {currentChapter
                ? `Pick up where you left off in Chapter ${currentChapter.chapter_number}.`
                : "Begin your journey with Chapter 1."}
            </p>
            <span className="mt-4 inline-block font-serif text-sm font-medium text-blue-700 group-hover:text-blue-900">
              {currentChapter ? "Continue" : "Begin"} &rarr;
            </span>
          </Link>

          {/* Browse chapters */}
          <Link
            href="/chapters"
            className="group rounded-xl border border-blue-200 bg-white p-6 shadow-sm transition-all hover:border-blue-400 hover:shadow-md"
          >
            <h3 className="font-serif text-xl font-semibold text-blue-900 group-hover:text-blue-700">
              Browse Chapters
            </h3>
            <p className="mt-2 font-serif text-sm text-blue-800/60">
              Explore all available chapters and scenarios.
            </p>
            <span className="mt-4 inline-block font-serif text-sm font-medium text-blue-700 group-hover:text-blue-900">
              View all &rarr;
            </span>
          </Link>
        </div>

        {/* View detailed progress link */}
        <div className="mb-10 text-center">
          <Link
            href="/progress"
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-6 py-3 font-serif text-sm font-medium text-blue-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:shadow-md"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            View Detailed Progress
          </Link>
        </div>

        {/* Recent activity */}
        <div>
          <h3 className="font-serif text-2xl font-bold text-blue-900 mb-4">
            Recent Activity
          </h3>
          {recentScenarios.length > 0 ? (
            <div className="rounded-xl border border-blue-200 bg-white shadow-sm divide-y divide-blue-100">
              {recentScenarios.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <div>
                    <p className="font-serif text-sm font-semibold text-blue-900">
                      {item.scenario?.title ?? "Scenario"}
                    </p>
                    {item.completed_at && (
                      <p className="font-serif text-xs text-blue-800/40">
                        Completed{" "}
                        {new Date(item.completed_at).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        )}
                      </p>
                    )}
                  </div>
                  {item.accuracy_score !== null && (
                    <span className="rounded-full bg-blue-50 px-3 py-1 font-serif text-xs font-medium text-blue-700">
                      {Math.round(item.accuracy_score * 100)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-blue-100 bg-white/50 p-8 text-center">
              <p className="font-serif text-blue-800/40 italic">
                No completed scenarios yet. Begin your first lesson to see your
                progress here.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-blue-100 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <p className="font-serif text-xs text-blue-800/30 italic">
            &#x0393;&#x03BD;&#x1FF6;&#x03B8;&#x03B9; &#x03C3;&#x03B5;&#x03B1;&#x03C5;&#x03C4;&#x03CC;&#x03BD;
          </p>
          <Link
            href="/profile"
            className="font-serif text-xs text-blue-800/40 hover:text-blue-700 transition-colors"
          >
            Profile Settings
          </Link>
        </div>
      </footer>
    </div>
  );
}
