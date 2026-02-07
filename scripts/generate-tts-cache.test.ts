import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractVocabulary,
  processWord,
  processWords,
} from "./generate-tts-cache";
import type { ProcessResult } from "./generate-tts-cache";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

// Mock the TTS synthesize function
vi.mock("../src/lib/tts/google-cloud", () => ({
  synthesize: vi.fn().mockResolvedValue({
    audioContent: Buffer.from("fake-audio"),
    characterCount: 100,
  }),
}));

// Mock the cache module
vi.mock("../src/lib/tts/cache", () => ({
  generateCacheKey: vi.fn(
    (text: string, _provider: string, _version: string) => `tts/mock-${text}`,
  ),
  getCachedAudio: vi.fn().mockResolvedValue(null), // cache miss by default
  setCachedAudio: vi.fn().mockResolvedValue(undefined),
  isCacheEnabled: vi.fn().mockReturnValue(true),
}));

// Mock the pronunciation dictionary module
vi.mock("../src/lib/tts/pronunciation-dict", () => ({
  loadDictionary: vi.fn().mockReturnValue({
    entries: new Map(),
    inflectionIndex: new Map(),
  }),
  generateSSML: vi.fn(
    (text: string) => `<speak>${text}</speak>`,
  ),
}));

// Import mocked modules for assertions
import { synthesize } from "../src/lib/tts/google-cloud";
import {
  getCachedAudio,
  setCachedAudio,
} from "../src/lib/tts/cache";
import { loadDictionary } from "../src/lib/tts/pronunciation-dict";

// ---------------------------------------------------------------------------
// Unit: Vocabulary extraction
// ---------------------------------------------------------------------------

describe("extractVocabulary", () => {
  it("extracts Greek words from all chapters", () => {
    const words = extractVocabulary();
    expect(words.length).toBeGreaterThan(0);
  });

  it("extracts known vocabulary words", () => {
    const words = extractVocabulary();
    // These words appear in Chapter 1 seed data
    expect(words).toContain("χαῖρε");
    expect(words).toContain("ἄνθρωπος");
    expect(words).toContain("ἀγορά");
    expect(words).toContain("εἰμί");
  });

  it("deduplicates words that appear in multiple chapters", () => {
    const words = extractVocabulary();
    const unique = new Set(words);
    expect(words.length).toBe(unique.size);
  });

  it("handles entries with comma-separated words", () => {
    const words = extractVocabulary();
    // Chapter 3 has: "εἷς, δύο, τρεῖς, τέσσαρες, πέντε - one through five"
    expect(words).toContain("εἷς");
    expect(words).toContain("δύο");
    expect(words).toContain("τρεῖς");
    expect(words).toContain("τέσσαρες");
    expect(words).toContain("πέντε");
  });

  it("extracts words from later chapters", () => {
    const words = extractVocabulary();
    // Chapter 7 words
    expect(words).toContain("σοφία");
    expect(words).toContain("ψυχή");
    expect(words).toContain("λόγος");
  });

  it("does not include transliterations or definitions", () => {
    const words = extractVocabulary();
    // Transliterations and definitions should not be in the list
    for (const word of words) {
      expect(word).not.toContain("(");
      expect(word).not.toContain(")");
      expect(word).not.toMatch(/^[a-z]/); // no Latin-only words
    }
  });

  it("only includes words containing Greek characters", () => {
    const words = extractVocabulary();
    const greekPattern = /[\u0370-\u03FF\u1F00-\u1FFF]/;
    for (const word of words) {
      expect(word).toMatch(greekPattern);
    }
  });
});

// ---------------------------------------------------------------------------
// Unit: Processing pipeline
// ---------------------------------------------------------------------------

describe("processWord", () => {
  const mockDict = loadDictionary();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset getCachedAudio to return null (cache miss)
    vi.mocked(getCachedAudio).mockResolvedValue(null);
    vi.mocked(synthesize).mockResolvedValue({
      audioContent: Buffer.from("fake-audio"),
      characterCount: 100,
    });
  });

  it("synthesizes and caches a word when not in cache", async () => {
    const result = await processWord("χαῖρε", mockDict, false);

    expect(result.status).toBe("cached");
    expect(result.word).toBe("χαῖρε");
    expect(synthesize).toHaveBeenCalledOnce();
    expect(setCachedAudio).toHaveBeenCalledOnce();
  });

  it("skips synthesis when word is already cached", async () => {
    vi.mocked(getCachedAudio).mockResolvedValue(Buffer.from("existing-audio"));

    const result = await processWord("χαῖρε", mockDict, false);

    expect(result.status).toBe("skipped");
    expect(synthesize).not.toHaveBeenCalled();
    expect(setCachedAudio).not.toHaveBeenCalled();
  });

  it("returns cached status in dry-run mode without calling TTS", async () => {
    const result = await processWord("χαῖρε", mockDict, true);

    expect(result.status).toBe("cached");
    expect(getCachedAudio).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    expect(setCachedAudio).not.toHaveBeenCalled();
  });

  it("returns failed status when synthesis throws", async () => {
    vi.mocked(synthesize).mockRejectedValue(new Error("TTS API error"));

    const result = await processWord("χαῖρε", mockDict, false);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("TTS API error");
  });

  it("returns failed status when cache write throws", async () => {
    vi.mocked(setCachedAudio).mockRejectedValue(new Error("Cache write error"));

    const result = await processWord("χαῖρε", mockDict, false);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Cache write error");
  });

  it("passes SSML to synthesize with ssml flag", async () => {
    await processWord("λόγος", mockDict, false);

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        ssml: true,
        text: expect.stringContaining("<speak>"),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Unit: Batch processing with concurrency
// ---------------------------------------------------------------------------

describe("processWords", () => {
  const mockDict = loadDictionary();

  beforeEach(() => {
    vi.mocked(getCachedAudio).mockReset().mockResolvedValue(null);
    vi.mocked(setCachedAudio).mockReset().mockResolvedValue(undefined);
    vi.mocked(synthesize).mockReset().mockResolvedValue({
      audioContent: Buffer.from("fake-audio"),
      characterCount: 100,
    });
  });

  it("processes all words and returns results", async () => {
    const words = ["χαῖρε", "λόγος", "σοφία"];
    const results = await processWords(words, mockDict, 2, false);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "cached")).toBe(true);
  });

  it("calls progress callback for each word", async () => {
    const words = ["χαῖρε", "λόγος"];
    const progress = vi.fn();

    await processWords(words, mockDict, 1, false, progress);

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(1, 2, expect.any(Object));
    expect(progress).toHaveBeenCalledWith(2, 2, expect.any(Object));
  });

  it("respects concurrency limit", async () => {
    let activeCalls = 0;
    let maxActiveCalls = 0;

    vi.mocked(synthesize).mockImplementation(async () => {
      activeCalls++;
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
      // Simulate async work
      await new Promise((r) => setTimeout(r, 10));
      activeCalls--;
      return { audioContent: Buffer.from("audio"), characterCount: 10 };
    });

    const words = ["a", "b", "c", "d", "e", "f"].map(
      (x) => `${x}ω` // make them look Greek-ish for the test
    );

    await processWords(words, mockDict, 2, false);

    // With concurrency 2, we should never have more than 2 active at once
    expect(maxActiveCalls).toBeLessThanOrEqual(2);
  });

  it("handles an empty word list", async () => {
    const results = await processWords([], mockDict, 3, false);
    expect(results).toHaveLength(0);
  });

  it("continues processing after individual word failures", async () => {
    let callCount = 0;
    vi.mocked(synthesize).mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new Error("Temporary failure");
      }
      return { audioContent: Buffer.from("audio"), characterCount: 10 };
    });

    const words = ["χαῖρε", "λόγος", "σοφία"];
    const results = await processWords(words, mockDict, 1, false);

    expect(results).toHaveLength(3);
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === "cached")).toHaveLength(2);
    expect(statuses.filter((s) => s === "failed")).toHaveLength(1);
  });
});
