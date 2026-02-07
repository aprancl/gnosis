import { describe, it, expect, beforeEach } from "vitest";
import {
  buildDictionary,
  lookupWord,
  generateSSML,
  normalizeForLookup,
  stripPunctuation,
  clearDictionaryCache,
  loadDictionary,
  type PronunciationDictionary,
} from "./pronunciation-dict";
import { join } from "path";

// ---------------------------------------------------------------------------
// Test dictionary data (subset for unit tests)
// ---------------------------------------------------------------------------

const TEST_DICT_RAW: Record<string, unknown> = {
  _meta: { description: "Test dictionary" },
  "ανθρωπος": {
    ipa: "an.tʰroː.pos",
    polytonic: "\u1F04\u03BD\u03B8\u03C1\u03C9\u03C0\u03BF\u03C2",
    inflections: ["ανθρωπου", "ανθρωπον", "ανθρωποι", "ανθρωπων", "ανθρωπους"],
  },
  "λογος": {
    ipa: "lo.gos",
    polytonic: "\u03BB\u03CC\u03B3\u03BF\u03C2",
    inflections: ["λογου", "λογον", "λογοι", "λογων"],
  },
  "και": {
    ipa: "k\u025B",
    polytonic: "\u03BA\u03B1\u03AF",
    inflections: [],
  },
  "θεος": {
    ipa: "t\u02B0e.os",
    polytonic: "\u03B8\u03B5\u03CC\u03C2",
    inflections: ["θεου", "θεον", "θεε"],
  },
  "ειμι": {
    ipa: "i\u02D0.mi\u02D0",
    polytonic: "\u03B5\u1F30\u03BC\u03AF",
    inflections: ["εστιν", "εστι"],
  },
  "χαιρε": {
    ipa: "k\u02B0\u025B.re",
    polytonic: "\u03C7\u03B1\u1FD6\u03C1\u03B5",
    inflections: ["χαιρετε"],
  },
};

let dict: PronunciationDictionary;

beforeEach(() => {
  dict = buildDictionary(TEST_DICT_RAW);
  clearDictionaryCache();
});

// ---------------------------------------------------------------------------
// Unit: Dictionary lookup — exact match
// ---------------------------------------------------------------------------

describe("Dictionary lookup - exact match", () => {
  it("finds a word by its monotonic key", () => {
    const entry = lookupWord(dict, "ανθρωπος");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("an.tʰroː.pos");
  });

  it("finds a word with its acute accent present (normalizes it)", () => {
    // λόγος has an acute accent — normalizeForLookup should strip it
    const entry = lookupWord(dict, "\u03BB\u03CC\u03B3\u03BF\u03C2"); // λόγος
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("lo.gos");
  });

  it("finds a small word like και", () => {
    const entry = lookupWord(dict, "και");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("kɛ");
  });
});

// ---------------------------------------------------------------------------
// Unit: Dictionary lookup — normalized match (polytonic input)
// ---------------------------------------------------------------------------

describe("Dictionary lookup - normalized match", () => {
  it("finds polytonic input by normalizing to monotonic", () => {
    // ἄνθρωπος — has smooth breathing + acute
    const entry = lookupWord(dict, "\u1F04\u03BD\u03B8\u03C1\u03C9\u03C0\u03BF\u03C2");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("an.tʰroː.pos");
  });

  it("finds polytonic εἰμί", () => {
    const entry = lookupWord(dict, "\u03B5\u1F30\u03BC\u03AF");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("iː.miː");
  });

  it("finds polytonic χαῖρε (with circumflex)", () => {
    const entry = lookupWord(dict, "\u03C7\u03B1\u1FD6\u03C1\u03B5");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("kʰɛ.re");
  });

  it("lookup is case-insensitive for uppercase Greek", () => {
    const entry = lookupWord(dict, "ΘΕΟΣ");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("tʰe.os");
  });
});

// ---------------------------------------------------------------------------
// Unit: Inflection handling
// ---------------------------------------------------------------------------

describe("Inflection handling", () => {
  it("finds an inflected form and returns the base entry", () => {
    const entry = lookupWord(dict, "ανθρωπου");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("an.tʰroː.pos");
  });

  it("finds accusative inflection", () => {
    const entry = lookupWord(dict, "ανθρωπον");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("an.tʰroː.pos");
  });

  it("finds plural inflection", () => {
    const entry = lookupWord(dict, "λογοι");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("lo.gos");
  });

  it("finds εστιν as inflection of ειμι", () => {
    const entry = lookupWord(dict, "εστιν");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("iː.miː");
  });

  it("finds plural imperative χαιρετε", () => {
    const entry = lookupWord(dict, "χαιρετε");
    expect(entry).toBeDefined();
    expect(entry!.ipa).toBe("kʰɛ.re");
  });
});

// ---------------------------------------------------------------------------
// Unit: Edge cases - unknown words
// ---------------------------------------------------------------------------

describe("Edge cases - unknown words", () => {
  it("returns undefined for a word not in the dictionary", () => {
    const entry = lookupWord(dict, "φιλοσοφια");
    expect(entry).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    const entry = lookupWord(dict, "");
    expect(entry).toBeUndefined();
  });

  it("returns undefined for whitespace", () => {
    const entry = lookupWord(dict, "   ");
    expect(entry).toBeUndefined();
  });

  it("returns undefined for non-Greek text", () => {
    const entry = lookupWord(dict, "hello");
    expect(entry).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit: Punctuation stripping
// ---------------------------------------------------------------------------

describe("Punctuation stripping", () => {
  it("strips trailing period", () => {
    const [lead, word, trail] = stripPunctuation("λογος.");
    expect(lead).toBe("");
    expect(word).toBe("λογος");
    expect(trail).toBe(".");
  });

  it("strips trailing comma", () => {
    const [lead, word, trail] = stripPunctuation("και,");
    expect(lead).toBe("");
    expect(word).toBe("και");
    expect(trail).toBe(",");
  });

  it("strips leading quote marks", () => {
    const [lead, word, trail] = stripPunctuation("\u00ABλογος\u00BB");
    expect(lead).toBe("\u00AB");
    expect(word).toBe("λογος");
    expect(trail).toBe("\u00BB");
  });

  it("handles Greek semicolon (ano teleia)", () => {
    const [lead, word, trail] = stripPunctuation("θεος\u00B7");
    expect(word).toBe("θεος");
    expect(trail).toBe("\u00B7");
  });

  it("handles word with no punctuation", () => {
    const [lead, word, trail] = stripPunctuation("ανθρωπος");
    expect(lead).toBe("");
    expect(word).toBe("ανθρωπος");
    expect(trail).toBe("");
  });

  it("handles token that is all punctuation", () => {
    const [lead, word, trail] = stripPunctuation("...");
    expect(word).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Unit: SSML generation with phoneme tags
// ---------------------------------------------------------------------------

describe("SSML generation", () => {
  it("wraps a single known word with phoneme tag", () => {
    const ssml = generateSSML("λογος", dict);
    expect(ssml).toBe(
      '<speak><phoneme alphabet="ipa" ph="lo.gos">λογος</phoneme></speak>'
    );
  });

  it("wraps multiple known words", () => {
    const ssml = generateSSML("ανθρωπος και θεος", dict);
    expect(ssml).toContain('<phoneme alphabet="ipa" ph="an.tʰroː.pos">ανθρωπος</phoneme>');
    expect(ssml).toContain('<phoneme alphabet="ipa" ph="kɛ">και</phoneme>');
    expect(ssml).toContain('<phoneme alphabet="ipa" ph="tʰe.os">θεος</phoneme>');
  });

  it("passes through unknown words without phoneme tags", () => {
    const ssml = generateSSML("ανθρωπος βαδιζει", dict);
    // The known word should have a phoneme tag
    expect(ssml).toContain('<phoneme alphabet="ipa" ph="an.tʰroː.pos">ανθρωπος</phoneme>');
    // The unknown word should be present
    expect(ssml).toContain("βαδιζει");
    // The unknown word should NOT be wrapped in a phoneme tag
    expect(ssml).not.toMatch(/<phoneme[^>]*>βαδιζει<\/phoneme>/);
  });

  it("preserves punctuation outside phoneme tags", () => {
    const ssml = generateSSML("λογος, και θεος.", dict);
    expect(ssml).toContain('<phoneme alphabet="ipa" ph="lo.gos">λογος</phoneme>,');
    expect(ssml).toContain('<phoneme alphabet="ipa" ph="tʰe.os">θεος</phoneme>.');
  });

  it("handles adjacent punctuation correctly", () => {
    const ssml = generateSSML("\u00ABθεος\u00BB", dict);
    expect(ssml).toContain('\u00AB<phoneme alphabet="ipa" ph="tʰe.os">θεος</phoneme>\u00BB');
  });

  it("wraps input in <speak> tags", () => {
    const ssml = generateSSML("λογος", dict);
    expect(ssml).toMatch(/^<speak>.*<\/speak>$/);
  });

  it("returns empty speak tags for empty input", () => {
    expect(generateSSML("", dict)).toBe("<speak></speak>");
  });

  it("returns empty speak tags for null/undefined input", () => {
    expect(generateSSML(null as unknown as string, dict)).toBe("<speak></speak>");
    expect(generateSSML(undefined as unknown as string, dict)).toBe("<speak></speak>");
  });

  it("preserves whitespace between words", () => {
    const ssml = generateSSML("λογος  και", dict);
    expect(ssml).toContain("</phoneme>  <phoneme");
  });
});

// ---------------------------------------------------------------------------
// Unit: SSML generation with polytonic input
// ---------------------------------------------------------------------------

describe("SSML generation with polytonic input", () => {
  it("matches polytonic words and wraps them with phoneme tags", () => {
    // ἄνθρωπος
    const ssml = generateSSML("\u1F04\u03BD\u03B8\u03C1\u03C9\u03C0\u03BF\u03C2", dict);
    expect(ssml).toContain('alphabet="ipa"');
    expect(ssml).toContain('ph="an.tʰroː.pos"');
    expect(ssml).toContain("</phoneme>");
  });

  it("preserves original polytonic form in output while matching", () => {
    // χαῖρε
    const ssml = generateSSML("\u03C7\u03B1\u1FD6\u03C1\u03B5", dict);
    // The original form should be preserved, not the monotonic key
    expect(ssml).toContain(">\u03C7\u03B1\u1FD6\u03C1\u03B5</phoneme>");
  });
});

// ---------------------------------------------------------------------------
// Unit: normalizeForLookup
// ---------------------------------------------------------------------------

describe("normalizeForLookup", () => {
  it("converts polytonic to unaccented monotonic lowercase", () => {
    // Ἄνθρωπος -> ανθρωπος (no accent, no breathing)
    expect(normalizeForLookup("\u1F0C\u03BD\u03B8\u03C1\u03C9\u03C0\u03BF\u03C2")).toBe("ανθρωπος");
  });

  it("strips acute accent from monotonic text", () => {
    // λόγος -> λογος
    expect(normalizeForLookup("\u03BB\u03CC\u03B3\u03BF\u03C2")).toBe("λογος");
  });

  it("handles already unaccented monotonic text", () => {
    expect(normalizeForLookup("ανθρωπος")).toBe("ανθρωπος");
  });

  it("returns empty for null/undefined", () => {
    expect(normalizeForLookup(null as unknown as string)).toBe("");
    expect(normalizeForLookup(undefined as unknown as string)).toBe("");
  });

  it("returns empty for empty string", () => {
    expect(normalizeForLookup("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Unit: buildDictionary - malformed entries
// ---------------------------------------------------------------------------

describe("buildDictionary - error handling", () => {
  it("skips entries that are not objects", () => {
    const raw = {
      good: { ipa: "a", polytonic: "α", inflections: [] },
      bad: "not an object",
    };
    const d = buildDictionary(raw as Record<string, unknown>);
    expect(d.entries.size).toBe(1);
  });

  it("skips entries without ipa", () => {
    const raw = {
      bad: { polytonic: "α", inflections: [] },
    };
    const d = buildDictionary(raw as Record<string, unknown>);
    expect(d.entries.size).toBe(0);
  });

  it("skips entries without polytonic", () => {
    const raw = {
      bad: { ipa: "a", inflections: [] },
    };
    const d = buildDictionary(raw as Record<string, unknown>);
    expect(d.entries.size).toBe(0);
  });

  it("skips _meta keys", () => {
    const raw = {
      _meta: { description: "test" },
      good: { ipa: "a", polytonic: "α", inflections: [] },
    };
    const d = buildDictionary(raw as Record<string, unknown>);
    expect(d.entries.size).toBe(1);
  });

  it("handles non-array inflections gracefully", () => {
    const raw = {
      good: { ipa: "a", polytonic: "α", inflections: "not-array" },
    };
    const d = buildDictionary(raw as Record<string, unknown>);
    expect(d.entries.size).toBe(1);
    const entry = d.entries.get("good");
    expect(entry?.inflections).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration: Load real dictionary file
// ---------------------------------------------------------------------------

describe("loadDictionary - real file", () => {
  beforeEach(() => {
    clearDictionaryCache();
  });

  it("loads the bundled dictionary file without errors", () => {
    const dictPath = join(__dirname, "data", "pronunciation-dict.json");
    const realDict = loadDictionary(dictPath);
    expect(realDict.entries.size).toBeGreaterThan(100);
  });

  it("caches the dictionary on subsequent calls", () => {
    const dictPath = join(__dirname, "data", "pronunciation-dict.json");
    const first = loadDictionary(dictPath);
    const second = loadDictionary(dictPath);
    expect(first).toBe(second); // Same reference
  });

  it("throws clear error for missing file", () => {
    clearDictionaryCache();
    expect(() => loadDictionary("/nonexistent/path.json")).toThrow(
      /Failed to load dictionary file/
    );
  });

  it("covers Chapter 1-4 vocabulary from seed data", () => {
    const dictPath = join(__dirname, "data", "pronunciation-dict.json");
    const realDict = loadDictionary(dictPath);

    // Sample vocabulary from each chapter
    const ch1Words = ["χαιρε", "ανθρωπος", "αγορα", "αρτος", "ειμι", "εχω", "θελω"];
    const ch2Words = ["οδος", "οικια", "ηλιος", "ημερα", "βλεπω", "ακουω", "λεγω"];
    const ch3Words = ["οινος", "ιχθυς", "αγοραζω", "λαμβανω", "πολυς", "αγαθος"];
    const ch4Words = ["πατηρ", "μητηρ", "αδελφος", "υιος", "φιλος", "χαιρω", "φιλεω"];

    const allWords = [...ch1Words, ...ch2Words, ...ch3Words, ...ch4Words];

    for (const word of allWords) {
      const entry = lookupWord(realDict, word);
      expect(entry, `Expected to find "${word}" in dictionary`).toBeDefined();
    }
  });
});
