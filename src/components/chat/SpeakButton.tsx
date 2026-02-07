"use client";

/**
 * SpeakButton - A button that reads a message aloud using text-to-speech.
 * Shows a speaker icon that toggles between play, loading, and stop states.
 * Displays an animated indicator while speech is active or loading.
 * Shows a brief error message on failure.
 */

import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useEffect, useState } from "react";

interface SpeakButtonProps {
  /** The text content to speak aloud */
  text: string;
}

export default function SpeakButton({ text }: SpeakButtonProps) {
  const { isSupported, isSpeaking, isLoading, error, speak, stop } =
    useTextToSpeech();

  // Show error briefly then auto-dismiss
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => setShowError(false), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowError(false);
    }
  }, [error]);

  if (!isSupported) {
    return null;
  }

  const handleClick = () => {
    if (isLoading || isSpeaking) {
      stop();
    } else {
      speak(text);
    }
  };

  return (
    <div className="relative inline-flex flex-col items-start">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 font-sans text-xs transition-colors ${
          isLoading
            ? "cursor-wait bg-blue-50 text-blue-400"
            : isSpeaking
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
              : "text-blue-400 hover:bg-blue-50 hover:text-blue-600"
        }`}
        title={
          isLoading
            ? "Loading audio..."
            : isSpeaking
              ? "Stop speaking"
              : "Listen to this message"
        }
        aria-label={
          isLoading
            ? "Loading audio"
            : isSpeaking
              ? "Stop speaking"
              : "Listen to this message"
        }
      >
        {isLoading ? (
          <>
            <LoadingSpinner />
            <span>Loading...</span>
          </>
        ) : isSpeaking ? (
          <>
            <SpeakingIcon />
            <span>Stop</span>
          </>
        ) : (
          <>
            <SpeakerIcon />
            <span>Listen</span>
          </>
        )}
      </button>

      {/* Error toast */}
      {showError && error && (
        <div className="absolute top-full left-0 z-10 mt-1 max-w-48 rounded-md border border-red-200 bg-red-50 px-2 py-1">
          <p className="font-sans text-xs text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}

/** Loading spinner icon */
function LoadingSpinner() {
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
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/** Static speaker icon (not speaking) */
function SpeakerIcon() {
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
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

/** Animated speaker icon (currently speaking) */
function SpeakingIcon() {
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
      className="animate-pulse"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
