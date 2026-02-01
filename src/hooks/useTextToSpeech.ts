"use client";

/**
 * useTextToSpeech - Custom React hook for browser-based text-to-speech.
 *
 * Uses the Web SpeechSynthesis API with a preference for Greek (el-GR) voices.
 * Falls back gracefully when TTS is not available in the browser.
 *
 * NOTE: Browser TTS uses Modern Greek (el-GR) voices as the closest available
 * approximation to Reconstructed Koine (Buth "Living Koine") pronunciation.
 * Native Koine pronunciation is not supported by any browser TTS engine, so
 * Modern Greek voices serve as a reasonable stand-in for hearing Greek words
 * spoken aloud. The speech rate is slowed and pitch lowered slightly to aid
 * comprehension for language learners.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface UseTextToSpeechReturn {
  /** Whether the browser supports the SpeechSynthesis API */
  isSupported: boolean;
  /** Whether speech is currently being spoken */
  isSpeaking: boolean;
  /** Available speech synthesis voices */
  voices: SpeechSynthesisVoice[];
  /** Speak the given text aloud, preferring a Greek voice */
  speak: (text: string) => void;
  /** Stop any ongoing speech */
  stop: () => void;
}

/**
 * Selects the best available Greek voice from the voice list.
 * Prefers el-GR locale, then any el-* locale, then falls back to default.
 */
function selectGreekVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  // Prefer exact el-GR match
  const elGR = voices.find((v) => v.lang === "el-GR");
  if (elGR) return elGR;

  // Any Greek locale (e.g. el, el-*)
  const elAny = voices.find((v) => v.lang.startsWith("el"));
  if (elAny) return elAny;

  return null;
}

export function useTextToSpeech(): UseTextToSpeechReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check for browser support and load voices
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
    };

    // Voices may be loaded asynchronously
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    utteranceRef.current = null;
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      // Stop any currently playing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;

      // Select Greek voice if available
      const greekVoice = selectGreekVoice(voices);
      if (greekVoice) {
        utterance.voice = greekVoice;
        utterance.lang = greekVoice.lang;
      } else {
        // Hint the language even without a matching voice
        utterance.lang = "el-GR";
      }

      // Slower rate for language learning clarity; slightly lower pitch
      // for a more natural, measured Greek tone
      utterance.rate = 0.85;
      utterance.pitch = 0.95;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      window.speechSynthesis.speak(utterance);
    },
    [voices]
  );

  return { isSupported, isSpeaking, voices, speak, stop };
}
