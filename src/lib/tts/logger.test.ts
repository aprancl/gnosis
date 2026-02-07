import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  logTTSRequest,
  logTTSError,
  logCacheStats,
  getCacheStats,
  resetCacheStats,
  startTimer,
  type TTSLogEntry,
} from "./logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<TTSLogEntry>): TTSLogEntry {
  return {
    userId: "user-123",
    chars: 42,
    format: "mp3",
    provider: "google-cloud",
    latencyMs: 150,
    cacheHit: false,
    ...overrides,
  };
}

/** Parse the last console.log call's first argument as JSON */
function lastLogJson(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const calls = spy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return JSON.parse(calls[calls.length - 1][0] as string);
}

/** Parse the last console.error call's first argument as JSON */
function lastErrorJson(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const calls = spy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return JSON.parse(calls[calls.length - 1][0] as string);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("logTTSRequest", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    resetCacheStats();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs valid JSON to console.log", () => {
    logTTSRequest(makeEntry());
    expect(logSpy).toHaveBeenCalledTimes(1);
    // Should not throw when parsing
    const data = lastLogJson(logSpy);
    expect(data).toBeDefined();
  });

  it("includes required fields with correct values", () => {
    logTTSRequest(makeEntry({ userId: "u-1", chars: 100, format: "ogg" }));
    const data = lastLogJson(logSpy);
    expect(data.userId).toBe("u-1");
    expect(data.chars).toBe(100);
    expect(data.format).toBe("ogg");
    expect(data.provider).toBe("google-cloud");
    expect(data.latencyMs).toBe(150);
    expect(data.cacheHit).toBe(false);
  });

  it("includes timestamp in ISO format", () => {
    logTTSRequest(makeEntry());
    const data = lastLogJson(logSpy);
    expect(data.timestamp).toBeDefined();
    // Validate ISO 8601 format
    expect(new Date(data.timestamp as string).toISOString()).toBe(data.timestamp);
  });

  it("includes service and event metadata", () => {
    logTTSRequest(makeEntry());
    const data = lastLogJson(logSpy);
    expect(data.level).toBe("info");
    expect(data.service).toBe("tts");
    expect(data.event).toBe("tts_request");
  });

  it("includes provider attribution", () => {
    logTTSRequest(makeEntry({ provider: "browser-fallback" }));
    const data = lastLogJson(logSpy);
    expect(data.provider).toBe("browser-fallback");
  });

  it("includes latency in milliseconds", () => {
    logTTSRequest(makeEntry({ latencyMs: 320 }));
    const data = lastLogJson(logSpy);
    expect(data.latencyMs).toBe(320);
  });

  it("includes cacheHit flag", () => {
    logTTSRequest(makeEntry({ cacheHit: true }));
    const data = lastLogJson(logSpy);
    expect(data.cacheHit).toBe(true);
  });

  it("includes optional streaming fields when provided", () => {
    logTTSRequest(makeEntry({ streaming: true, sentenceIndex: 2 }));
    const data = lastLogJson(logSpy);
    expect(data.streaming).toBe(true);
    expect(data.sentenceIndex).toBe(2);
  });

  it("omits optional fields when not provided", () => {
    logTTSRequest(makeEntry());
    const data = lastLogJson(logSpy);
    expect(data).not.toHaveProperty("requestId");
    expect(data).not.toHaveProperty("sentenceIndex");
  });

  it("never throws even if console.log throws", () => {
    logSpy.mockImplementation(() => {
      throw new Error("logging broke");
    });
    // Should not throw
    expect(() => logTTSRequest(makeEntry())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// logTTSError
// ---------------------------------------------------------------------------

describe("logTTSError", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs valid JSON to console.error", () => {
    logTTSError("user-1", new Error("fail"));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const data = lastErrorJson(errorSpy);
    expect(data.level).toBe("error");
    expect(data.event).toBe("tts_error");
  });

  it("includes error message and type", () => {
    logTTSError("user-1", new Error("timeout occurred"));
    const data = lastErrorJson(errorSpy);
    expect(data.error).toBe("timeout occurred");
    expect(data.errorType).toBe("Error");
    expect(data.userId).toBe("user-1");
  });

  it("handles non-Error objects", () => {
    logTTSError("user-1", "string error");
    const data = lastErrorJson(errorSpy);
    expect(data.error).toBe("string error");
    expect(data.errorType).toBe("Unknown");
  });

  it("includes extra fields when provided", () => {
    logTTSError("user-1", new Error("fail"), { endpoint: "/api/tts" });
    const data = lastErrorJson(errorSpy);
    expect(data.endpoint).toBe("/api/tts");
  });

  it("never throws even if console.error throws", () => {
    errorSpy.mockImplementation(() => {
      throw new Error("logging broke");
    });
    expect(() => logTTSError("user-1", new Error("fail"))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cache stats
// ---------------------------------------------------------------------------

describe("getCacheStats / resetCacheStats", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    resetCacheStats();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with zero hits and misses", () => {
    const stats = getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.ratio).toBe(0);
  });

  it("tracks cache hits from logTTSRequest", () => {
    logTTSRequest(makeEntry({ cacheHit: true }));
    logTTSRequest(makeEntry({ cacheHit: true }));
    logTTSRequest(makeEntry({ cacheHit: false }));
    const stats = getCacheStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.ratio).toBeCloseTo(2 / 3);
  });

  it("resets counters", () => {
    logTTSRequest(makeEntry({ cacheHit: true }));
    resetCacheStats();
    const stats = getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});

describe("logCacheStats", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    resetCacheStats();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs cache stats as structured JSON", () => {
    logTTSRequest(makeEntry({ cacheHit: true }));
    logTTSRequest(makeEntry({ cacheHit: false }));

    // Clear logs from logTTSRequest calls
    logSpy.mockClear();

    logCacheStats();
    const data = lastLogJson(logSpy);
    expect(data.event).toBe("tts_cache_stats");
    expect(data.cacheHits).toBe(1);
    expect(data.cacheMisses).toBe(1);
    expect(data.cacheHitRatio).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// startTimer
// ---------------------------------------------------------------------------

describe("startTimer", () => {
  it("returns elapsed time in milliseconds", async () => {
    const elapsed = startTimer();
    // Small delay to ensure nonzero elapsed time
    await new Promise((resolve) => setTimeout(resolve, 20));
    const ms = elapsed();
    expect(ms).toBeGreaterThanOrEqual(10); // Allow some margin
    expect(typeof ms).toBe("number");
  });

  it("returns a rounded integer", () => {
    const elapsed = startTimer();
    const ms = elapsed();
    expect(ms).toBe(Math.round(ms));
  });
});
