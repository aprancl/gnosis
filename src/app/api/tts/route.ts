/** Force dynamic rendering — TTS requests cannot be cached */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/server/auth";
import {
  synthesize,
  TTSRateLimitError,
  TTSTimeoutError,
  TTSApiError,
  TTSError,
  type AudioEncoding,
} from "@/lib/tts/google-cloud";
import { loadDictionary } from "@/lib/tts/pronunciation-dict";
import { generateKEPSSML } from "@/lib/tts/kep-phonemizer";
import { logTTSRequest, logTTSError, startTimer } from "@/lib/tts/logger";
import {
  generateCacheKey,
  getCachedAudio,
  setCachedAudio,
  isCacheEnabled,
} from "@/lib/tts/cache";

// ---------------------------------------------------------------------------
// Rate limiting (in-memory sliding window)
// ---------------------------------------------------------------------------

export const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

/** Map of userId -> array of request timestamps */
export const rateLimitStore = new Map<string, number[]>();

/**
 * Check if a user has exceeded the rate limit.
 * Returns the number of seconds until the next request is allowed, or 0 if OK.
 */
export function checkRateLimit(userId: string): number {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = rateLimitStore.get(userId);
  if (!timestamps) {
    timestamps = [];
    rateLimitStore.set(userId, timestamps);
  }

  // Remove timestamps outside the window
  const filtered = timestamps.filter((t) => t > windowStart);
  rateLimitStore.set(userId, filtered);

  if (filtered.length >= RATE_LIMIT_MAX_REQUESTS) {
    // Calculate retry-after: time until the oldest request in the window expires
    const oldestInWindow = filtered[0];
    const retryAfterMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now;
    return Math.ceil(retryAfterMs / 1000);
  }

  // Record this request
  filtered.push(now);
  return 0;
}

// Clean up stale entries every 5 minutes
const cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [userId, timestamps] of rateLimitStore.entries()) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      rateLimitStore.delete(userId);
    } else {
      rateLimitStore.set(userId, filtered);
    }
  }
}, 5 * 60_000);
// Don't prevent process exit
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

interface TTSRequest {
  text: string;
  format?: "mp3" | "ogg";
}

export function validateRequest(
  body: unknown
): { valid: true; data: TTSRequest } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.text !== "string") {
    return { valid: false, error: "Missing required field: text (string)" };
  }

  if (obj.text.trim() === "") {
    return { valid: false, error: "Text must not be empty" };
  }

  if (obj.format !== undefined) {
    if (obj.format !== "mp3" && obj.format !== "ogg") {
      return {
        valid: false,
        error: 'Invalid format. Must be "mp3" or "ogg"',
      };
    }
  }

  return {
    valid: true,
    data: {
      text: obj.text as string,
      format: (obj.format as "mp3" | "ogg") ?? "mp3",
    },
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // 2. Rate limiting
    const retryAfter = checkRateLimit(user.id);
    if (retryAfter > 0) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMIT" },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }

    // 3. Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const validation = validateRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error, code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const { text, format } = validation.data;

    // 4. Map format to audio encoding
    const audioEncoding: AudioEncoding = format === "ogg" ? "OGG_OPUS" : "MP3";
    const contentType = format === "ogg" ? "audio/ogg" : "audio/mpeg";

    // 5. Check audio cache before synthesizing
    const cacheFormat = format ?? "mp3";
    const voice = "el-GR-Wavenet-A";
    const dictVersion = "v1"; // bump when pronunciation-dict.json changes
    const cacheKey = generateCacheKey(text, voice, dictVersion);

    if (isCacheEnabled()) {
      try {
        const cached = await getCachedAudio(cacheKey, cacheFormat);
        if (cached) {
          console.log(`[api/tts] cache=HIT key=${cacheKey}`);
          logTTSRequest({
            userId: user.id,
            chars: text.length,
            format: cacheFormat,
            provider: "google-cloud",
            latencyMs: 0,
            cacheHit: true,
            streaming: false,
          });
          return new Response(cached, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Content-Length": String(cached.length),
              "Cache-Control": "no-cache",
            },
          });
        }
        console.log(`[api/tts] cache=MISS key=${cacheKey}`);
      } catch {
        // Cache errors must never block TTS
        console.warn("[api/tts] Cache lookup failed, proceeding without cache");
      }
    }

    // 6. Load pronunciation dictionary and generate KEP SSML
    //    The KEP phonemizer wraps ALL Greek words in <phoneme> tags
    //    with rules-based Koine Era Pronunciation IPA. The dictionary
    //    serves as an override layer for irregular words.
    let ssmlText: string;
    try {
      const dict = loadDictionary();
      ssmlText = generateKEPSSML(text, dict);
    } catch {
      // If dictionary fails to load, still use the phonemizer without overrides
      ssmlText = generateKEPSSML(text);
    }

    // 7. Synthesize audio
    const elapsed = startTimer();
    const result = await synthesize({
      text: ssmlText,
      ssml: true,
      audioEncoding,
    });
    const latencyMs = elapsed();

    // 8. Log character usage, latency, and provider
    logTTSRequest({
      userId: user.id,
      chars: result.characterCount,
      format: cacheFormat,
      provider: "google-cloud",
      latencyMs,
      cacheHit: false,
      streaming: false,
    });

    // 9. Store result in cache (non-blocking — don't await)
    if (isCacheEnabled()) {
      setCachedAudio(cacheKey, result.audioContent, {
        format: cacheFormat,
        textLength: text.length,
        provider: voice,
      }).catch((err) => {
        console.warn(
          "[api/tts] Cache store failed:",
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    // 10. Return audio response
    return new Response(result.audioContent, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(result.audioContent.length),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[api/tts] Error:", error);
    logTTSError("unknown", error, { endpoint: "/api/tts" });

    if (error instanceof TTSRateLimitError) {
      return NextResponse.json(
        { error: "TTS provider rate limit exceeded", code: "RATE_LIMIT" },
        { status: 429 }
      );
    }

    if (error instanceof TTSTimeoutError) {
      return NextResponse.json(
        { error: "TTS synthesis timed out", code: "TIMEOUT" },
        { status: 502 }
      );
    }

    if (error instanceof TTSApiError) {
      return NextResponse.json(
        { error: `TTS synthesis failed: ${error.message}`, code: "TTS_ERROR" },
        { status: 502 }
      );
    }

    if (error instanceof TTSError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
