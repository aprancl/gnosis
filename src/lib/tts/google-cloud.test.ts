import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  synthesize,
  buildSSML,
  splitTextAtSentenceBoundaries,
  injectPhonemes,
  getApiKey,
  TTSConfigError,
  TTSApiError,
  TTSRateLimitError,
  TTSTimeoutError,
  type PhonemeOverride,
} from "./google-cloud";

// ---------------------------------------------------------------------------
// Unit: SSML generation with phoneme tags
// ---------------------------------------------------------------------------

describe("buildSSML", () => {
  it("wraps plain text in <speak> tags", () => {
    const result = buildSSML("Hello world");
    expect(result).toBe("<speak>Hello world</speak>");
  });

  it("applies polytonic-to-monotonic preprocessing", () => {
    // \u1F00 = alpha with smooth breathing -> \u03B1 (plain alpha)
    const result = buildSSML("\u1F00");
    expect(result).toBe("<speak>\u03B1</speak>");
  });

  it("injects phoneme tags for dictionary overrides", () => {
    const overrides: PhonemeOverride[] = [
      { word: "logos", ipa: "lo.ɣos" },
    ];
    const result = buildSSML("The logos is here", overrides);
    expect(result).toBe(
      '<speak>The <phoneme alphabet="ipa" ph="lo.ɣos">logos</phoneme> is here</speak>',
    );
  });

  it("injects multiple phoneme overrides", () => {
    const overrides: PhonemeOverride[] = [
      { word: "alpha", ipa: "al.fa" },
      { word: "beta", ipa: "vi.ta" },
    ];
    const result = buildSSML("alpha and beta", overrides);
    expect(result).toContain('<phoneme alphabet="ipa" ph="al.fa">alpha</phoneme>');
    expect(result).toContain('<phoneme alphabet="ipa" ph="vi.ta">beta</phoneme>');
  });

  it("handles text with no matching phoneme overrides", () => {
    const overrides: PhonemeOverride[] = [
      { word: "nonexistent", ipa: "n/a" },
    ];
    const result = buildSSML("Hello world", overrides);
    expect(result).toBe("<speak>Hello world</speak>");
  });

  it("handles empty phoneme overrides array", () => {
    const result = buildSSML("Hello", []);
    expect(result).toBe("<speak>Hello</speak>");
  });
});

describe("injectPhonemes", () => {
  it("replaces whole-word matches only", () => {
    const result = injectPhonemes("log logos logging", [
      { word: "log", ipa: "lɔɡ" },
    ]);
    expect(result).toContain('<phoneme alphabet="ipa" ph="lɔɡ">log</phoneme>');
    // "logos" should not be affected
    expect(result).toContain(" logos ");
  });

  it("replaces all occurrences of a word", () => {
    const result = injectPhonemes("go go go", [
      { word: "go", ipa: "ɡo" },
    ]);
    const matches = result.match(/<phoneme/g);
    expect(matches).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Unit: Text splitting at sentence boundaries
// ---------------------------------------------------------------------------

describe("splitTextAtSentenceBoundaries", () => {
  it("returns single chunk for short text", () => {
    const result = splitTextAtSentenceBoundaries("Hello world.", 5000);
    expect(result).toEqual(["Hello world."]);
  });

  it("splits at sentence boundaries", () => {
    const s1 = "A".repeat(40) + ". ";
    const s2 = "B".repeat(40) + ". ";
    const s3 = "C".repeat(40) + ".";
    const text = s1 + s2 + s3;
    // Max 90 chars: s1 + s2 = 84 chars, fits. s3 = 41 chars.
    const result = splitTextAtSentenceBoundaries(text, 90);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("A");
    expect(result[0]).toContain("B");
    expect(result[1]).toContain("C");
  });

  it("splits at question marks", () => {
    const result = splitTextAtSentenceBoundaries(
      "Is this a test? Yes it is. Done.",
      20,
    );
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).toContain("?");
  });

  it("splits at exclamation marks", () => {
    const result = splitTextAtSentenceBoundaries(
      "Wow! That was great! Indeed.",
      10,
    );
    expect(result.length).toBeGreaterThan(1);
  });

  it("splits at semicolons", () => {
    const result = splitTextAtSentenceBoundaries(
      "First part; second part; third part.",
      20,
    );
    expect(result.length).toBeGreaterThan(1);
  });

  it("handles text without sentence-ending punctuation", () => {
    const text = "A".repeat(100);
    const result = splitTextAtSentenceBoundaries(text, 50);
    // Should return single chunk since there are no sentence boundaries
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it("returns original text when within limit", () => {
    const text = "Short.";
    const result = splitTextAtSentenceBoundaries(text, 5000);
    expect(result).toEqual(["Short."]);
  });
});

// ---------------------------------------------------------------------------
// Unit: API key validation
// ---------------------------------------------------------------------------

describe("getApiKey", () => {
  const originalEnv = process.env.GOOGLE_CLOUD_TTS_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GOOGLE_CLOUD_TTS_API_KEY = originalEnv;
    } else {
      delete process.env.GOOGLE_CLOUD_TTS_API_KEY;
    }
  });

  it("returns the API key when set", () => {
    process.env.GOOGLE_CLOUD_TTS_API_KEY = "test-key-123";
    expect(getApiKey()).toBe("test-key-123");
  });

  it("throws TTSConfigError when API key is missing", () => {
    delete process.env.GOOGLE_CLOUD_TTS_API_KEY;
    expect(() => getApiKey()).toThrow(TTSConfigError);
    expect(() => getApiKey()).toThrow("GOOGLE_CLOUD_TTS_API_KEY");
  });
});

// ---------------------------------------------------------------------------
// Integration: API call with mocked responses
// ---------------------------------------------------------------------------

describe("synthesize", () => {
  const originalEnv = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  const mockFetch = vi.fn();

  beforeEach(() => {
    process.env.GOOGLE_CLOUD_TTS_API_KEY = "test-key";
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv !== undefined) {
      process.env.GOOGLE_CLOUD_TTS_API_KEY = originalEnv;
    } else {
      delete process.env.GOOGLE_CLOUD_TTS_API_KEY;
    }
  });

  it("returns empty buffer for empty text", async () => {
    const result = await synthesize({ text: "" });
    expect(result.audioContent.length).toBe(0);
    expect(result.characterCount).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty buffer for whitespace-only text", async () => {
    const result = await synthesize({ text: "   " });
    expect(result.audioContent.length).toBe(0);
    expect(result.characterCount).toBe(0);
  });

  it("makes API call and returns audio content", async () => {
    const fakeAudio = Buffer.from("fake-audio-data").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audioContent: fakeAudio }),
    });

    const result = await synthesize({ text: "Hello" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.audioContent).toEqual(Buffer.from("fake-audio-data"));
    expect(result.characterCount).toBeGreaterThan(0);

    // Verify the request body
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.input.ssml).toContain("<speak>");
    expect(body.voice.languageCode).toBe("el-GR");
    expect(body.voice.name).toBe("el-GR-Wavenet-A");
    expect(body.audioConfig.audioEncoding).toBe("MP3");
  });

  it("uses custom voice and encoding", async () => {
    const fakeAudio = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audioContent: fakeAudio }),
    });

    await synthesize({
      text: "Test",
      voice: "el-GR-Chirp3-HD-Leda",
      audioEncoding: "OGG_OPUS",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice.name).toBe("el-GR-Chirp3-HD-Leda");
    expect(body.audioConfig.audioEncoding).toBe("OGG_OPUS");
  });

  it("applies polytonic preprocessing before API call", async () => {
    const fakeAudio = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audioContent: fakeAudio }),
    });

    // \u1F00 = alpha with smooth breathing
    await synthesize({ text: "\u1F00" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Should contain monotonic alpha, not polytonic
    expect(body.input.ssml).toContain("\u03B1");
    expect(body.input.ssml).not.toContain("\u1F00");
  });

  it("embeds phoneme tags in API request", async () => {
    const fakeAudio = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audioContent: fakeAudio }),
    });

    await synthesize({
      text: "The logos",
      phonemeOverrides: [{ word: "logos", ipa: "lo.ɣos" }],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input.ssml).toContain('<phoneme alphabet="ipa" ph="lo.ɣos">logos</phoneme>');
  });

  it("supports SSML input pass-through", async () => {
    const fakeAudio = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audioContent: fakeAudio }),
    });

    await synthesize({
      text: '<speak>Hello <break time="500ms"/> world</speak>',
      ssml: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input.ssml).toContain("<speak>");
    expect(body.input.ssml).toContain("<break");
  });

  it("logs character usage", async () => {
    const fakeAudio = Buffer.from("audio").toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audioContent: fakeAudio }),
    });

    const consoleSpy = vi.spyOn(console, "log");
    await synthesize({ text: "Hello" });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[TTS] Synthesized"),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("characters"),
    );
  });

  // ---------------------------------------------------------------------------
  // Integration: Error handling for various failure modes
  // ---------------------------------------------------------------------------

  it("throws TTSConfigError when API key is missing", async () => {
    delete process.env.GOOGLE_CLOUD_TTS_API_KEY;
    await expect(synthesize({ text: "Hello" })).rejects.toThrow(TTSConfigError);
  });

  it("throws TTSRateLimitError on 429 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limit exceeded",
    });

    await expect(synthesize({ text: "Hello" })).rejects.toThrow(
      TTSRateLimitError,
    );
  });

  it("throws TTSApiError on 500 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal server error",
    });

    await expect(synthesize({ text: "Hello" })).rejects.toThrow(TTSApiError);
  });

  it("throws TTSApiError on 403 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    });

    await expect(synthesize({ text: "Hello" })).rejects.toThrow(TTSApiError);
  });

  it("throws TTSTimeoutError on timeout", async () => {
    mockFetch.mockImplementationOnce(
      (_url: string, opts: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            const err = new DOMException("The operation was aborted", "AbortError");
            reject(err);
          });
        });
      },
    );

    await expect(
      synthesize({ text: "Hello", timeoutMs: 50 }),
    ).rejects.toThrow(TTSTimeoutError);
  });

  it("throws TTSApiError on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const err = await synthesize({ text: "Hello" }).catch((e) => e);
    expect(err).toBeInstanceOf(TTSApiError);
    expect(err.message).toMatch(/Network error/);
  });

  it("throws TTSApiError when response is missing audioContent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    const err = await synthesize({ text: "Hello" }).catch((e) => e);
    expect(err).toBeInstanceOf(TTSApiError);
    expect(err.message).toMatch(/missing audioContent/);
  });
});
