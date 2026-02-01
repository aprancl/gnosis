"use client";

/**
 * VocabularyList - Displays all vocabulary words encountered with usage frequency.
 *
 * Groups vocabulary by how frequently they appeared across completed scenarios.
 * Words used more often are considered more "mastered".
 */

import { useMemo, useState } from "react";

interface VocabularyItem {
  word: string;
  /** Number of scenarios where this word appeared */
  count: number;
}

interface VocabularyListProps {
  /** Array of vocabulary items with usage counts */
  vocabulary: VocabularyItem[];
}

type FilterMode = "all" | "mastered" | "learning" | "new";

function getMasteryLevel(count: number): { label: string; color: string; bgColor: string } {
  if (count >= 3) {
    return {
      label: "Mastered",
      color: "text-emerald-700",
      bgColor: "bg-emerald-50 border-emerald-200",
    };
  }
  if (count >= 2) {
    return {
      label: "Learning",
      color: "text-amber-700",
      bgColor: "bg-amber-50 border-amber-200",
    };
  }
  return {
    label: "New",
    color: "text-blue-700",
    bgColor: "bg-blue-50 border-blue-200",
  };
}

function getFilterForMode(mode: FilterMode): (count: number) => boolean {
  switch (mode) {
    case "mastered":
      return (count) => count >= 3;
    case "learning":
      return (count) => count === 2;
    case "new":
      return (count) => count === 1;
    case "all":
    default:
      return () => true;
  }
}

export default function VocabularyList({ vocabulary }: VocabularyListProps) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredVocabulary = useMemo(() => {
    const filterFn = getFilterForMode(filter);
    return vocabulary
      .filter((v) => filterFn(v.count))
      .filter(
        (v) =>
          searchQuery === "" ||
          v.word.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => b.count - a.count);
  }, [vocabulary, filter, searchQuery]);

  const stats = useMemo(() => {
    const mastered = vocabulary.filter((v) => v.count >= 3).length;
    const learning = vocabulary.filter((v) => v.count === 2).length;
    const newWords = vocabulary.filter((v) => v.count === 1).length;
    return { mastered, learning, new: newWords, total: vocabulary.length };
  }, [vocabulary]);

  if (vocabulary.length === 0) {
    return (
      <div className="rounded-xl border border-blue-200 bg-white p-6">
        <div className="mb-3 font-sans text-xs font-medium uppercase tracking-wider text-blue-700">
          Vocabulary
        </div>
        <div className="flex h-32 items-center justify-center">
          <p className="font-serif text-blue-800/40 italic">
            No vocabulary recorded yet. Complete scenarios to build your word list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-white p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-sans text-xs font-medium uppercase tracking-wider text-blue-700">
          Vocabulary ({stats.total} words)
        </div>

        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search words..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-blue-200 bg-blue-50/30 px-3 py-1.5 pl-8 font-serif text-sm text-ink placeholder:text-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-48"
          />
          <SearchIcon />
        </div>
      </div>

      {/* Mastery summary bar */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full px-3 py-1 font-sans text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-blue-700 text-white"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          }`}
        >
          All ({stats.total})
        </button>
        <button
          onClick={() => setFilter("mastered")}
          className={`rounded-full px-3 py-1 font-sans text-xs font-medium transition-colors ${
            filter === "mastered"
              ? "bg-emerald-700 text-white"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          Mastered ({stats.mastered})
        </button>
        <button
          onClick={() => setFilter("learning")}
          className={`rounded-full px-3 py-1 font-sans text-xs font-medium transition-colors ${
            filter === "learning"
              ? "bg-amber-700 text-white"
              : "bg-amber-50 text-amber-700 hover:bg-amber-100"
          }`}
        >
          Learning ({stats.learning})
        </button>
        <button
          onClick={() => setFilter("new")}
          className={`rounded-full px-3 py-1 font-sans text-xs font-medium transition-colors ${
            filter === "new"
              ? "bg-blue-600 text-white"
              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
          }`}
        >
          New ({stats.new})
        </button>
      </div>

      {/* Vocabulary grid */}
      {filteredVocabulary.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filteredVocabulary.map((item) => {
            const mastery = getMasteryLevel(item.count);
            return (
              <div
                key={item.word}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${mastery.bgColor}`}
              >
                <span className="font-serif text-base text-ink">
                  {item.word}
                </span>
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 font-sans text-[10px] font-medium ${mastery.color}`}
                >
                  {mastery.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center">
          <p className="font-serif text-sm text-blue-800/40 italic">
            No words match the current filter.
          </p>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-blue-400"
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
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
