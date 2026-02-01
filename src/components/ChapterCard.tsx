import Link from "next/link";
import type { Chapter } from "@/types/database";

interface ChapterCardProps {
  chapter: Chapter;
  isUnlocked: boolean;
  totalScenarios: number;
  completedScenarios: number;
  /** First scenario ID in this chapter, used for replay link when complete */
  firstScenarioId?: string;
}

export default function ChapterCard({
  chapter,
  isUnlocked,
  totalScenarios,
  completedScenarios,
  firstScenarioId,
}: ChapterCardProps) {
  const progressPercent =
    totalScenarios > 0
      ? Math.round((completedScenarios / totalScenarios) * 100)
      : 0;

  const isComplete = totalScenarios > 0 && completedScenarios === totalScenarios;

  const cardContent = (
    <div
      className={`relative overflow-hidden rounded-xl border-2 p-6 transition-all ${
        isUnlocked
          ? "border-blue-200 bg-white shadow-md hover:border-blue-400 hover:shadow-lg"
          : "border-blue-100/50 bg-blue-50/30 opacity-60"
      }`}
    >
      {/* Chapter number badge */}
      <div className="mb-4 flex items-center justify-between">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full font-serif text-lg font-bold ${
            isComplete
              ? "bg-gold/20 text-gold"
              : isUnlocked
                ? "bg-blue-100 text-blue-800"
                : "bg-blue-50 text-blue-300"
          }`}
        >
          {chapter.chapterNumber}
        </span>

        {/* Lock / unlock / complete indicator */}
        {!isUnlocked ? (
          <span className="font-serif text-sm text-blue-300" aria-label="Locked">
            <LockIcon />
          </span>
        ) : isComplete ? (
          <span className="font-serif text-sm text-gold" aria-label="Complete">
            <CheckIcon />
          </span>
        ) : null}
      </div>

      {/* Title */}
      <h3
        className={`font-serif text-xl font-bold leading-tight ${
          isUnlocked ? "text-blue-900" : "text-blue-300"
        }`}
      >
        {chapter.title}
      </h3>

      {/* Description */}
      <p
        className={`mt-2 font-serif text-sm leading-relaxed ${
          isUnlocked ? "text-blue-800/70" : "text-blue-300/70"
        }`}
      >
        {chapter.description}
      </p>

      {/* Scenario count + progress */}
      <div className="mt-4 flex items-center justify-between">
        <span
          className={`font-serif text-xs ${
            isUnlocked ? "text-blue-600" : "text-blue-300"
          }`}
        >
          {totalScenarios} {totalScenarios === 1 ? "scenario" : "scenarios"}
        </span>

        {isUnlocked && totalScenarios > 0 && (
          <span className="font-serif text-xs text-blue-600">
            {completedScenarios}/{totalScenarios} complete
          </span>
        )}
      </div>

      {/* Progress bar */}
      {isUnlocked && totalScenarios > 0 && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
          <div
            className={`h-full rounded-full transition-all ${
              isComplete ? "bg-gold" : "bg-blue-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Replay link for completed chapters */}
      {isComplete && firstScenarioId && (
        <Link
          href={`/chapters/${chapter.id}/scenarios/${firstScenarioId}?replay=1`}
          className="mt-3 inline-flex items-center gap-1 font-serif text-xs font-medium text-gold hover:text-gold-light transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ReplayIcon />
          Replay
        </Link>
      )}
    </div>
  );

  if (isUnlocked) {
    return (
      <Link
        href={`/chapters/${chapter.id}`}
        className="block focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 rounded-xl"
      >
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}

// ---------------------------------------------------------------------------
// Inline SVG icons (avoids external dependency)
// ---------------------------------------------------------------------------

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 1 9 9" />
      <path d="M3 21v-9h9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
