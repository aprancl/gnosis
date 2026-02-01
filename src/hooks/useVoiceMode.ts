"use client";

/**
 * useVoiceMode - Custom React hook that manages voice mode state,
 * combining STT (speech-to-text) and TTS (text-to-speech) into a
 * unified voice interaction experience.
 *
 * Voice mode states: idle, listening, processing, speaking
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";

export type VoiceModeState = "idle" | "listening" | "processing" | "speaking";

export interface UseVoiceModeOptions {
  /** Callback when a final transcript is ready to send */
  onTranscript?: (text: string) => void;
  /** Whether the chat is currently loading/processing a response */
  isProcessing?: boolean;
}

export interface UseVoiceModeReturn {
  /** Whether voice mode is active */
  isVoiceModeActive: boolean;
  /** Toggle voice mode on/off */
  toggleVoiceMode: () => void;
  /** Current voice mode state */
  voiceState: VoiceModeState;
  /** Whether STT is supported */
  sttSupported: boolean;
  /** Whether TTS is supported */
  ttsSupported: boolean;
  /** Whether voice mode is available (at least one of STT/TTS works) */
  isAvailable: boolean;
  /** Start listening for speech */
  startListening: () => void;
  /** Stop listening for speech */
  stopListening: () => void;
  /** Whether currently listening */
  isListening: boolean;
  /** Current interim transcript while speaking */
  interimTranscript: string;
  /** Current final transcript from the session */
  finalTranscript: string;
  /** STT error message, if any */
  sttError: string | null;
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Speak text aloud (for auto-playing responses) */
  speak: (text: string) => void;
  /** Stop TTS playback */
  stopSpeaking: () => void;
  /** Unavailability reason message (if voice mode cannot be used) */
  unavailableReason: string | null;
}

export function useVoiceMode(
  options: UseVoiceModeOptions = {}
): UseVoiceModeReturn {
  const { onTranscript, isProcessing = false } = options;

  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);

  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const stt = useSpeechRecognition({
    lang: "el-GR",
    continuous: true,
    onFinalTranscript: (transcript) => {
      if (onTranscriptRef.current) {
        onTranscriptRef.current(transcript);
      }
      stt.reset();
    },
  });

  const tts = useTextToSpeech();

  const sttSupported = stt.isSupported;
  const ttsSupported = tts.isSupported;
  const isAvailable = sttSupported || ttsSupported;

  // Compute unavailability reason
  let unavailableReason: string | null = null;
  if (!sttSupported && !ttsSupported) {
    unavailableReason =
      "Voice mode is not available. Your browser does not support speech recognition or text-to-speech.";
  } else if (!sttSupported) {
    unavailableReason =
      "Speech recognition is not available in your browser. You can still hear responses spoken aloud.";
  } else if (!ttsSupported) {
    unavailableReason =
      "Text-to-speech is not available in your browser. You can still use voice input.";
  }

  // Derive current voice state
  let voiceState: VoiceModeState = "idle";
  if (tts.isSpeaking) {
    voiceState = "speaking";
  } else if (isProcessing) {
    voiceState = "processing";
  } else if (stt.isListening) {
    voiceState = "listening";
  }

  const toggleVoiceMode = useCallback(() => {
    setIsVoiceModeActive((prev) => {
      if (prev) {
        // Turning off voice mode - clean up
        stt.reset();
        tts.stop();
      }
      return !prev;
    });
  }, [stt, tts]);

  const startListening = useCallback(() => {
    if (sttSupported && isVoiceModeActive) {
      // Stop TTS if speaking before starting to listen
      if (tts.isSpeaking) {
        tts.stop();
      }
      stt.start();
    }
  }, [sttSupported, isVoiceModeActive, stt, tts]);

  const stopListening = useCallback(() => {
    stt.stop();
  }, [stt]);

  return {
    isVoiceModeActive,
    toggleVoiceMode,
    voiceState,
    sttSupported,
    ttsSupported,
    isAvailable,
    startListening,
    stopListening,
    isListening: stt.isListening,
    interimTranscript: stt.interimTranscript,
    finalTranscript: stt.finalTranscript,
    sttError: stt.error,
    isSpeaking: tts.isSpeaking,
    speak: tts.speak,
    stopSpeaking: tts.stop,
    unavailableReason,
  };
}
