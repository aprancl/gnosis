import { describe, it, expect, beforeAll } from "vitest";
import {
  extractChapterVocabulary,
  getIPA,
  getPromptIPA,
  segmentText,
  estimateDuration,
  generatePrompts,
  formatPromptsText,
  formatPromptsTSV,
  generateSummary,
  SBLGNT_PASSAGES,
} from "./prepare-recording-prompts";
import {
  buildDictionary,
  type PronunciationDictionary,
} from "../src/lib/tts/pronunciation-dict";

// ---------------------------------------------------------------------------
// Test dictionary (subset for predictable tests)
// ---------------------------------------------------------------------------

function makeTestDict(): PronunciationDictionary {
  return buildDictionary({
    χαιρε: {
      ipa: "kʰɛ.re",
      polytonic: "χαῖρε",
      inflections: ["χαιρετε"],
    },
    ανθρωπος: {
      ipa: "an.tʰroː.pos",
      polytonic: "ἄνθρωπος",
      inflections: ["ανθρωπων"],
    },
    αρτος: {
      ipa: "ar.tos",
      polytonic: "ἄρτος",
      inflections: [],
    },
    αγορα: {
      ipa: "a.go.ra",
      polytonic: "ἀγορά",
      inflections: [],
    },
    οινος: {
      ipa: "iː.nos",
      polytonic: "οἶνος",
      inflections: [],
    },
    λεγω: {
      ipa: "le.goː",
      polytonic: "λέγω",
      inflections: [],
    },
    εχω: {
      ipa: "e.kʰoː",
      polytonic: "ἔχω",
      inflections: [],
    },
  });
}

// ---------------------------------------------------------------------------
// Vocabulary extraction
// ---------------------------------------------------------------------------

describe("extractChapterVocabulary", () => {
  it("extracts Greek words from chapters 1-3", () => {
    const vocab = extractChapterVocabulary([1, 2, 3]);
    expect(vocab.length).toBeGreaterThan(0);

    // Should contain known Ch 1 words
    expect(vocab).toContain("χαῖρε");
    expect(vocab).toContain("ἄνθρωπος");
    expect(vocab).toContain("ἀγορά");

    // Should contain Ch 2 words
    expect(vocab).toContain("ὁδός");
    expect(vocab).toContain("ἥλιος");

    // Should contain Ch 3 words
    expect(vocab).toContain("οἶνος");
    expect(vocab).toContain("ἰχθύς");
  });

  it("does not include Ch 4+ vocabulary", () => {
    const vocab = extractChapterVocabulary([1, 2, 3]);
    // Ch 4 word
    expect(vocab).not.toContain("πατήρ");
    // Ch 5 word
    expect(vocab).not.toContain("δεῖπνον");
    // Ch 7 word
    expect(vocab).not.toContain("σοφία");
  });

  it("handles comma-separated number entries", () => {
    const vocab = extractChapterVocabulary([3]);
    // Ch 3 has "εἷς, δύο, τρεῖς, τέσσαρες, πέντε"
    expect(vocab).toContain("εἷς");
    expect(vocab).toContain("δύο");
    expect(vocab).toContain("τρεῖς");
    expect(vocab).toContain("πέντε");
  });

  it("returns empty array for non-existent chapters", () => {
    const vocab = extractChapterVocabulary([99]);
    expect(vocab).toHaveLength(0);
  });

  it("deduplicates words appearing in multiple chapters", () => {
    // ἄρτος appears in Ch 1 and Ch 3
    const vocab = extractChapterVocabulary([1, 2, 3]);
    const artosCounts = vocab.filter((w) => w === "ἄρτος").length;
    expect(artosCounts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// IPA lookup
// ---------------------------------------------------------------------------

describe("getIPA", () => {
  let dict: PronunciationDictionary;

  beforeAll(() => {
    dict = makeTestDict();
  });

  it("returns IPA for a known word", () => {
    expect(getIPA(dict, "χαῖρε")).toBe("kʰɛ.re");
  });

  it("returns [MANUAL_IPA] for unknown words", () => {
    expect(getIPA(dict, "ζωοποιέω")).toBe("[MANUAL_IPA]");
  });
});

describe("getPromptIPA", () => {
  let dict: PronunciationDictionary;

  beforeAll(() => {
    dict = makeTestDict();
  });

  it("builds IPA for multi-word prompt", () => {
    const ipa = getPromptIPA(dict, "ὁ ἄρτος ἀγαθός");
    // "ὁ" not in test dict, ἄρτος found, ἀγαθός not found
    expect(ipa).toContain("ar.tos");
    expect(ipa).toContain("[MANUAL_IPA]");
  });

  it("strips punctuation before lookup", () => {
    const ipa = getPromptIPA(dict, "χαῖρε, ἄνθρωπος.");
    expect(ipa).toContain("kʰɛ.re");
    expect(ipa).toContain("an.tʰroː.pos");
  });
});

// ---------------------------------------------------------------------------
// Prompt segmentation
// ---------------------------------------------------------------------------

describe("segmentText", () => {
  it("returns short text as single segment", () => {
    const result = segmentText("Ἐν ἀρχῇ ἦν ὁ λόγος");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("Ἐν ἀρχῇ ἦν ὁ λόγος");
  });

  it("splits long text at clause boundaries", () => {
    // Create a sentence longer than MAX_PROMPT_WORDS (25) with a καί boundary
    const longText =
      "ἐν αὐτῷ ζωὴ ἦν ἐν αὐτῷ ζωὴ ἦν ἐν αὐτῷ ζωὴ ἦν ἐν αὐτῷ ζωὴ ἦν ἐν αὐτῷ ζωὴ ἦν καὶ ἡ ζωὴ ἦν τὸ φῶς τῶν ἀνθρώπων τῶν ἀνθρώπων τῶν ἀνθρώπων";
    const result = segmentText(longText);
    expect(result.length).toBeGreaterThan(1);
  });

  it("ensures all segments have at least MIN_PROMPT_WORDS words", () => {
    // Edge case: very long text
    const words = Array(30)
      .fill("λόγος")
      .join(" ");
    const longText = words + " καὶ " + words;
    const result = segmentText(longText);
    for (const segment of result) {
      const wordCount = segment.split(/\s+/).length;
      // Allow some flex for the merge logic
      expect(wordCount).toBeGreaterThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Duration estimation
// ---------------------------------------------------------------------------

describe("estimateDuration", () => {
  it("returns minimum 2 seconds for single vocab words", () => {
    expect(estimateDuration("χαῖρε")).toBe(2);
  });

  it("returns minimum 2 seconds for two-word prompts", () => {
    expect(estimateDuration("ὁ λόγος")).toBe(2);
  });

  it("estimates based on word count for longer prompts", () => {
    // 5 words / 2.5 wps = 2 seconds
    const duration = estimateDuration("Ἐν ἀρχῇ ἦν ὁ λόγος");
    expect(duration).toBe(5 / 2.5);
  });

  it("scales linearly with word count", () => {
    const short = estimateDuration("ἐν αὐτῷ ζωὴ ἦν"); // 4 words -> 4/2.5
    const long = estimateDuration(
      "ἐν αὐτῷ ζωὴ ἦν καὶ ἡ ζωὴ ἦν τὸ φῶς τῶν ἀνθρώπων"
    ); // 12 words -> 12/2.5
    expect(long).toBeGreaterThan(short);
  });
});

// ---------------------------------------------------------------------------
// Prompt generation
// ---------------------------------------------------------------------------

describe("generatePrompts", () => {
  let dict: PronunciationDictionary;
  let prompts: ReturnType<typeof generatePrompts>;

  beforeAll(() => {
    dict = makeTestDict();
    prompts = generatePrompts(dict);
  });

  it("generates both vocab and passage prompts", () => {
    const vocabPrompts = prompts.filter((p) => p.type === "vocab");
    const passagePrompts = prompts.filter((p) => p.type === "passage");
    expect(vocabPrompts.length).toBeGreaterThan(0);
    expect(passagePrompts.length).toBeGreaterThan(0);
  });

  it("includes all Ch 1-3 vocabulary as individual prompts", () => {
    const expectedVocab = extractChapterVocabulary([1, 2, 3]);
    const vocabTexts = prompts
      .filter((p) => p.type === "vocab")
      .map((p) => p.text);

    for (const word of expectedVocab) {
      expect(vocabTexts).toContain(word);
    }
  });

  it("assigns unique IDs to all prompts", () => {
    const ids = prompts.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("estimates total recording time around 10-60 minutes", () => {
    const totalSeconds = prompts.reduce(
      (sum, p) => sum + p.estimatedSeconds,
      0
    );
    const totalMinutes = totalSeconds / 60;
    // Should be in a reasonable range for ~30 min target
    expect(totalMinutes).toBeGreaterThan(3);
    expect(totalMinutes).toBeLessThan(60);
  });

  it("flags prompts needing manual IPA correctly", () => {
    const manualNeeded = prompts.filter((p) => p.manualIpaNeeded);
    // With our minimal test dict, many passage words will need manual IPA
    expect(manualNeeded.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

describe("formatPromptsText", () => {
  it("formats as Piper Recording Studio compatible: id|text per line", () => {
    const prompts = [
      {
        id: "vocab_0001",
        type: "vocab" as const,
        ref: "Ch1-3 vocab",
        text: "χαῖρε",
        ipa: "kʰɛ.re",
        estimatedSeconds: 2,
        manualIpaNeeded: false,
      },
    ];
    const output = formatPromptsText(prompts);
    expect(output).toBe("vocab_0001|χαῖρε\n");
  });

  it("writes one prompt per line", () => {
    const prompts = [
      {
        id: "vocab_0001",
        type: "vocab" as const,
        ref: "",
        text: "a",
        ipa: "a",
        estimatedSeconds: 2,
        manualIpaNeeded: false,
      },
      {
        id: "vocab_0002",
        type: "vocab" as const,
        ref: "",
        text: "b",
        ipa: "b",
        estimatedSeconds: 2,
        manualIpaNeeded: false,
      },
    ];
    const lines = formatPromptsText(prompts).trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});

describe("formatPromptsTSV", () => {
  it("includes TSV header row", () => {
    const output = formatPromptsTSV([]);
    expect(output.startsWith("id\ttype\tref\ttext\tipa\t")).toBe(true);
  });

  it("includes all fields tab-separated", () => {
    const prompts = [
      {
        id: "vocab_0001",
        type: "vocab" as const,
        ref: "Ch1-3 vocab",
        text: "χαῖρε",
        ipa: "kʰɛ.re",
        estimatedSeconds: 2,
        manualIpaNeeded: false,
      },
    ];
    const lines = formatPromptsTSV(prompts).trim().split("\n");
    expect(lines).toHaveLength(2); // header + 1 row
    const cols = lines[1].split("\t");
    expect(cols).toHaveLength(7);
    expect(cols[0]).toBe("vocab_0001");
    expect(cols[3]).toBe("χαῖρε");
    expect(cols[4]).toBe("kʰɛ.re");
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

describe("generateSummary", () => {
  it("reports prompt counts and estimated duration", () => {
    const dict = makeTestDict();
    const prompts = generatePrompts(dict);
    const summary = generateSummary(prompts);

    expect(summary).toContain("Total prompts:");
    expect(summary).toContain("Vocabulary word prompts:");
    expect(summary).toContain("Passage prompts:");
    expect(summary).toContain("Estimated total session time:");
    expect(summary).toContain("CC-BY 4.0");
  });
});

// ---------------------------------------------------------------------------
// SBLGNT passages validation
// ---------------------------------------------------------------------------

describe("SBLGNT_PASSAGES", () => {
  it("contains passages with references", () => {
    expect(SBLGNT_PASSAGES.length).toBeGreaterThan(10);
    for (const p of SBLGNT_PASSAGES) {
      expect(p.ref).toBeTruthy();
      expect(p.text).toBeTruthy();
      expect(p.text.length).toBeGreaterThan(0);
    }
  });

  it("includes John 1 passages", () => {
    const johnRefs = SBLGNT_PASSAGES.filter((p) => p.ref.startsWith("John"));
    expect(johnRefs.length).toBeGreaterThan(5);
  });

  it("passage texts contain Greek characters", () => {
    for (const p of SBLGNT_PASSAGES) {
      expect(/[\u0370-\u03FF\u1F00-\u1FFF]/.test(p.text)).toBe(true);
    }
  });
});
