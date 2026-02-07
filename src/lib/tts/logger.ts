/**
 * Structured TTS monitoring logger.
 *
 * Logs character usage, provider attribution, latency, and cache metrics
 * for every TTS request. All logging is wrapped in try/catch so a logging
 * failure never blocks the TTS request itself.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TTSProvider =
  | "google-cloud"
  | "cache"
  | "custom-model"
  | "browser-fallback";

export interface TTSLogEntry {
  /** User who made the request */
  userId: string;
  /** Number of characters sent to the TTS provider */
  chars: number;
  /** Audio format requested */
  format: string;
  /** Which provider handled the request */
  provider: TTSProvider;
  /** Time from request start to first audio byte, in milliseconds */
  latencyMs: number;
  /** Whether the response was served from cache */
  cacheHit: boolean;
  /** Optional request identifier for correlation */
  requestId?: string;
  /** Whether this was a streaming request */
  streaming?: boolean;
  /** Sentence index for streaming requests */
  sentenceIndex?: number;
}

// ---------------------------------------------------------------------------
// Cache stats (in-memory counters for ratio calculation)
// ---------------------------------------------------------------------------

let cacheHits = 0;
let cacheMisses = 0;

export function getCacheStats(): { hits: number; misses: number; ratio: number } {
  const total = cacheHits + cacheMisses;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    ratio: total === 0 ? 0 : cacheHits / total,
  };
}

export function resetCacheStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
}

// ---------------------------------------------------------------------------
// Logging functions
// ---------------------------------------------------------------------------

/**
 * Log a TTS request with structured JSON output.
 *
 * Wrapped in try/catch -- logging failures never propagate.
 */
export function logTTSRequest(entry: TTSLogEntry): void {
  try {
    // Update cache counters
    if (entry.cacheHit) {
      cacheHits++;
    } else {
      cacheMisses++;
    }

    const logData = {
      level: "info",
      service: "tts",
      event: "tts_request",
      timestamp: new Date().toISOString(),
      userId: entry.userId,
      chars: entry.chars,
      format: entry.format,
      provider: entry.provider,
      latencyMs: entry.latencyMs,
      cacheHit: entry.cacheHit,
      ...(entry.requestId && { requestId: entry.requestId }),
      ...(entry.streaming !== undefined && { streaming: entry.streaming }),
      ...(entry.sentenceIndex !== undefined && { sentenceIndex: entry.sentenceIndex }),
    };

    console.log(JSON.stringify(logData));
  } catch {
    // Logging must never block the TTS request
  }
}

/**
 * Log a TTS error event.
 *
 * Wrapped in try/catch -- logging failures never propagate.
 */
export function logTTSError(
  userId: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  try {
    const logData = {
      level: "error",
      service: "tts",
      event: "tts_error",
      timestamp: new Date().toISOString(),
      userId,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : "Unknown",
      ...extra,
    };

    console.error(JSON.stringify(logData));
  } catch {
    // Logging must never block the TTS request
  }
}

/**
 * Log periodic cache statistics summary.
 *
 * Wrapped in try/catch -- logging failures never propagate.
 */
export function logCacheStats(): void {
  try {
    const stats = getCacheStats();
    const logData = {
      level: "info",
      service: "tts",
      event: "tts_cache_stats",
      timestamp: new Date().toISOString(),
      cacheHits: stats.hits,
      cacheMisses: stats.misses,
      cacheHitRatio: stats.ratio,
    };

    console.log(JSON.stringify(logData));
  } catch {
    // Logging must never block the TTS request
  }
}

/**
 * Create a latency timer. Call the returned function to get elapsed ms.
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
