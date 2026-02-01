"use client";

/**
 * ChatMessage component - displays a single message in the chat conversation.
 * User messages appear on the right with a blue background.
 * Assistant messages appear on the left with a white/parchment background.
 *
 * For assistant messages, inline corrections are highlighted with a subtle
 * underline and tooltip showing the explanation.
 */

import { useMemo, useState } from "react";
import type { ChatMessage as ChatMessageType } from "@/types/chat";
import type { Correction } from "@/types/corrections";
import { parseCorrections } from "@/lib/corrections/parser";
import SpeakButton from "./SpeakButton";

interface ChatMessageProps {
  message: ChatMessageType;
  /** Whether this message is still being streamed */
  isStreaming?: boolean;
  /** Pre-parsed corrections (from database); if absent, will parse on the fly */
  corrections?: Correction[];
}

export default function ChatMessage({
  message,
  isStreaming,
  corrections: propCorrections,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  // Parse corrections for assistant messages (use prop if available, else parse)
  const corrections = useMemo(() => {
    if (isUser || isStreaming) return [];
    if (propCorrections && propCorrections.length > 0) return propCorrections;
    if (!message.content) return [];
    const result = parseCorrections(message.content);
    return result.corrections;
  }, [isUser, isStreaming, propCorrections, message.content]);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[80%] rounded-2xl px-5 py-3 ${
          isUser
            ? "bg-blue-700 text-white"
            : "border border-blue-100 bg-white text-ink shadow-sm"
        }`}
      >
        {/* Role label */}
        <div
          className={`mb-1 font-sans text-xs font-medium uppercase tracking-wider ${
            isUser ? "text-blue-200" : "text-blue-400"
          }`}
        >
          {isUser ? "You" : "Didaskalos"}
        </div>

        {/* Message content */}
        <div
          className={`font-serif text-lg leading-relaxed whitespace-pre-wrap ${
            isUser ? "text-white" : "text-ink"
          }`}
        >
          {!isUser && corrections.length > 0 && !isStreaming ? (
            <CorrectionHighlightedText
              content={message.content}
              corrections={corrections}
            />
          ) : (
            message.content
          )}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-5 w-0.5 animate-pulse bg-blue-500" />
          )}
        </div>

        {/* Corrections summary badge */}
        {!isUser && !isStreaming && corrections.length > 0 && (
          <div className="mt-2 flex items-center gap-1 font-sans text-xs text-blue-500">
            <CorrectionIcon />
            <span>
              {corrections.length} correction{corrections.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* TTS button for completed assistant messages */}
        {!isUser && !isStreaming && message.content && (
          <SpeakButton text={message.content} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Correction highlighted text component
// ---------------------------------------------------------------------------

/**
 * Renders message content with correction annotations highlighted.
 * Parenthetical corrections are wrapped in a styled span with tooltip.
 */
function CorrectionHighlightedText({
  content,
  corrections,
}: {
  content: string;
  corrections: Correction[];
}) {
  // Build segments: plain text interspersed with correction spans.
  // We highlight the parenthetical/bracketed/asterisked annotations in the text.
  const segments = useMemo(() => {
    if (corrections.length === 0) return [{ type: "text" as const, text: content }];

    const result: Array<
      | { type: "text"; text: string }
      | { type: "correction"; text: string; correction: Correction }
    > = [];

    // Find the annotation spans in the original content
    const annotationRanges = findAnnotationRanges(content, corrections);

    if (annotationRanges.length === 0) {
      return [{ type: "text" as const, text: content }];
    }

    let lastIndex = 0;
    for (const range of annotationRanges) {
      // Add plain text before this annotation
      if (range.start > lastIndex) {
        result.push({ type: "text", text: content.slice(lastIndex, range.start) });
      }
      // Add the highlighted annotation
      result.push({
        type: "correction",
        text: content.slice(range.start, range.end),
        correction: range.correction,
      });
      lastIndex = range.end;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      result.push({ type: "text", text: content.slice(lastIndex) });
    }

    return result;
  }, [content, corrections]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <CorrectionSpan key={i} text={seg.text} correction={seg.correction} />
        )
      )}
    </>
  );
}

/**
 * Find the actual annotation ranges in the content text for each correction.
 * Corrections have a position that indicates where the annotation starts.
 */
function findAnnotationRanges(
  content: string,
  corrections: Correction[]
): Array<{ start: number; end: number; correction: Correction }> {
  const ranges: Array<{ start: number; end: number; correction: Correction }> = [];

  for (const correction of corrections) {
    const pos = correction.position;
    if (pos < 0 || pos >= content.length) continue;

    const char = content[pos];
    let end = pos;

    // Find the end of the annotation based on its delimiter
    if (char === "(") {
      const closeIdx = content.indexOf(")", pos);
      end = closeIdx >= 0 ? closeIdx + 1 : pos;
    } else if (char === "*") {
      const closeIdx = content.indexOf("*", pos + 1);
      end = closeIdx >= 0 ? closeIdx + 1 : pos;
    } else if (char === "[") {
      const closeIdx = content.indexOf("]", pos);
      end = closeIdx >= 0 ? closeIdx + 1 : pos;
    }

    if (end > pos) {
      ranges.push({ start: pos, end, correction });
    }
  }

  // Sort by start position and remove overlaps
  ranges.sort((a, b) => a.start - b.start);
  const filtered: typeof ranges = [];
  let lastEnd = 0;
  for (const range of ranges) {
    if (range.start >= lastEnd) {
      filtered.push(range);
      lastEnd = range.end;
    }
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// CorrectionSpan with tooltip
// ---------------------------------------------------------------------------

function CorrectionSpan({
  text,
  correction,
}: {
  text: string;
  correction: Correction;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const tooltipContent = buildTooltipText(correction);

  return (
    <span
      className="relative cursor-help border-b-2 border-dotted border-amber-500/60 text-amber-800 transition-colors hover:border-amber-500 hover:bg-amber-50/50"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip((prev) => !prev)}
      role="button"
      tabIndex={0}
      aria-label={`Correction: ${tooltipContent}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setShowTooltip((prev) => !prev);
      }}
    >
      {text}
      {showTooltip && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-sans text-sm leading-snug text-amber-900 shadow-lg whitespace-nowrap">
          {tooltipContent}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-amber-200" />
        </span>
      )}
    </span>
  );
}

function buildTooltipText(correction: Correction): string {
  if (correction.original && correction.corrected) {
    return `${correction.original} → ${correction.corrected}`;
  }
  if (correction.corrected && correction.explanation !== "Corrected form") {
    return correction.explanation;
  }
  if (correction.corrected) {
    return `Correct form: ${correction.corrected}`;
  }
  return correction.explanation;
}

// ---------------------------------------------------------------------------
// Small correction icon
// ---------------------------------------------------------------------------

function CorrectionIcon() {
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
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
