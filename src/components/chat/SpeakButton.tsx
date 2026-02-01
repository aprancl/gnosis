"use client";

/**
 * SpeakButton - A button that reads a message aloud using text-to-speech.
 * Shows a speaker icon that toggles between play and stop states.
 * Displays an animated indicator while speech is active.
 */

import { useTextToSpeech } from "@/hooks/useTextToSpeech";

interface SpeakButtonProps {
  /** The text content to speak aloud */
  text: string;
}

export default function SpeakButton({ text }: SpeakButtonProps) {
  const { isSupported, isSpeaking, speak, stop } = useTextToSpeech();

  if (!isSupported) {
    return null;
  }

  const handleClick = () => {
    if (isSpeaking) {
      stop();
    } else {
      speak(text);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 font-sans text-xs transition-colors ${
        isSpeaking
          ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
          : "text-blue-400 hover:bg-blue-50 hover:text-blue-600"
      }`}
      title={isSpeaking ? "Stop speaking" : "Listen to this message"}
      aria-label={isSpeaking ? "Stop speaking" : "Listen to this message"}
    >
      {isSpeaking ? (
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
