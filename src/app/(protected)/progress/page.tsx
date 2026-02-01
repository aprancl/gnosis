import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getOverallStats,
  getUserProgress,
} from "@/lib/progress/tracker";
import type {
  Chapter,
  Scenario,
  UserProgress,
} from "@/types/database";
import ProgressChart from "@/components/progress/ProgressChart";
import StreakCalendar from "@/components/progress/StreakCalendar";
import VocabularyList from "@/components/progress/VocabularyList";

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch data in parallel
  const [stats, allProgress, chaptersResult, scenariosResult] =
    await Promise.all([
      getOverallStats(user!.id),
      getUserProgress(user!.id),
      supabase.from("chapters").select("*").order("chapter_number"),
      supabase.from("scenarios").select("*").order("scenario_number"),
    ]);

  const chapters = (chaptersResult.data ?? []) as unknown as Chapter[];
  const scenarios = (scenariosResult.data ?? []) as unknown as Scenario[];

  // ── Build accuracy data points for chart ───────────────────────────────
  const completedWithDates = allProgress
    .filter((p) => p.completed && p.completed_at && p.accuracy_score !== null)
    .sort(
      (a, b) =>
        new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime()
    );

  const accuracyDataPoints = completedWithDates.map((p) => {
    const date = new Date(p.completed_at!);
    return {
      label: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: Math.round((p.accuracy_score ?? 0) * 100),
      date: p.completed_at!,
    };
  });

  // ── Build active days for streak calendar ──────────────────────────────
  const activeDays = [
    ...new Set(
      allProgress
        .filter((p) => p.completed && p.completed_at)
        .map((p) => {
          const d = new Date(p.completed_at!);
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        })
    ),
  ];

  // ── Build vocabulary list with counts ──────────────────────────────────
  const vocabCounts = new Map<string, number>();
  for (const p of allProgress) {
    if (p.vocabulary_used) {
      for (const word of p.vocabulary_used) {
        vocabCounts.set(word, (vocabCounts.get(word) ?? 0) + 1);
      }
    }
  }
  const vocabularyItems = Array.from(vocabCounts.entries()).map(
    ([word, count]) => ({ word, count })
  );

  // ── Build chapter completion data ──────────────────────────────────────
  const chapterCompletionData = chapters.map((chapter) => {
    const chapterScenarios = scenarios.filter(
      (s) => s.chapter_id === chapter.id
    );
    const completedScenarios = chapterScenarios.filter((s) =>
      allProgress.some((p) => p.scenario_id === s.id && p.completed)
    );
    return {
      chapter,
      totalScenarios: chapterScenarios.length,
      completedScenarios: completedScenarios.length,
      isComplete: completedScenarios.length === chapterScenarios.length && chapterScenarios.length > 0,
    };
  });

  // ── Build grammar concepts practiced ───────────────────────────────────
  // Collect target_grammar from chapters where user has completed at least one scenario
  const practicedGrammar: string[] = [];
  for (const chapterData of chapterCompletionData) {
    if (chapterData.completedScenarios > 0) {
      for (const concept of chapterData.chapter.target_grammar) {
        if (!practicedGrammar.includes(concept)) {
          practicedGrammar.push(concept);
        }
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-serif text-sm text-blue-700 transition-colors hover:text-blue-900"
          >
            <BackArrowIcon />
            Dashboard
          </Link>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-blue-900">
            Gnosis
          </h1>
          <div className="w-24" />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {/* Page title */}
        <div className="mb-8">
          <h2 className="font-serif text-4xl font-bold text-blue-900">
            Your Progress
          </h2>
          <p className="mt-2 font-serif text-lg text-blue-800/60">
            A detailed view of your journey through Koine Greek.
          </p>
        </div>

        {/* Summary stats row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard
            label="Scenarios Completed"
            value={`${stats.totalCompleted}`}
            sub={stats.totalScenarios > 0 ? `/ ${stats.totalScenarios}` : undefined}
          />
          <StatCard
            label="Average Accuracy"
            value={
              stats.accuracyAvg !== null
                ? `${Math.round(stats.accuracyAvg * 100)}%`
                : "--"
            }
          />
          <StatCard
            label="Vocabulary"
            value={`${stats.vocabCount}`}
            sub="words"
          />
          <StatCard
            label="Current Streak"
            value={`${stats.streak}`}
            sub={stats.streak === 1 ? "day" : "days"}
          />
        </div>

        {/* Charts section */}
        <div className="space-y-6 mb-8">
          {/* Accuracy trend chart */}
          <ProgressChart dataPoints={accuracyDataPoints} title="Accuracy Trend" />

          {/* Streak calendar */}
          <StreakCalendar activeDays={activeDays} streak={stats.streak} />
        </div>

        {/* Chapter completion timeline */}
        <div className="mb-8">
          <div className="rounded-xl border border-blue-200 bg-white p-6">
            <div className="mb-4 font-sans text-xs font-medium uppercase tracking-wider text-blue-700">
              Chapter Completion
            </div>
            {chapterCompletionData.length > 0 ? (
              <div className="space-y-3">
                {chapterCompletionData.map(({ chapter, totalScenarios, completedScenarios, isComplete }) => (
                  <div key={chapter.id} className="flex items-center gap-4">
                    {/* Chapter status icon */}
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                        isComplete
                          ? "bg-emerald-100 text-emerald-700"
                          : completedScenarios > 0
                            ? "bg-blue-100 text-blue-700"
                            : "bg-blue-50 text-blue-300"
                      }`}
                    >
                      {isComplete ? (
                        <CheckIcon />
                      ) : (
                        <span className="font-sans text-xs font-bold">
                          {chapter.chapter_number}
                        </span>
                      )}
                    </div>

                    {/* Chapter info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-serif text-sm font-semibold text-blue-900 truncate">
                          Ch. {chapter.chapter_number}: {chapter.title}
                        </p>
                        <span className="flex-shrink-0 font-sans text-xs text-blue-800/50">
                          {completedScenarios}/{totalScenarios}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isComplete ? "bg-emerald-500" : "bg-blue-500"
                          }`}
                          style={{
                            width: `${totalScenarios > 0 ? (completedScenarios / totalScenarios) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-serif text-blue-800/40 italic">
                No chapters available.
              </p>
            )}
          </div>
        </div>

        {/* Grammar concepts practiced */}
        {practicedGrammar.length > 0 && (
          <div className="mb-8">
            <div className="rounded-xl border border-blue-200 bg-white p-6">
              <div className="mb-3 font-sans text-xs font-medium uppercase tracking-wider text-blue-700">
                Grammar Concepts Practiced
              </div>
              <div className="flex flex-wrap gap-2">
                {practicedGrammar.map((concept) => (
                  <span
                    key={concept}
                    className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-1.5 font-serif text-sm text-blue-900"
                  >
                    {concept}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Vocabulary list */}
        <VocabularyList vocabulary={vocabularyItems} />
      </main>

      {/* Footer */}
      <footer className="border-t border-blue-100 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <p className="font-serif text-xs text-blue-800/30 italic">
            &#x0393;&#x03BD;&#x1FF6;&#x03B8;&#x03B9; &#x03C3;&#x03B5;&#x03B1;&#x03C5;&#x03C4;&#x03CC;&#x03BD;
          </p>
          <Link
            href="/dashboard"
            className="font-serif text-xs text-blue-800/40 hover:text-blue-700 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
      <p className="font-serif text-xs font-medium text-blue-800/60 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1.5 font-serif text-3xl font-bold text-blue-900">
        {value}
        {sub && (
          <span className="text-lg font-normal text-blue-800/40"> {sub}</span>
        )}
      </p>
    </div>
  );
}

function BackArrowIcon() {
  return (
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
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
