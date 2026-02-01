"use client";

/**
 * useSpeechRecognition - Custom React hook for browser speech-to-text input.
 * Uses the Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * Configured for Greek language (el-GR) with continuous mode support.
 */

import { useState, useRef, useCallback, useEffect } from "react";

/** SpeechRecognition type declarations for browsers that support it */
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as Record<string, unknown>;
  return (
    (win.SpeechRecognition as SpeechRecognitionConstructor | undefined) ??
    (win.webkitSpeechRecognition as SpeechRecognitionConstructor | undefined) ??
    null
  );
}

export interface UseSpeechRecognitionOptions {
  /** Language code for recognition. Defaults to "el-GR" (Modern Greek). */
  lang?: string;
  /** Whether to keep listening until explicitly stopped. Defaults to true. */
  continuous?: boolean;
  /** Callback invoked with the final transcript when speech ends or is stopped. */
  onFinalTranscript?: (transcript: string) => void;
}

export interface UseSpeechRecognitionReturn {
  /** Whether the browser supports the Web Speech API */
  isSupported: boolean;
  /** Whether recognition is currently active */
  isListening: boolean;
  /** The current interim (partial) transcript while speaking */
  interimTranscript: string;
  /** The accumulated final transcript from the current session */
  finalTranscript: string;
  /** Any error message from the recognition engine */
  error: string | null;
  /** Start listening for speech */
  start: () => void;
  /** Stop listening for speech */
  stop: () => void;
  /** Toggle listening on/off */
  toggle: () => void;
  /** Reset the transcript and error state */
  reset: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
  const {
    lang = "el-GR",
    continuous = true,
    onFinalTranscript,
  } = options;

  const [isSupported] = useState(() => getSpeechRecognitionConstructor() !== null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");
  const onFinalTranscriptRef = useRef(onFinalTranscript);

  // Keep callback ref in sync
  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onstart = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const start = useCallback(() => {
    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    // Stop any existing instance
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }

    setError(null);
    setInterimTranscript("");
    setFinalTranscript("");
    finalTranscriptRef.current = "";

    const recognition = new Constructor();
    recognition.lang = lang;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      finalTranscriptRef.current = final;
      setFinalTranscript(final);
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "aborted" and "no-speech" are not real errors
      if (event.error === "aborted" || event.error === "no-speech") {
        return;
      }
      const message = event.error === "not-allowed"
        ? "Microphone access denied. Please allow microphone permissions."
        : `Speech recognition error: ${event.error}`;
      setError(message);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const transcript = finalTranscriptRef.current.trim();
      if (transcript && onFinalTranscriptRef.current) {
        onFinalTranscriptRef.current(transcript);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setError("Failed to start speech recognition.");
      setIsListening(false);
    }
  }, [lang, continuous]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  const reset = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    setInterimTranscript("");
    setFinalTranscript("");
    finalTranscriptRef.current = "";
    setError(null);
    setIsListening(false);
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    finalTranscript,
    error,
    start,
    stop,
    toggle,
    reset,
  };
}
