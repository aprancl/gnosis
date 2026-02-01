import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { getOrCreateUser } from "@/server/auth";
import { getOverallStats, getUserProgress } from "@/lib/progress/tracker";
import { db } from "@/server/db";
import { setupProfile } from "@/app/(protected)/profile/actions";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  const displayName =
    clerkUser.firstName
      ? `${clerkUser.firstName}${clerkUser.lastName ? ` ${clerkUser.lastName}` : ""}`
      : null;
  const greeting = displayName || clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] || "Scholar";

  // Determine if new user (no current chapter set and no progress)
  const progressCount = await db.userProgress.count({ where: { userId: user.id } });
  const isNewUser = !user.currentChapterId && progressCount === 0;

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

          <div className="mt-10 rounded-xl border border-blue-200 bg-white p-8 shadow-sm text-left">
            <h2 className="font-serif text-2xl font-semibold text-blue-900 text-center">
              Ready to Begin?
            </h2>
            <p className="mt-2 font-serif text-sm text-blue-800/60 text-center">
              Welcome, {greeting}. Let&apos;s start your journey through the ancient world.
            </p>

            <form className="mt-6">
              <button
                formAction={setupProfile}
                className="w-full rounded-lg bg-blue-700 px-6 py-3 font-serif text-lg font-medium text-white transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-2"
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

  // ── Fetch real progress data ─────────────────────────────────────────
  const [stats, allProgress] = await Promise.all([
    getOverallStats(user.id),
    getUserProgress(user.id),
  ]);

  // Fetch current chapter info if set
  let currentChapter: { id: string; chapterNumber: number; title: string } | null = null;
  if (user.currentChapterId) {
    currentChapter = await db.chapter.findUnique({
      where: { id: user.currentChapterId },
      select: { id: true, chapterNumber: true, title: true },
    });
  }

  // Build recent completed scenarios from progress data (last 5)
  const recentCompleted = allProgress
    .filter((p) => p.completed)
    .slice(0, 5);

  let recentScenarios: Array<typeof allProgress[number] & { scenario?: { id: string; title: string } }> = [];
  if (recentCompleted.length > 0) {
    const scenarioIds = recentCompleted.map((p) => p.scenarioId);
    const scenarios = await db.scenario.findMany({
      where: { id: { in: scenarioIds } },
      select: { id: true, title: true },
    });

    recentScenarios = recentCompleted.map((p) => ({
      ...p,
      scenario: scenarios.find((s) => s.id === p.scenarioId),
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
              {displayName || clerkUser.emailAddresses[0]?.emailAddress}
            </Link>
            <UserButton />
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

          <div className="rounded-xl border border-blue-200 bg-white p-6 shadow-sm">
            <p className="font-serif text-sm font-medium text-blue-800/60 uppercase tracking-wide">
              Current Chapter
            </p>
            {currentChapter ? (
              <p className="mt-2 font-serif text-lg font-semibold text-blue-900">
                Ch. {currentChapter.chapterNumber}: {currentChapter.title}
              </p>
            ) : (
              <p className="mt-2 font-serif text-lg text-blue-800/40">
                Not started
              </p>
            )}
          </div>

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
          <Link
            href={currentChapter ? `/chapters/${currentChapter.id}` : "/chapters"}
            className="group rounded-xl border border-blue-200 bg-white p-6 shadow-sm transition-all hover:border-blue-400 hover:shadow-md"
          >
            <h3 className="font-serif text-xl font-semibold text-blue-900 group-hover:text-blue-700">
              {currentChapter ? "Continue Learning" : "Start Learning"}
            </h3>
            <p className="mt-2 font-serif text-sm text-blue-800/60">
              {currentChapter
                ? `Pick up where you left off in Chapter ${currentChapter.chapterNumber}.`
                : "Begin your journey with Chapter 1."}
            </p>
            <span className="mt-4 inline-block font-serif text-sm font-medium text-blue-700 group-hover:text-blue-900">
              {currentChapter ? "Continue" : "Begin"} &rarr;
            </span>
          </Link>

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
                    {item.completedAt && (
                      <p className="font-serif text-xs text-blue-800/40">
                        Completed{" "}
                        {new Date(item.completedAt).toLocaleDateString(
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
                  {item.accuracyScore !== null && (
                    <span className="rounded-full bg-blue-50 px-3 py-1 font-serif text-xs font-medium text-blue-700">
                      {Math.round(item.accuracyScore * 100)}%
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
