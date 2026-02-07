"use client";

/**
 * useTextToSpeech - Custom React hook for text-to-speech.
 *
 * Primary path: fetches audio from the server-side `/api/tts` endpoint
 * (Google Cloud TTS with pronunciation dictionary and SSML).
 *
 * Streaming path: `speakStream` accepts an async iterable of text chunks,
 * buffers them at sentence boundaries, synthesizes via `/api/tts/stream`,
 * and plays audio chunks sequentially as they arrive.
 *
 * Fallback path: if the server request fails (network error, 502, timeout),
 * falls back to the browser Web Speech API with polytonic-to-monotonic
 * preprocessing.
 *
 * Exports: speak, speakStream, stop, pause, resume, replay, setPlaybackRate,
 *          isSpeaking, isLoading, isPaused, playbackRate, error, isSupported
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { polytonicToMonotonic } from "@/lib/tts/preprocess";
import { TextBuffer } from "@/lib/tts/text-buffer";
import { AudioQueue } from "@/lib/tts/audio-queue";

export interface UseTextToSpeechReturn {
  /** Whether TTS is available (server or browser) */
  isSupported: boolean;
  /** Whether audio is currently playing (server or browser) */
  isSpeaking: boolean;
  /** Whether a server TTS request is in-flight */
  isLoading: boolean;
  /** Whether audio is currently paused */
  isPaused: boolean;
  /** Current playback rate (default 1.0) */
  playbackRate: number;
  /** Current error message (cleared on next speak call) */
  error: string | null;
  /** Available browser speech synthesis voices (for fallback) */
  voices: SpeechSynthesisVoice[];
  /** Speak the given text aloud */
  speak: (text: string) => void;
  /**
   * Stream text chunks to TTS. Accepts an async iterable of text strings
   * (e.g., from a streaming chat response). Buffers at sentence boundaries
   * and plays audio chunks sequentially as they arrive.
   *
   * Returns a promise that resolves when all audio has finished playing.
   */
  speakStream: (chunks: AsyncIterable<string>) => Promise<void>;
  /** Stop any ongoing speech or in-flight request */
  stop: () => void;
  /** Pause current audio playback */
  pause: () => void;
  /** Resume paused audio playback */
  resume: () => void;
  /** Replay the last spoken text */
  replay: () => void;
  /** Set playback speed (applies immediately if playing) */
  setPlaybackRate: (rate: number) => void;
}

/**
 * Selects the best available Greek voice from the voice list.
 * Prefers el-GR locale, then any el-* locale, then falls back to default.
 */
function selectGreekVoice(
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const elGR = voices.find((v) => v.lang === "el-GR");
  if (elGR) return elGR;

  const elAny = voices.find((v) => v.lang.startsWith("el"));
  if (elAny) return elAny;

  return null;
}

/**
 * Parse the chunked audio stream from /api/tts/stream.
 * Each chunk is: 4-byte big-endian length + that many bytes of MP3 audio.
 * A zero-length header signals end of stream.
 */
async function* parseAudioChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<Blob> {
  let leftover = new Uint8Array(0);

  while (true) {
    if (signal?.aborted) return;

    const { done, value } = await reader.read();
    if (done && leftover.length === 0) return;

    // Concatenate leftover with new data
    let data: Uint8Array;
    if (value) {
      data = new Uint8Array(leftover.length + value.length);
      data.set(leftover);
      data.set(value, leftover.length);
    } else {
      data = leftover;
    }

    let offset = 0;

    while (offset + 4 <= data.length) {
      const view = new DataView(data.buffer, data.byteOffset + offset, 4);
      const chunkLength = view.getUint32(0, false);

      // End-of-stream marker
      if (chunkLength === 0) {
        return;
      }

      // Check if we have the full chunk
      if (offset + 4 + chunkLength > data.length) {
        break; // Need more data
      }

      // Extract audio chunk
      const audioData = data.slice(offset + 4, offset + 4 + chunkLength);
      yield new Blob([audioData], { type: "audio/mpeg" });
      offset += 4 + chunkLength;
    }

    // Save leftover for next iteration
    leftover = data.slice(offset);

    if (done) return;
  }
}

export function useTextToSpeech(): UseTextToSpeechReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastTextRef = useRef<string | null>(null);
  const playbackRateRef = useRef(1.0);
  const audioQueueRef = useRef<AudioQueue | null>(null);

  // Check for browser speech support and load voices
  useEffect(() => {
    // Server TTS is always "supported" (we assume the API exists),
    // but we still check browser TTS for fallback capability.
    setIsSupported(true);

    if (typeof window === "undefined" || !window.speechSynthesis) {
      return;
    }

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Abort any in-flight request
      abortControllerRef.current?.abort();
      // Stop audio playback
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }
      // Stop audio queue
      if (audioQueueRef.current) {
        audioQueueRef.current.stop();
        audioQueueRef.current = null;
      }
      // Revoke object URL
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      // Cancel browser TTS
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  /**
   * Stop all TTS: abort in-flight requests, stop audio playback,
   * cancel browser speech synthesis, stop audio queue.
   */
  const stop = useCallback(() => {
    // Abort in-flight fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop audio element
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;
    }

    // Stop audio queue
    if (audioQueueRef.current) {
      audioQueueRef.current.stop();
      audioQueueRef.current = null;
    }

    // Revoke object URL
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    // Cancel browser speech synthesis
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    utteranceRef.current = null;
    setIsSpeaking(false);
    setIsLoading(false);
    setIsPaused(false);
  }, []);

  /**
   * Pause current audio playback.
   */
  const pause = useCallback(() => {
    if (audioElementRef.current && !audioElementRef.current.paused) {
      audioElementRef.current.pause();
      setIsPaused(true);
      setIsSpeaking(false);
    } else if (
      typeof window !== "undefined" &&
      window.speechSynthesis &&
      window.speechSynthesis.speaking
    ) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsSpeaking(false);
    }
  }, []);

  /**
   * Resume paused audio playback.
   */
  const resume = useCallback(() => {
    if (audioElementRef.current && audioElementRef.current.paused) {
      audioElementRef.current.play().catch(() => {
        // play() rejection - ignore
      });
      setIsPaused(false);
      setIsSpeaking(true);
    } else if (
      typeof window !== "undefined" &&
      window.speechSynthesis &&
      window.speechSynthesis.paused
    ) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsSpeaking(true);
    }
  }, []);

  /**
   * Set the playback rate. Applies immediately if audio is currently playing.
   */
  const setPlaybackRate = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    setPlaybackRateState(rate);

    // Apply immediately to active audio element
    if (audioElementRef.current) {
      audioElementRef.current.playbackRate = rate;
    }

    // Apply to browser speech synthesis utterance
    if (utteranceRef.current) {
      utteranceRef.current.rate = rate * 0.85; // Scale relative to base rate
    }
  }, []);

  /**
   * Fallback: speak using the browser Web Speech API with preprocessing.
   */
  const speakWithBrowserTTS = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();

      let processedText: string;
      try {
        processedText = polytonicToMonotonic(text);
      } catch {
        processedText = text;
      }

      const utterance = new SpeechSynthesisUtterance(processedText);
      utteranceRef.current = utterance;

      const greekVoice = selectGreekVoice(voices);
      if (greekVoice) {
        utterance.voice = greekVoice;
        utterance.lang = greekVoice.lang;
      } else {
        utterance.lang = "el-GR";
      }

      utterance.rate = 0.85 * playbackRateRef.current;
      utterance.pitch = 0.95;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
      };

      window.speechSynthesis.speak(utterance);
    },
    [voices]
  );

  /**
   * Primary speak function:
   * 1. Fetch audio from /api/tts
   * 2. Play via <audio> element
   * 3. On failure, fall back to browser TTS
   */
  const speak = useCallback(
    (text: string) => {
      // Cancel any previous request/playback
      stop();
      setError(null);
      lastTextRef.current = text;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsLoading(true);

      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      })
        .then(async (response) => {
          // Check if aborted during fetch
          if (controller.signal.aborted) return;

          if (response.status === 429) {
            // Rate limit - show message to user, do NOT fall back
            const data = await response.json().catch(() => null);
            const msg =
              data?.error || "Rate limit exceeded. Please try again later.";
            setError(msg);
            setIsLoading(false);
            return;
          }

          if (!response.ok) {
            // Server error (502, 500, etc.) - fall back to browser TTS
            throw new Error(`Server error: ${response.status}`);
          }

          const blob = await response.blob();
          if (controller.signal.aborted) return;

          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;

          const audio = new Audio(url);
          audio.playbackRate = playbackRateRef.current;
          audioElementRef.current = audio;

          audio.onplay = () => {
            setIsSpeaking(true);
            setIsLoading(false);
            setIsPaused(false);
          };

          audio.onended = () => {
            setIsSpeaking(false);
            setIsPaused(false);
            audioElementRef.current = null;
            if (objectUrlRef.current) {
              URL.revokeObjectURL(objectUrlRef.current);
              objectUrlRef.current = null;
            }
          };

          audio.onerror = () => {
            // Audio playback error - fall back to browser TTS
            setIsSpeaking(false);
            setIsLoading(false);
            setIsPaused(false);
            audioElementRef.current = null;
            if (objectUrlRef.current) {
              URL.revokeObjectURL(objectUrlRef.current);
              objectUrlRef.current = null;
            }
            speakWithBrowserTTS(text);
          };

          audio.play().catch(() => {
            // play() promise rejection - fall back to browser TTS
            setIsLoading(false);
            if (objectUrlRef.current) {
              URL.revokeObjectURL(objectUrlRef.current);
              objectUrlRef.current = null;
            }
            speakWithBrowserTTS(text);
          });
        })
        .catch((err: unknown) => {
          // Network error, abort, or other fetch failure
          if (controller.signal.aborted) {
            setIsLoading(false);
            return;
          }

          console.warn(
            "[useTextToSpeech] Server TTS failed, falling back to browser TTS:",
            err instanceof Error ? err.message : err
          );

          setIsLoading(false);
          speakWithBrowserTTS(text);
        });
    },
    [stop, speakWithBrowserTTS]
  );

  /**
   * Streaming speak function:
   * Accepts an async iterable of text chunks, buffers at sentence boundaries,
   * sends accumulated text to /api/tts/stream, and plays audio chunks as they arrive.
   *
   * This enables TTS to begin as soon as the first complete sentence arrives
   * from the LLM streaming response, reducing perceived latency.
   */
  const speakStream = useCallback(
    async (chunks: AsyncIterable<string>): Promise<void> => {
      // Cancel any previous request/playback
      stop();
      setError(null);
      setIsLoading(true);

      const textBuffer = new TextBuffer();
      let fullText = "";

      // Collect all text from the async iterable
      try {
        for await (const chunk of chunks) {
          fullText += chunk;
          // Buffer is used to track sentence boundaries, but we send
          // the full text to the streaming endpoint for server-side splitting
          textBuffer.add(chunk);
        }

        // Flush remaining
        textBuffer.flush();
      } catch {
        // If the text stream fails, use whatever we have
      }

      // If no text was collected, bail out
      const textToSynthesize = fullText.trim();
      if (!textToSynthesize) {
        setIsLoading(false);
        return;
      }

      lastTextRef.current = textToSynthesize;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch("/api/tts/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textToSynthesize }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          setIsLoading(false);
          return;
        }

        if (response.status === 429) {
          const data = await response.json().catch(() => null);
          const msg =
            data?.error || "Rate limit exceeded. Please try again later.";
          setError(msg);
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        // Set up audio queue for sequential playback
        const audioQueue = new AudioQueue({
          onStateChange: (state) => {
            if (state === "playing") {
              setIsSpeaking(true);
              setIsLoading(false);
            } else if (state === "idle") {
              setIsSpeaking(false);
            }
          },
          onError: (errMsg) => {
            console.warn("[useTextToSpeech] Audio queue error:", errMsg);
          },
          onComplete: () => {
            setIsSpeaking(false);
            audioQueueRef.current = null;
          },
        });
        audioQueueRef.current = audioQueue;

        // Parse audio chunks from the streaming response
        const reader = response.body.getReader();

        for await (const audioBlob of parseAudioChunks(reader, controller.signal)) {
          if (controller.signal.aborted) break;
          audioQueue.enqueue(audioBlob);
        }

        audioQueue.markComplete();
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          setIsLoading(false);
          return;
        }

        console.warn(
          "[useTextToSpeech] Streaming TTS failed, falling back to non-streaming:",
          err instanceof Error ? err.message : err
        );

        // Fall back to full speak
        setIsLoading(false);
        speak(textToSynthesize);
      }
    },
    [stop, speak]
  );

  /**
   * Replay the last spoken text.
   */
  const replay = useCallback(() => {
    if (lastTextRef.current) {
      speak(lastTextRef.current);
    }
  }, [speak]);

  return {
    isSupported,
    isSpeaking,
    isLoading,
    isPaused,
    playbackRate,
    error,
    voices,
    speak,
    speakStream,
    stop,
    pause,
    resume,
    replay,
    setPlaybackRate,
  };
}
