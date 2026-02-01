import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import ChapterCard from "@/components/ChapterCard";
import type { Chapter, Scenario, UserProgress } from "@/types/database";

export const metadata = {
  title: "Chapters - Gnosis",
  description: "Browse your Koine Greek learning chapters",
};

/**
 * Determines which chapters are unlocked based on user progress.
 *
 * Rules:
 * - Chapter 1 is always unlocked.
 * - A subsequent chapter is unlocked if ALL scenarios in the previous chapter
 *   (by chapter_number order) are completed.
 */
function computeUnlockedChapters(
  chapters: Chapter[],
  scenariosByChapter: Map<string, Scenario[]>,
  completedScenarioIds: Set<string>
): Set<string> {
  const unlocked = new Set<string>();

  // Chapters should already be sorted by chapter_number
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];

    if (i === 0) {
      // First chapter is always unlocked
      unlocked.add(chapter.id);
      continue;
    }

    // Check if all scenarios in the previous chapter are completed
    const prevChapter = chapters[i - 1];
    const prevScenarios = scenariosByChapter.get(prevChapter.id) ?? [];

    if (prevScenarios.length === 0) {
      // If previous chapter has no scenarios, consider it complete
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch chapters ordered by chapter_number (select only needed columns)
  const { data: chapters, error: chaptersError } = await supabase
    .from("chapters")
    .select("id, chapter_number, title, description")
    .order("chapter_number", { ascending: true });

  // Fetch all scenarios to compute counts per chapter (select only needed columns)
  const { data: scenarios, error: scenariosError } = await supabase
    .from("scenarios")
    .select("id, chapter_id, scenario_number");

  // Fetch user progress (only completed scenarios, select only needed columns)
  const { data: progress, error: progressError } = await supabase
    .from("user_progress")
    .select("scenario_id")
    .eq("user_id", user!.id)
    .eq("completed", true);

  const hasError = chaptersError || scenariosError || progressError;

  // Organize scenarios by chapter
  const scenariosByChapter = new Map<string, Scenario[]>();
  if (scenarios) {
    for (const scenario of scenarios as Scenario[]) {
      const existing = scenariosByChapter.get(scenario.chapter_id) ?? [];
      existing.push(scenario);
      scenariosByChapter.set(scenario.chapter_id, existing);
    }
  }

  // Build set of completed scenario IDs
  const completedScenarioIds = new Set<string>();
  if (progress) {
    for (const p of progress as UserProgress[]) {
      completedScenarioIds.add(p.scenario_id);
    }
  }

  // Compute which chapters are unlocked
  const typedChapters = (chapters ?? []) as Chapter[];
  const unlockedChapterIds = computeUnlockedChapters(
    typedChapters,
    scenariosByChapter,
    completedScenarioIds
  );

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
              {user?.email}
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        {/* Page title */}
        <div className="mb-10 text-center">
          <h2 className="font-serif text-4xl font-bold text-blue-900">
            Chapters
          </h2>
          <p className="mt-3 font-serif text-lg text-blue-800/70">
            Master each chapter to unlock the next stage of your journey.
          </p>
        </div>

        {/* Error state */}
        {hasError && (
          <div className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-center font-serif text-red-700">
            There was an error loading your chapters. Please try again later.
          </div>
        )}

        {/* Empty state */}
        {!hasError && typedChapters.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-blue-200 p-12 text-center">
            <p className="font-serif text-lg text-blue-800/60">
              No chapters have been added yet. Check back soon.
            </p>
          </div>
        )}

        {/* Chapter grid */}
        {typedChapters.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {typedChapters.map((chapter) => {
              const chapterScenarios =
                scenariosByChapter.get(chapter.id) ?? [];
              const completedCount = chapterScenarios.filter((s) =>
                completedScenarioIds.has(s.id)
              ).length;

              // Sort scenarios by scenario_number to find the first one
              const sortedScenarios = [...chapterScenarios].sort(
                (a, b) => a.scenario_number - b.scenario_number
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
