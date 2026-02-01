import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { getOrCreateUser } from "@/server/auth";

interface ChapterDetailPageProps {
  params: Promise<{ chapterId: string }>;
}

export default async function ChapterDetailPage({ params }: ChapterDetailPageProps) {
  const { chapterId } = await params;

  const user = await getOrCreateUser();
  if (!user) notFound();

  const chapter = await db.chapter.findUnique({
    where: { id: chapterId },
    include: {
      scenarios: {
        orderBy: { scenarioNumber: "asc" },
      },
    },
  });

  if (!chapter) notFound();

  // Get user's completed scenarios for this chapter
  const completedProgress = await db.userProgress.findMany({
    where: {
      userId: user.id,
      completed: true,
      scenarioId: { in: chapter.scenarios.map((s) => s.id) },
    },
    select: { scenarioId: true },
  });

  const completedIds = new Set(completedProgress.map((p) => p.scenarioId));

  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/chapters"
            className="flex items-center gap-2 font-serif text-sm text-blue-700 transition-colors hover:text-blue-900"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
            All Chapters
          </Link>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-blue-900">
            Gnosis
          </h1>
          <div className="w-24" />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-8">
          <p className="font-serif text-sm font-medium uppercase tracking-wide text-blue-700">
            Chapter {chapter.chapterNumber}
          </p>
          <h2 className="mt-1 font-serif text-4xl font-bold text-blue-900">
            {chapter.title}
          </h2>
          <p className="mt-3 font-serif text-lg text-blue-800/60">
            {chapter.description}
          </p>
        </div>

        {/* Progress summary */}
        <div className="mb-8 rounded-xl border border-blue-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="font-serif text-sm text-blue-800/60">
              Progress
            </span>
            <span className="font-serif text-sm font-medium text-blue-900">
              {completedIds.size} / {chapter.scenarios.length} scenarios
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
            <div
              className={`h-full rounded-full transition-all ${
                completedIds.size === chapter.scenarios.length && chapter.scenarios.length > 0
                  ? "bg-emerald-500"
                  : "bg-blue-500"
              }`}
              style={{
                width: `${chapter.scenarios.length > 0 ? (completedIds.size / chapter.scenarios.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Scenario list */}
        <div className="space-y-3">
          {chapter.scenarios.map((scenario) => {
            const isCompleted = completedIds.has(scenario.id);

            return (
              <Link
                key={scenario.id}
                href={`/chapters/${chapterId}/scenarios/${scenario.id}`}
                className="group flex items-center gap-4 rounded-xl border border-blue-200 bg-white p-5 shadow-sm transition-all hover:border-blue-400 hover:shadow-md"
              >
                {/* Status indicator */}
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                    isCompleted
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {isCompleted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  ) : (
                    <span className="font-sans text-sm font-bold">
                      {scenario.scenarioNumber}
                    </span>
                  )}
                </div>

                {/* Scenario info */}
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-base font-semibold text-blue-900 group-hover:text-blue-700">
                    {scenario.title}
                  </p>
                  <p className="mt-0.5 font-serif text-sm text-blue-800/50 truncate">
                    {scenario.contextDescription}
                  </p>
                </div>

                {/* Arrow */}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-blue-300 group-hover:text-blue-500"><path d="m9 18 6-6-6-6" /></svg>
              </Link>
            );
          })}
        </div>

        {chapter.scenarios.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-blue-200 p-12 text-center">
            <p className="font-serif text-lg text-blue-800/60">
              No scenarios have been added to this chapter yet.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
