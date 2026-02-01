"use client";

/**
 * ScenarioReview component - displays a post-scenario review summary.
 *
 * Shows:
 * - Overall performance indicator (accuracy percentage)
 * - Summary of corrections made during the conversation
 * - Vocabulary used correctly
 * - Full conversation transcript with corrections highlighted
 * - Navigation buttons (continue to next scenario or back to chapters)
 */

import { useMemo } from "react";
import Link from "next/link";
import type { ConversationMessage, Scenario } from "@/types/database";
import type { Correction } from "@/types/corrections";
import { parseCorrections } from "@/lib/corrections/parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReviewData {
  scenario: Scenario;
  chapterId: string;
  messages: ConversationMessage[];
  accuracyScore: number | null;
  vocabularyUsed: string[] | null;
  nextScenarioId: string | null;
  nextScenarioTitle: string | null;
}

interface ScenarioReviewProps {
  data: ReviewData;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MessageWithCorrections {
  message: ConversationMessage;
  corrections: Correction[];
}

function extractAllCorrections(
  messages: ConversationMessage[]
): MessageWithCorrections[] {
  return messages
    .filter((m) => m.role === "assistant")
    .map((message) => {
      // Try to use stored corrections from the database
      const storedCorrections =
        message.corrections &&
        typeof message.corrections === "object" &&
        "corrections" in message.corrections &&
        Array.isArray((message.corrections as Record<string, unknown>).corrections)
          ? ((message.corrections as Record<string, unknown>).corrections as Correction[])
          : null;

      const corrections =
        storedCorrections && storedCorrections.length > 0
          ? storedCorrections
          : parseCorrections(message.content).corrections;

      return { message, corrections };
    })
    .filter((entry) => entry.corrections.length > 0);
}

function computeAccuracy(
  messages: ConversationMessage[],
  storedScore: number | null
): number {
  if (storedScore !== null && storedScore >= 0 && storedScore <= 1) {
    return Math.round(storedScore * 100);
  }

  // Fallback: estimate from corrections ratio
  const userMessages = messages.filter((m) => m.role === "user").length;
  const assistantWithCorrections = extractAllCorrections(messages).length;

  if (userMessages === 0) return 100;

  // Messages where the assistant did NOT correct anything
  const cleanExchanges = Math.max(0, userMessages - assistantWithCorrections);
  return Math.round((cleanExchanges / userMessages) * 100);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AccuracyIndicator({ percentage }: { percentage: number }) {
  const color =
    percentage >= 80
      ? "text-emerald-700"
      : percentage >= 60
        ? "text-amber-700"
        : "text-red-700";

  const bgColor =
    percentage >= 80
      ? "bg-emerald-50 border-emerald-200"
      : percentage >= 60
        ? "bg-amber-50 border-amber-200"
        : "bg-red-50 border-red-200";

  const barColor =
    percentage >= 80
      ? "bg-emerald-500"
      : percentage >= 60
        ? "bg-amber-500"
        : "bg-red-500";

  const label =
    percentage >= 90
      ? "Excellent"
      : percentage >= 80
        ? "Great"
        : percentage >= 70
          ? "Good"
          : percentage >= 60
            ? "Fair"
            : "Keep Practicing";

  return (
    <div className={`rounded-xl border p-6 ${bgColor}`}>
      <div className="mb-2 font-sans text-xs font-medium uppercase tracking-wider text-blue-800/60">
        Overall Performance
      </div>
      <div className="flex items-baseline gap-3">
        <span className={`font-serif text-5xl font-bold ${color}`}>
          {percentage}%
        </span>
        <span className={`font-serif text-lg ${color}`}>{label}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function CorrectionsSummary({
  messagesWithCorrections,
}: {
  messagesWithCorrections: MessageWithCorrections[];
}) {
  const allCorrections = messagesWithCorrections.flatMap((m) => m.corrections);

  if (allCorrections.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="mb-2 font-sans text-xs font-medium uppercase tracking-wider text-emerald-700">
          Corrections
        </div>
        <p className="font-serif text-lg text-emerald-800">
          No corrections needed -- well done!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6">
      <div className="mb-3 font-sans text-xs font-medium uppercase tracking-wider text-amber-700">
        Corrections ({allCorrections.length})
      </div>
      <div className="space-y-3">
        {allCorrections.map((correction, i) => (
          <div
            key={i}
            className="rounded-lg border border-amber-200 bg-white p-3"
          >
            {correction.original && correction.corrected ? (
              <div className="mb-1 font-serif text-base">
                <span className="text-red-700 line-through">
                  {correction.original}
                </span>
                <span className="mx-2 text-blue-400">{"->"}</span>
                <span className="font-semibold text-emerald-700">
                  {correction.corrected}
                </span>
              </div>
            ) : correction.corrected ? (
              <div className="mb-1 font-serif text-base font-semibold text-emerald-700">
                {correction.corrected}
              </div>
            ) : null}
            <div className="font-sans text-sm text-amber-800/80">
              {correction.explanation}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VocabularySection({ vocabulary }: { vocabulary: string[] }) {
  if (vocabulary.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6">
      <div className="mb-3 font-sans text-xs font-medium uppercase tracking-wider text-blue-700">
        Vocabulary Used ({vocabulary.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {vocabulary.map((word, i) => (
          <span
            key={i}
            className="rounded-lg border border-blue-200 bg-white px-3 py-1 font-serif text-base text-blue-900"
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}

function TranscriptMessage({
  message,
  corrections,
}: {
  message: ConversationMessage;
  corrections: Correction[];
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-blue-700 text-white"
            : "border border-blue-100 bg-white text-ink shadow-sm"
        }`}
      >
        <div
          className={`mb-0.5 font-sans text-xs font-medium uppercase tracking-wider ${
            isUser ? "text-blue-200" : "text-blue-400"
          }`}
        >
          {isUser ? "You" : "Didaskalos"}
        </div>
        <div
          className={`font-serif text-base leading-relaxed whitespace-pre-wrap ${
            isUser ? "text-white" : "text-ink"
          }`}
        >
          {message.content}
        </div>
        {!isUser && corrections.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1 font-sans text-xs text-amber-600">
            <CorrectionIcon />
            <span>
              {corrections.length} correction{corrections.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationTranscript({
  messages,
  messagesWithCorrections,
}: {
  messages: ConversationMessage[];
  messagesWithCorrections: MessageWithCorrections[];
}) {
  // Build a map from message id to its corrections
  const correctionsByMessageId = useMemo(() => {
    const map = new Map<string, Correction[]>();
    for (const entry of messagesWithCorrections) {
      map.set(entry.message.id, entry.corrections);
    }
    return map;
  }, [messagesWithCorrections]);

  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-blue-200 bg-white p-6 text-center">
        <p className="font-serif text-blue-800/60">
          No conversation messages found.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-parchment p-4">
      <div className="mb-3 font-sans text-xs font-medium uppercase tracking-wider text-blue-700">
        Conversation Transcript
      </div>
      <div className="space-y-3">
        {messages.map((msg) => (
          <TranscriptMessage
            key={msg.id}
            message={msg}
            corrections={correctionsByMessageId.get(msg.id) ?? []}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CorrectionIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ReplayIcon() {
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
      <path d="M3 12a9 9 0 1 1 9 9" />
      <path d="M3 21v-9h9" />
    </svg>
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

function ArrowRightIcon() {
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
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ScenarioReview({ data }: ScenarioReviewProps) {
  const {
    scenario,
    chapterId,
    messages,
    accuracyScore,
    vocabularyUsed,
    nextScenarioId,
    nextScenarioTitle,
  } = data;

  const messagesWithCorrections = useMemo(
    () => extractAllCorrections(messages),
    [messages]
  );

  const accuracy = useMemo(
    () => computeAccuracy(messages, accuracyScore),
    [messages, accuracyScore]
  );

  const vocabulary = vocabularyUsed ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white/90 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href="/chapters"
            className="flex items-center gap-2 font-serif text-sm text-blue-700 transition-colors hover:text-blue-900"
          >
            <BackArrowIcon />
            Chapters
          </Link>
          <h1 className="font-serif text-lg font-bold tracking-tight text-blue-900">
            Gnosis
          </h1>
          <div className="w-24" />
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        {/* Title section */}
        <div className="mb-8 text-center">
          <div className="mb-1 font-sans text-xs font-medium uppercase tracking-wider text-blue-500">
            Scenario Review
          </div>
          <h2 className="font-serif text-3xl font-bold text-blue-900">
            {scenario.title}
          </h2>
          <p className="mt-2 font-serif text-base text-blue-800/60">
            {scenario.context_description}
          </p>
        </div>

        {/* Performance and corrections */}
        <div className="space-y-6">
          <AccuracyIndicator percentage={accuracy} />

          <CorrectionsSummary
            messagesWithCorrections={messagesWithCorrections}
          />

          {vocabulary.length > 0 && (
            <VocabularySection vocabulary={vocabulary} />
          )}

          <ConversationTranscript
            messages={messages}
            messagesWithCorrections={messagesWithCorrections}
          />
        </div>

        {/* Navigation buttons */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {nextScenarioId && (
            <Link
              href={`/chapters/${chapterId}/scenarios/${nextScenarioId}`}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-serif text-base font-semibold text-white shadow-md transition-colors hover:bg-blue-800"
            >
              Continue to Next Scenario
              <ArrowRightIcon />
            </Link>
          )}
          <Link
            href={`/chapters/${chapterId}/scenarios/${scenario.id}?replay=1`}
            className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-6 py-3 font-serif text-base font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50"
          >
            <ReplayIcon />
            Replay Scenario
          </Link>
          <Link
            href="/chapters"
            className="flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-6 py-3 font-serif text-base font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50"
          >
            <BackArrowIcon />
            Back to Chapters
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-blue-200 bg-white/80 px-6 py-4 text-center">
        <p className="font-serif text-xs text-blue-800/40">
          Gnosis -- Learn Koine Greek through conversation
        </p>
      </footer>
    </div>
  );
}
