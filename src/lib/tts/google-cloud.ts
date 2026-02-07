/**
 * Google Cloud Text-to-Speech client wrapper.
 *
 * Server-side module that calls the Google Cloud TTS REST API directly
 * (no SDK dependency). Supports WaveNet and Chirp 3 HD voices for el-GR,
 * plain text and SSML input, polytonic preprocessing, phoneme tag injection,
 * and automatic text splitting for inputs exceeding the 5,000-char API limit.
 */

import { polytonicToMonotonic } from "./preprocess";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported audio encoding formats. */
export type AudioEncoding = "MP3" | "OGG_OPUS";

/** Supported voice models. */
export type VoiceModel =
  | "el-GR-Wavenet-A"
  | "el-GR-Chirp3-HD-Achernar"
  | "el-GR-Chirp3-HD-Leda"
  | "el-GR-Chirp3-HD-Orus"
  | "el-GR-Chirp3-HD-Zephyr";

/** A single pronunciation override for SSML phoneme injection. */
export interface PhonemeOverride {
  /** The word to match (case-sensitive). */
  word: string;
  /** IPA pronunciation string. */
  ipa: string;
}

/** Options for a TTS synthesis request. */
export interface SynthesizeOptions {
  /** Text to synthesize (plain text or SSML). */
  text: string;
  /** If true, `text` is already valid SSML (wrapped in <speak> tags). */
  ssml?: boolean;
  /** Voice model name. Defaults to "el-GR-Wavenet-A". */
  voice?: VoiceModel;
  /** Audio encoding. Defaults to "MP3". */
  audioEncoding?: AudioEncoding;
  /** Speaking rate (0.25 to 4.0). Defaults to 1.0. */
  speakingRate?: number;
  /** Pronunciation overrides injected as SSML <phoneme> tags. */
  phonemeOverrides?: PhonemeOverride[];
  /** Request timeout in milliseconds. Defaults to 30_000. */
  timeoutMs?: number;
}

/** Result of a synthesis request. */
export interface SynthesizeResult {
  /** Base64-decoded audio content. */
  audioContent: Buffer;
  /** Number of characters sent to the API (for billing tracking). */
  characterCount: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Base class for TTS-related errors. */
export class TTSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "TTSError";
  }
}

/** Thrown when the API key is missing. */
export class TTSConfigError extends TTSError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "TTSConfigError";
  }
}

/** Thrown when the API returns a rate-limit or quota error. */
export class TTSRateLimitError extends TTSError {
  constructor(message: string) {
    super(message, "RATE_LIMIT");
    this.name = "TTSRateLimitError";
  }
}

/** Thrown when the API returns any other non-OK response. */
export class TTSApiError extends TTSError {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message, "API_ERROR");
    this.name = "TTSApiError";
  }
}

/** Thrown when the request times out. */
export class TTSTimeoutError extends TTSError {
  constructor(message: string) {
    super(message, "TIMEOUT");
    this.name = "TTSTimeoutError";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TTS_ENDPOINT =
  "https://texttospeech.googleapis.com/v1/text:synthesize";

/** Google Cloud TTS character limit per request. */
const MAX_CHARS_PER_REQUEST = 5_000;

const DEFAULT_VOICE: VoiceModel = "el-GR-Wavenet-A";
const DEFAULT_ENCODING: AudioEncoding = "MP3";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_SPEAKING_RATE = 1.0;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return the API key, throwing a clear error if it is not set.
 */
export function getApiKey(): string {
  const key = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!key) {
    throw new TTSConfigError(
      "Missing required environment variable: GOOGLE_CLOUD_TTS_API_KEY. " +
        "Set this variable to your Google Cloud Text-to-Speech API key.",
    );
  }
  return key;
}

/**
 * Split text at sentence boundaries so that each chunk is within the
 * character limit. Sentences are detected by `.`, `!`, `?`, or `;`
 * followed by whitespace or end-of-string.
 *
 * If a single sentence exceeds the limit it is included as-is (the API
 * will handle or reject it).
 */
export function splitTextAtSentenceBoundaries(
  text: string,
  maxChars: number = MAX_CHARS_PER_REQUEST,
): string[] {
  if (text.length <= maxChars) return [text];

  // Split into sentences, keeping the delimiter attached
  const sentences = text.match(/[^.!?;]*[.!?;]+[\s]*/g) || [];

  // Handle trailing text that doesn't end with punctuation
  const joined = sentences.join("");
  if (joined.length < text.length) {
    sentences.push(text.slice(joined.length));
  }

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      chunks.push(current.trimEnd());
      current = "";
    }
    current += sentence;
  }

  if (current.length > 0) {
    chunks.push(current.trimEnd());
  }

  return chunks;
}

/**
 * Inject `<phoneme>` tags around matching words in the given text.
 * Only replaces whole-word matches.
 */
export function injectPhonemes(
  text: string,
  overrides: PhonemeOverride[],
): string {
  let result = text;
  for (const { word, ipa } of overrides) {
    // Escape regex special characters in the word
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "g");
    result = result.replace(
      re,
      `<phoneme alphabet="ipa" ph="${ipa}">${word}</phoneme>`,
    );
  }
  return result;
}

/**
 * Wrap text in a `<speak>` SSML document. Applies polytonic preprocessing
 * and optional phoneme overrides.
 */
export function buildSSML(
  text: string,
  phonemeOverrides?: PhonemeOverride[],
): string {
  // Preprocess: polytonic -> monotonic
  let processed = polytonicToMonotonic(text);

  // Inject phoneme overrides
  if (phonemeOverrides && phonemeOverrides.length > 0) {
    processed = injectPhonemes(processed, phonemeOverrides);
  }

  return `<speak>${processed}</speak>`;
}

/**
 * Log character usage for cost monitoring.
 */
function logCharacterUsage(charCount: number, voice: string): void {
  console.log(
    `[TTS] Synthesized ${charCount} characters with voice ${voice}`,
  );
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Synthesize speech from text using the Google Cloud TTS REST API.
 *
 * Handles polytonic preprocessing, SSML generation, phoneme injection,
 * text splitting for long inputs, and character usage logging.
 *
 * @param options - Synthesis configuration.
 * @returns Audio content and character count.
 * @throws {TTSConfigError} If GOOGLE_CLOUD_TTS_API_KEY is not set.
 * @throws {TTSRateLimitError} If the API returns 429.
 * @throws {TTSApiError} If the API returns any other error.
 * @throws {TTSTimeoutError} If the request exceeds the configured timeout.
 */
export async function synthesize(
  options: SynthesizeOptions,
): Promise<SynthesizeResult> {
  const {
    text,
    ssml = false,
    voice = DEFAULT_VOICE,
    audioEncoding = DEFAULT_ENCODING,
    speakingRate = DEFAULT_SPEAKING_RATE,
    phonemeOverrides,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  // Empty text: return no audio (not an error)
  if (!text || text.trim() === "") {
    return { audioContent: Buffer.alloc(0), characterCount: 0 };
  }

  const apiKey = getApiKey();

  // Build input content — either pass through SSML or generate it
  let inputContent: string;
  if (ssml) {
    // If already SSML, apply polytonic preprocessing to text portions only.
    // We trust the caller provided valid SSML. Apply preprocessing to the
    // text content inside the SSML by replacing non-tag portions.
    inputContent = preprocessSSML(text, phonemeOverrides);
  } else {
    inputContent = buildSSML(text, phonemeOverrides);
  }

  // Split if necessary
  const chunks = splitTextAtSentenceBoundaries(
    inputContent,
    MAX_CHARS_PER_REQUEST,
  );

  const audioBuffers: Buffer[] = [];
  let totalChars = 0;

  for (const chunk of chunks) {
    // Ensure chunk is wrapped in <speak> tags if not already
    const ssmlInput = chunk.startsWith("<speak>") ? chunk : `<speak>${chunk}</speak>`;
    const charCount = ssmlInput.length;
    totalChars += charCount;

    const body = {
      input: { ssml: ssmlInput },
      voice: {
        languageCode: "el-GR",
        name: voice,
      },
      audioConfig: {
        audioEncoding,
        speakingRate,
      },
    };

    const url = `${TTS_ENDPOINT}?key=${apiKey}`;

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TTSTimeoutError(
          `Google Cloud TTS request timed out after ${timeoutMs}ms`,
        );
      }
      // Also handle AbortError from node-fetch style errors
      if (err instanceof Error && err.name === "AbortError") {
        throw new TTSTimeoutError(
          `Google Cloud TTS request timed out after ${timeoutMs}ms`,
        );
      }
      throw new TTSApiError(
        `Network error calling Google Cloud TTS: ${err instanceof Error ? err.message : String(err)}`,
        0,
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");

      if (response.status === 429) {
        throw new TTSRateLimitError(
          `Google Cloud TTS rate limit exceeded: ${errorBody}`,
        );
      }

      throw new TTSApiError(
        `Google Cloud TTS API error (${response.status}): ${errorBody}`,
        response.status,
      );
    }

    const data = (await response.json()) as { audioContent?: string };

    if (!data.audioContent) {
      throw new TTSApiError(
        "Google Cloud TTS response missing audioContent",
        response.status,
      );
    }

    audioBuffers.push(Buffer.from(data.audioContent, "base64"));
  }

  // Log usage
  logCharacterUsage(totalChars, voice);

  // Concatenate audio buffers
  const audioContent = Buffer.concat(audioBuffers);

  return { audioContent, characterCount: totalChars };
}

/**
 * Apply polytonic preprocessing to text content within existing SSML,
 * while preserving XML tags.
 */
function preprocessSSML(
  ssml: string,
  phonemeOverrides?: PhonemeOverride[],
): string {
  // Process text nodes (anything not inside < >)
  let result = ssml.replace(/(?<=>)([^<]+)(?=<)/g, (_match, textContent: string) => {
    let processed = polytonicToMonotonic(textContent);
    if (phonemeOverrides && phonemeOverrides.length > 0) {
      processed = injectPhonemes(processed, phonemeOverrides);
    }
    return processed;
  });

  // Also handle text at the very start (before first tag) and end (after last tag)
  result = result.replace(/^([^<]+)/, (_match, textContent: string) => {
    let processed = polytonicToMonotonic(textContent);
    if (phonemeOverrides && phonemeOverrides.length > 0) {
      processed = injectPhonemes(processed, phonemeOverrides);
    }
    return processed;
  });

  result = result.replace(/([^>]+)$/, (_match, textContent: string) => {
    if (textContent.includes(">")) return textContent;
    let processed = polytonicToMonotonic(textContent);
    if (phonemeOverrides && phonemeOverrides.length > 0) {
      processed = injectPhonemes(processed, phonemeOverrides);
    }
    return processed;
  });

  return result;
}
