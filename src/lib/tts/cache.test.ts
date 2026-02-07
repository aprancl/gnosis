import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateCacheKey,
  getCachedAudio,
  setCachedAudio,
  isCacheEnabled,
} from "./cache";

// ---------------------------------------------------------------------------
// Unit: Cache key generation
// ---------------------------------------------------------------------------

describe("generateCacheKey", () => {
  it("produces a deterministic key for the same inputs", () => {
    const key1 = generateCacheKey("hello", "el-GR-Wavenet-A", "v1");
    const key2 = generateCacheKey("hello", "el-GR-Wavenet-A", "v1");
    expect(key1).toBe(key2);
  });

  it("produces different keys for different text", () => {
    const key1 = generateCacheKey("hello", "el-GR-Wavenet-A", "v1");
    const key2 = generateCacheKey("world", "el-GR-Wavenet-A", "v1");
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different providers", () => {
    const key1 = generateCacheKey("hello", "el-GR-Wavenet-A", "v1");
    const key2 = generateCacheKey("hello", "el-GR-Chirp3-HD-Leda", "v1");
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different dict versions", () => {
    const key1 = generateCacheKey("hello", "el-GR-Wavenet-A", "v1");
    const key2 = generateCacheKey("hello", "el-GR-Wavenet-A", "v2");
    expect(key1).not.toBe(key2);
  });

  it("returns a key in the format tts/{hash}", () => {
    const key = generateCacheKey("test", "provider", "v1");
    expect(key).toMatch(/^tts\/[a-f0-9]{64}$/);
  });

  it("includes all three inputs in the hash (changing any changes the key)", () => {
    const base = generateCacheKey("text", "provider", "version");
    const diffText = generateCacheKey("other", "provider", "version");
    const diffProvider = generateCacheKey("text", "other", "version");
    const diffVersion = generateCacheKey("text", "provider", "other");

    const keys = new Set([base, diffText, diffProvider, diffVersion]);
    expect(keys.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Unit: isCacheEnabled
// ---------------------------------------------------------------------------

describe("isCacheEnabled", () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.TTS_CACHE_BUCKET_URL = process.env.TTS_CACHE_BUCKET_URL;
    envBackup.TTS_CACHE_ACCESS_KEY = process.env.TTS_CACHE_ACCESS_KEY;
    envBackup.TTS_CACHE_SECRET_KEY = process.env.TTS_CACHE_SECRET_KEY;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("returns false when env vars are not set", () => {
    delete process.env.TTS_CACHE_BUCKET_URL;
    delete process.env.TTS_CACHE_ACCESS_KEY;
    delete process.env.TTS_CACHE_SECRET_KEY;
    expect(isCacheEnabled()).toBe(false);
  });

  it("returns false when only some env vars are set", () => {
    process.env.TTS_CACHE_BUCKET_URL = "https://bucket.example.com";
    delete process.env.TTS_CACHE_ACCESS_KEY;
    delete process.env.TTS_CACHE_SECRET_KEY;
    expect(isCacheEnabled()).toBe(false);
  });

  it("returns true when all env vars are set", () => {
    process.env.TTS_CACHE_BUCKET_URL = "https://bucket.example.com";
    process.env.TTS_CACHE_ACCESS_KEY = "access-key";
    process.env.TTS_CACHE_SECRET_KEY = "secret-key";
    expect(isCacheEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit: getCachedAudio
// ---------------------------------------------------------------------------

describe("getCachedAudio", () => {
  const envBackup: Record<string, string | undefined> = {};
  const mockFetch = vi.fn();

  beforeEach(() => {
    envBackup.TTS_CACHE_BUCKET_URL = process.env.TTS_CACHE_BUCKET_URL;
    envBackup.TTS_CACHE_ACCESS_KEY = process.env.TTS_CACHE_ACCESS_KEY;
    envBackup.TTS_CACHE_SECRET_KEY = process.env.TTS_CACHE_SECRET_KEY;

    process.env.TTS_CACHE_BUCKET_URL = "https://my-bucket.s3.us-east-1.amazonaws.com";
    process.env.TTS_CACHE_ACCESS_KEY = "test-access-key";
    process.env.TTS_CACHE_SECRET_KEY = "test-secret-key";

    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(envBackup)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("returns null when cache is not configured", async () => {
    delete process.env.TTS_CACHE_BUCKET_URL;
    const result = await getCachedAudio("tts/abc123");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns audio buffer on cache hit", async () => {
    const audioData = Buffer.from("fake-audio-data");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: async () => audioData.buffer.slice(
        audioData.byteOffset,
        audioData.byteOffset + audioData.byteLength,
      ),
    });

    const result = await getCachedAudio("tts/abc123", "mp3");
    expect(result).not.toBeNull();
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify it called the correct URL
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain("tts/abc123.mp3");
  });

  it("returns null on 404 (cache miss)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await getCachedAudio("tts/abc123");
    expect(result).toBeNull();
  });

  it("returns null on 403 (access denied, treated as miss)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    const result = await getCachedAudio("tts/abc123");
    expect(result).toBeNull();
  });

  it("returns null and logs warning on other HTTP errors", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await getCachedAudio("tts/abc123");
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[tts/cache] GET failed"),
      // Note: rest of args don't matter
    );
  });

  it("returns null and logs warning on network error", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await getCachedAudio("tts/abc123");
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[tts/cache] GET error"),
      expect.any(String),
    );
  });

  it("appends the correct format extension to the key", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await getCachedAudio("tts/abc123", "ogg");

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain("tts/abc123.ogg");
  });
});

// ---------------------------------------------------------------------------
// Unit: setCachedAudio
// ---------------------------------------------------------------------------

describe("setCachedAudio", () => {
  const envBackup: Record<string, string | undefined> = {};
  const mockFetch = vi.fn();

  beforeEach(() => {
    envBackup.TTS_CACHE_BUCKET_URL = process.env.TTS_CACHE_BUCKET_URL;
    envBackup.TTS_CACHE_ACCESS_KEY = process.env.TTS_CACHE_ACCESS_KEY;
    envBackup.TTS_CACHE_SECRET_KEY = process.env.TTS_CACHE_SECRET_KEY;

    process.env.TTS_CACHE_BUCKET_URL = "https://my-bucket.s3.us-east-1.amazonaws.com";
    process.env.TTS_CACHE_ACCESS_KEY = "test-access-key";
    process.env.TTS_CACHE_SECRET_KEY = "test-secret-key";

    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(envBackup)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  });

  it("does nothing when cache is not configured", async () => {
    delete process.env.TTS_CACHE_BUCKET_URL;
    await setCachedAudio("tts/abc123", Buffer.from("audio"), { format: "mp3" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends PUT request with audio data", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const audio = Buffer.from("test-audio-data");

    await setCachedAudio("tts/abc123", audio, {
      format: "mp3",
      textLength: 42,
      provider: "el-GR-Wavenet-A",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [callUrl, callOpts] = mockFetch.mock.calls[0];
    expect(callUrl).toContain("tts/abc123.mp3");
    expect(callOpts.method).toBe("PUT");
    expect(callOpts.body).toEqual(audio);
  });

  it("sets correct content-type for mp3", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await setCachedAudio("tts/abc123", Buffer.from("audio"), {
      format: "mp3",
    });

    const callOpts = mockFetch.mock.calls[0][1];
    expect(callOpts.headers["content-type"]).toBe("audio/mpeg");
  });

  it("sets correct content-type for ogg", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await setCachedAudio("tts/abc123", Buffer.from("audio"), {
      format: "ogg",
    });

    const callOpts = mockFetch.mock.calls[0][1];
    expect(callOpts.headers["content-type"]).toBe("audio/ogg");
  });

  it("logs warning on HTTP error without throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    // Should not throw
    await setCachedAudio("tts/abc123", Buffer.from("audio"), {
      format: "mp3",
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[tts/cache] PUT failed"),
    );
  });

  it("logs warning on network error without throwing", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    // Should not throw
    await setCachedAudio("tts/abc123", Buffer.from("audio"), {
      format: "mp3",
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[tts/cache] PUT error"),
      expect.any(String),
    );
  });

  it("includes metadata headers in the request", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await setCachedAudio("tts/abc123", Buffer.from("audio"), {
      format: "mp3",
      textLength: 100,
      provider: "el-GR-Wavenet-A",
      cachedAt: "2025-01-01T00:00:00.000Z",
    });

    const callOpts = mockFetch.mock.calls[0][1];
    expect(callOpts.headers["x-amz-meta-text-length"]).toBe("100");
    expect(callOpts.headers["x-amz-meta-provider"]).toBe("el-GR-Wavenet-A");
    expect(callOpts.headers["x-amz-meta-cached-at"]).toBe(
      "2025-01-01T00:00:00.000Z",
    );
  });
});
