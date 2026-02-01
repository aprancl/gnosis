"use client";

/**
 * BrowserSupportNotice - Dismissible banner that warns users when their browser
 * does not support the Web Speech API (STT) or SpeechSynthesis (TTS).
 *
 * Renders on the scenario page so users understand why voice features may be
 * absent, and suggests switching to Chrome or Edge for full support.
 */

import { useState, useEffect } from "react";

interface SupportStatus {
  stt: boolean;
  tts: boolean;
}

function detectSpeechSupport(): SupportStatus {
  if (typeof window === "undefined") {
    return { stt: false, tts: false };
  }

  const win = window as unknown as Record<string, unknown>;
  const stt = !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  const tts = !!window.speechSynthesis;

  return { stt, tts };
}

export default function BrowserSupportNotice() {
  const [support, setSupport] = useState<SupportStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setSupport(detectSpeechSupport());
  }, []);

  // Don't render until we've checked support client-side
  if (support === null) return null;

  // Both supported or user dismissed -- hide
  if ((support.stt && support.tts) || dismissed) return null;

  const missingFeatures: string[] = [];
  if (!support.stt) missingFeatures.push("speech-to-text (voice input)");
  if (!support.tts) missingFeatures.push("text-to-speech (audio playback)");

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <InfoIcon />
          <div>
            <p className="font-serif text-sm font-medium text-amber-800">
              Limited voice support in this browser
            </p>
            <p className="mt-0.5 font-serif text-xs text-amber-700/80">
              Your browser does not support {missingFeatures.join(" or ")}.
              For full voice features, try{" "}
              <span className="font-semibold">Google Chrome</span> or{" "}
              <span className="font-semibold">Microsoft Edge</span>.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-amber-600 transition-colors hover:bg-amber-100 hover:text-amber-800"
          aria-label="Dismiss notice"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-amber-600"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function CloseIcon() {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
