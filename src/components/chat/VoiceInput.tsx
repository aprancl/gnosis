"use client";

/**
 * VoiceInput component - microphone button that uses the Web Speech API
 * to capture Greek speech and transcribe it to text.
 *
 * Shows a pulsing animation when actively listening and displays
 * the interim transcript while the user is speaking.
 */

import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

interface VoiceInputProps {
  /** Called with the final transcript when speech recognition ends */
  onTranscript: (text: string) => void;
  /** Whether input is disabled (e.g., while a message is being sent) */
  disabled?: boolean;
}

export default function VoiceInput({ onTranscript, disabled = false }: VoiceInputProps) {
  const {
    isSupported,
    isListening,
    interimTranscript,
    finalTranscript,
    error,
    toggle,
    reset,
  } = useSpeechRecognition({
    lang: "el-GR",
    continuous: true,
    onFinalTranscript: (transcript) => {
      onTranscript(transcript);
      reset();
    },
  });

  // Don't render anything if the browser doesn't support speech recognition
  if (!isSupported) {
    return null;
  }

  const currentText = finalTranscript + (interimTranscript ? ` ${interimTranscript}` : "");

  return (
    <div className="flex items-end gap-2">
      {/* Interim transcript display */}
      {isListening && currentText && (
        <div className="max-w-48 truncate rounded-lg bg-blue-50 px-3 py-2 font-serif text-sm text-blue-700 italic">
          {currentText.trim()}
        </div>
      )}

      {/* Error tooltip */}
      {error && !isListening && (
        <div className="max-w-48 rounded-lg bg-red-50 px-3 py-2 font-serif text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Microphone button */}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
          isListening
            ? "bg-red-500 text-white hover:bg-red-600"
            : "bg-blue-100 text-blue-700 hover:bg-blue-200"
        } disabled:opacity-40`}
        aria-label={isListening ? "Stop listening" : "Start voice input"}
        title={isListening ? "Stop listening" : "Speak in Greek"}
      >
        {/* Pulsing ring animation when listening */}
        {isListening && (
          <span className="absolute inset-0 animate-ping rounded-xl bg-red-400 opacity-30" />
        )}
        <MicrophoneIcon active={isListening} />
      </button>
    </div>
  );
}

function MicrophoneIcon({ active }: { active: boolean }) {
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
      className={`relative z-10 ${active ? "text-white" : ""}`}
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
