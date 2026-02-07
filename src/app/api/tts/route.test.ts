import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkRateLimit,
  rateLimitStore,
  validateRequest,
  RATE_LIMIT_MAX_REQUESTS,
} from "./route";

// ---------------------------------------------------------------------------
// Unit tests for rate limiting
// ---------------------------------------------------------------------------

describe("checkRateLimit", () => {
  beforeEach(() => {
    rateLimitStore.clear();
  });

  it("allows requests under the limit", () => {
    const result = checkRateLimit("user-1");
    expect(result).toBe(0);
  });

  it("tracks requests per user independently", () => {
    for (let i = 0; i < 50; i++) {
      checkRateLimit("user-1");
    }
    // user-2 should still be allowed
    expect(checkRateLimit("user-2")).toBe(0);
  });

  it("blocks requests when limit is exceeded", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      checkRateLimit("user-1");
    }
    const retryAfter = checkRateLimit("user-1");
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("returns retry-after in seconds", () => {
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      checkRateLimit("user-1");
    }
    const retryAfter = checkRateLimit("user-1");
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(retryAfter).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests for request validation
// ---------------------------------------------------------------------------

describe("validateRequest", () => {
  it("accepts valid request with text only", () => {
    const result = validateRequest({ text: "Χαῖρε" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.text).toBe("Χαῖρε");
      expect(result.data.format).toBe("mp3");
    }
  });

  it("accepts valid request with mp3 format", () => {
    const result = validateRequest({ text: "hello", format: "mp3" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.format).toBe("mp3");
    }
  });

  it("accepts valid request with ogg format", () => {
    const result = validateRequest({ text: "hello", format: "ogg" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.format).toBe("ogg");
    }
  });

  it("rejects null body", () => {
    const result = validateRequest(null);
    expect(result.valid).toBe(false);
  });

  it("rejects missing text", () => {
    const result = validateRequest({ format: "mp3" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("text");
    }
  });

  it("rejects empty text", () => {
    const result = validateRequest({ text: "   " });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("empty");
    }
  });

  it("rejects invalid format", () => {
    const result = validateRequest({ text: "hello", format: "wav" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("format");
    }
  });

  it("rejects non-object body", () => {
    const result = validateRequest("hello");
    expect(result.valid).toBe(false);
  });
});
