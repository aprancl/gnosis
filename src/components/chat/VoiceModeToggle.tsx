"use client";

/**
 * VoiceModeToggle - A toggle button to switch between text and voice mode.
 * Shows a microphone/keyboard icon and indicates the current mode.
 * Displays a notification when voice APIs are partially or fully unavailable.
 */

import type { VoiceModeState } from "@/hooks/useVoiceMode";

interface VoiceModeToggleProps {
  /** Whether voice mode is currently active */
  isActive: boolean;
  /** Toggle voice mode on/off */
  onToggle: () => void;
  /** Whether voice mode is available at all */
  isAvailable: boolean;
  /** Current voice state for visual indicator */
  voiceState: VoiceModeState;
  /** Reason voice mode is unavailable or partially unavailable */
  unavailableReason: string | null;
}

export default function VoiceModeToggle({
  isActive,
  onToggle,
  isAvailable,
  voiceState,
  unavailableReason,
}: VoiceModeToggleProps) {
  if (!isAvailable) {
    return null;
  }

  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-2 rounded-xl px-3 py-2 font-serif text-sm transition-all ${
          isActive
            ? "bg-blue-700 text-white shadow-md hover:bg-blue-800"
            : "border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
        }`}
        aria-label={isActive ? "Switch to text mode" : "Switch to voice mode"}
        title={isActive ? "Switch to text mode" : "Switch to voice mode"}
      >
        {isActive ? <KeyboardIcon /> : <VoiceModeIcon />}
        <span>{isActive ? "Text Mode" : "Voice Mode"}</span>
        {isActive && <VoiceStateIndicator state={voiceState} />}
      </button>

      {/* Partial unavailability notification */}
      {unavailableReason && isActive && (
        <div className="absolute top-full right-0 z-10 mt-2 w-64 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 shadow-lg">
          <p className="font-serif text-xs text-amber-700">{unavailableReason}</p>
        </div>
      )}
    </div>
  );
}

/** Visual indicator dot for current voice state */
function VoiceStateIndicator({ state }: { state: VoiceModeState }) {
  if (state === "idle") return null;

  const stateStyles: Record<string, string> = {
    listening: "bg-red-400 animate-pulse",
    processing: "bg-amber-400 animate-pulse",
    speaking: "bg-green-400 animate-pulse",
  };

  return (
    <span
      className={`ml-1 inline-block h-2 w-2 rounded-full ${stateStyles[state] ?? ""}`}
      aria-label={`Voice state: ${state}`}
    />
  );
}

function VoiceModeIcon() {
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
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function KeyboardIcon() {
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
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <path d="M6 8h.001" />
      <path d="M10 8h.001" />
      <path d="M14 8h.001" />
      <path d="M18 8h.001" />
      <path d="M8 12h.001" />
      <path d="M12 12h.001" />
      <path d="M16 12h.001" />
      <path d="M7 16h10" />
    </svg>
  );
}
