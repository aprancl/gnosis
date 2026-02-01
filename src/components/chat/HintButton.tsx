"use client";

/**
 * HintButton - Allows the user to request a hint about what to say next.
 * Sends a special hint-request message to the API. Limited to a maximum
 * number of hints per scenario.
 */

import { useState } from "react";

interface HintButtonProps {
  /** How many hints have been used so far */
  hintsUsed: number;
  /** Maximum number of hints allowed per scenario */
  maxHints: number;
  /** Whether the button should be disabled (e.g. during loading) */
  disabled?: boolean;
  /** Callback to send the hint request message */
  onRequestHint: () => void;
}

export default function HintButton({
  hintsUsed,
  maxHints,
  disabled = false,
  onRequestHint,
}: HintButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const remaining = maxHints - hintsUsed;
  const exhausted = remaining <= 0;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={onRequestHint}
        disabled={disabled || exhausted}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 font-serif text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Request a hint (${remaining} remaining)`}
        title={exhausted ? "No hints remaining" : `${remaining} hint${remaining === 1 ? "" : "s"} remaining`}
      >
        <LightbulbIcon />
        Hint
        <span className="rounded-full bg-amber-200/60 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-800">
          {remaining}
        </span>
      </button>

      {showTooltip && exhausted && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 font-serif text-xs text-white shadow-lg">
          No hints remaining for this scenario
        </div>
      )}
    </div>
  );
}

function LightbulbIcon() {
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
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}
