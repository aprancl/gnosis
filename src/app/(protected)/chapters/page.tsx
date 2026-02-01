import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { getOrCreateUser } from "@/server/auth";
import { db } from "@/server/db";
import ChapterCard from "@/components/ChapterCard";
import type { Chapter, Scenario } from "@/types/database";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Chapters - Gnosis",
  description: "Browse your Koine Greek learning chapters",
};

/**
 * Determines which chapters are unlocked based on user progress.
 */
function computeUnlockedChapters(
  chapters: Chapter[],
  scenariosByChapter: Map<string, Scenario[]>,
  completedScenarioIds: Set<string>
): Set<string> {
  const unlocked = new Set<string>();

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];

    if (i === 0) {
      unlocked.add(chapter.id);
      continue;
    }

    const prevChapter = chapters[i - 1];
    const prevScenarios = scenariosByChapter.get(prevChapter.id) ?? [];

    if (prevScenarios.length === 0) {
      unlocked.add(chapter.id);
      continue;
    }

    const allPrevCompleted = prevScenarios.every((s) =>
      completedScenarioIds.has(s.id)
    );

    if (allPrevCompleted) {
      unlocked.add(chapter.id);
    }
  }

  return unlocked;
}

export default async function ChaptersPage() {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  // Fetch data in parallel
  const [chapters, scenarios, progress] = await Promise.all([
    db.chapter.findMany({ orderBy: { chapterNumber: "asc" } }),
    db.scenario.findMany({ select: { id: true, chapterId: true, scenarioNumber: true } }),
    db.userProgress.findMany({
      where: { userId: user.id, completed: true },
      select: { scenarioId: true },
    }),
  ]);

  // Organize scenarios by chapter
  const scenariosByChapter = new Map<string, Scenario[]>();
  for (const scenario of scenarios) {
    const existing = scenariosByChapter.get(scenario.chapterId) ?? [];
    existing.push(scenario as unknown as Scenario);
    scenariosByChapter.set(scenario.chapterId, existing);
  }

  // Build set of completed scenario IDs
  const completedScenarioIds = new Set<string>();
  for (const p of progress) {
    completedScenarioIds.add(p.scenarioId);
  }

  const typedChapters = chapters as unknown as Chapter[];
  const unlockedChapterIds = computeUnlockedChapters(
    typedChapters,
    scenariosByChapter,
    completedScenarioIds
  );

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/dashboard"
            className="font-serif text-2xl font-bold tracking-tight text-blue-900 transition-colors hover:text-blue-700"
          >
            Gnosis
          </Link>
          <div className="flex items-center gap-4">
            <span className="font-serif text-sm text-blue-800/60">
              {email}
            </span>
            <UserButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <div className="mb-10 text-center">
          <h2 className="font-serif text-4xl font-bold text-blue-900">
            Chapters
          </h2>
          <p className="mt-3 font-serif text-lg text-blue-800/70">
            Master each chapter to unlock the next stage of your journey.
          </p>
        </div>

        {typedChapters.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-blue-200 p-12 text-center">
            <p className="font-serif text-lg text-blue-800/60">
              No chapters have been added yet. Check back soon.
            </p>
          </div>
        )}

        {typedChapters.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {typedChapters.map((chapter) => {
              const chapterScenarios =
                scenariosByChapter.get(chapter.id) ?? [];
              const completedCount = chapterScenarios.filter((s) =>
                completedScenarioIds.has(s.id)
              ).length;

              const sortedScenarios = [...chapterScenarios].sort(
                (a, b) => a.scenarioNumber - b.scenarioNumber
              );

              return (
                <ChapterCard
                  key={chapter.id}
                  chapter={chapter}
                  isUnlocked={unlockedChapterIds.has(chapter.id)}
                  totalScenarios={chapterScenarios.length}
                  completedScenarios={completedCount}
                  firstScenarioId={sortedScenarios[0]?.id}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-blue-200 bg-white/80 px-6 py-4 text-center">
        <p className="font-serif text-xs text-blue-800/40">
          Gnosis — Learn Koine Greek through conversation
        </p>
      </footer>
    </div>
  );
}
