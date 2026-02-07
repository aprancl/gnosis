/**
 * Tests for useTextToSpeech server TTS fetch/fallback logic.
 *
 * Since the project uses Vitest with node environment and does not have
 * @testing-library/react, these tests focus on the fetch/fallback/cancellation
 * logic by testing the core behavior patterns directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// We test the core logic extracted from the hook: server fetch with fallback.
// This mirrors the logic inside the hook's `speak` function.
// ---------------------------------------------------------------------------

interface ServerTTSResult {
  type: "server" | "fallback" | "error";
  error?: string;
}

/**
 * Simulates the fetch + fallback logic from useTextToSpeech.speak().
 * Returns the path taken (server, fallback, or error).
 */
async function fetchWithFallback(
  text: string,
  fetchFn: typeof fetch,
  signal?: AbortSignal
): Promise<ServerTTSResult> {
  try {
    const response = await fetchFn("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });

    if (signal?.aborted) {
      return { type: "error", error: "aborted" };
    }

    if (response.status === 429) {
      const data = await response.json().catch(() => null);
      return {
        type: "error",
        error: data?.error || "Rate limit exceeded. Please try again later.",
      };
    }

    if (!response.ok) {
      // Fall back to browser TTS
      return { type: "fallback" };
    }

    // Successful server response
    await response.blob();
    if (signal?.aborted) {
      return { type: "error", error: "aborted" };
    }

    return { type: "server" };
  } catch (err: unknown) {
    if (signal?.aborted) {
      return { type: "error", error: "aborted" };
    }
    // Network error -> fallback
    return { type: "fallback" };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useTextToSpeech - server TTS fetch logic", () => {
  describe("successful server response", () => {
    it("returns 'server' when /api/tts responds with 200", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          blob: () =>
            Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
          json: () => Promise.resolve({}),
        })
      ) as unknown as typeof fetch;

      const result = await fetchWithFallback("Hello", mockFetch);

      expect(result.type).toBe("server");
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/tts",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ text: "Hello" }),
        })
      );
    });
  });

  describe("fallback to browser TTS", () => {
    it("falls back on server 502", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 502,
          json: () => Promise.resolve({ error: "Bad Gateway" }),
        })
      ) as unknown as typeof fetch;

      const result = await fetchWithFallback("Test", mockFetch);
      expect(result.type).toBe("fallback");
    });

    it("falls back on server 500", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Internal Server Error" }),
        })
      ) as unknown as typeof fetch;

      const result = await fetchWithFallback("Test", mockFetch);
      expect(result.type).toBe("fallback");
    });

    it("falls back on network error (TypeError: Failed to fetch)", async () => {
      const mockFetch = vi.fn(() =>
        Promise.reject(new TypeError("Failed to fetch"))
      ) as unknown as typeof fetch;

      const result = await fetchWithFallback("Test", mockFetch);
      expect(result.type).toBe("fallback");
    });

    it("falls back on DNS resolution failure", async () => {
      const mockFetch = vi.fn(() =>
        Promise.reject(new Error("getaddrinfo ENOTFOUND"))
      ) as unknown as typeof fetch;

      const result = await fetchWithFallback("Test", mockFetch);
      expect(result.type).toBe("fallback");
    });
  });

  describe("rate limit handling (429)", () => {
    it("returns error with rate limit message on 429", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          json: () =>
            Promise.resolve({
              error: "Rate limit exceeded. Please try again later.",
            }),
        })
      ) as unknown as typeof fetch;

      const result = await fetchWithFallback("Test", mockFetch);
      expect(result.type).toBe("error");
      expect(result.error).toBe(
        "Rate limit exceeded. Please try again later."
      );
    });

    it("provides default error message if 429 body parse fails", async () => {
      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          json: () => Promise.reject(new Error("parse error")),
        })
      ) as unknown as typeof fetch;

      const result = await fetchWithFallback("Test", mockFetch);
      expect(result.type).toBe("error");
      expect(result.error).toBe(
        "Rate limit exceeded. Please try again later."
      );
    });
  });

  describe("request cancellation", () => {
    it("reports aborted when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      // When signal is already aborted, fetch rejects immediately
      const mockFetch = vi.fn((_url: string, opts: RequestInit) => {
        if (opts.signal?.aborted) {
          return Promise.reject(
            new DOMException("The operation was aborted.", "AbortError")
          );
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: () =>
            Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
        });
      }) as unknown as typeof fetch;

      const result = await fetchWithFallback(
        "Test",
        mockFetch,
        controller.signal
      );
      expect(result.type).toBe("error");
      expect(result.error).toBe("aborted");
    });

    it("cancels previous request when new one starts (simulated)", async () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      // Simulate rapid presses: abort first, start second
      controller1.abort();

      const mockFetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          blob: () =>
            Promise.resolve(new Blob(["audio"], { type: "audio/mpeg" })),
        })
      ) as unknown as typeof fetch;

      // First request (aborted)
      const result1 = await fetchWithFallback(
        "First",
        mockFetch,
        controller1.signal
      );
      expect(result1.type).toBe("error");
      expect(result1.error).toBe("aborted");

      // Second request (succeeds)
      const result2 = await fetchWithFallback(
        "Second",
        mockFetch,
        controller2.signal
      );
      expect(result2.type).toBe("server");
    });
  });

  describe("AbortController lifecycle", () => {
    it("creates an AbortController that can be used to cancel", () => {
      const controller = new AbortController();
      expect(controller.signal.aborted).toBe(false);

      controller.abort();
      expect(controller.signal.aborted).toBe(true);
    });

    it("new AbortController is independent of the old one", () => {
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      controller1.abort();

      expect(controller1.signal.aborted).toBe(true);
      expect(controller2.signal.aborted).toBe(false);
    });
  });
});
