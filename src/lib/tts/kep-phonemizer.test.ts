import { describe, it, expect } from "vitest";
import {
  hasRoughBreathing,
  stripToBaseGreek,
  greekToKEPIpa,
  generateKEPSSML,
} from "./kep-phonemizer";
import { buildDictionary } from "./pronunciation-dict";

// ---------------------------------------------------------------------------
// hasRoughBreathing
// ---------------------------------------------------------------------------

describe("hasRoughBreathing", () => {
  it("detects rough breathing from combining mark (U+0314)", () => {
    // ἱ = ι + combining rough breathing
    expect(hasRoughBreathing("ἱερόν")).toBe(true);
  });

  it("detects rough breathing from precomposed characters", () => {
    // ὑ = U+1F51 (odd = rough)
    expect(hasRoughBreathing("ὕδωρ")).toBe(true);
  });

  it("returns false for smooth breathing", () => {
    // ἀ = U+1F00 (even = smooth)
    expect(hasRoughBreathing("ἀγορά")).toBe(false);
  });

  it("returns false for no breathing marks", () => {
    expect(hasRoughBreathing("λογος")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(hasRoughBreathing("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripToBaseGreek
// ---------------------------------------------------------------------------

describe("stripToBaseGreek", () => {
  it("strips all diacritics and lowercases", () => {
    expect(stripToBaseGreek("ἄνθρωπος")).toBe("ανθρωπος");
  });

  it("strips breathing marks", () => {
    expect(stripToBaseGreek("ἱερόν")).toBe("ιερον");
  });

  it("strips circumflex and iota subscript", () => {
    expect(stripToBaseGreek("χαῖρε")).toBe("χαιρε");
  });

  it("passes plain Greek through unchanged", () => {
    expect(stripToBaseGreek("λογος")).toBe("λογος");
  });
});

// ---------------------------------------------------------------------------
// greekToKEPIpa — Vowels
// ---------------------------------------------------------------------------

describe("greekToKEPIpa vowels", () => {
  it("maps η to eː (not Modern Greek /i/)", () => {
    const ipa = greekToKEPIpa("η");
    expect(ipa).toBe("eː");
  });

  it("maps υ to y (not Modern Greek /i/)", () => {
    const ipa = greekToKEPIpa("υ");
    expect(ipa).toBe("y");
  });

  it("maps ω to oː (not Modern Greek /o/)", () => {
    const ipa = greekToKEPIpa("ω");
    expect(ipa).toBe("oː");
  });

  it("maps α to a", () => {
    expect(greekToKEPIpa("α")).toBe("a");
  });

  it("maps ε to e", () => {
    expect(greekToKEPIpa("ε")).toBe("e");
  });

  it("maps ι to i", () => {
    expect(greekToKEPIpa("ι")).toBe("i");
  });

  it("maps ο to o", () => {
    expect(greekToKEPIpa("ο")).toBe("o");
  });
});

// ---------------------------------------------------------------------------
// greekToKEPIpa — Diphthongs
// ---------------------------------------------------------------------------

describe("greekToKEPIpa diphthongs", () => {
  it("maps αι to ɛ", () => {
    expect(greekToKEPIpa("ναι")).toBe("nɛ");
  });

  it("maps ει to iː", () => {
    expect(greekToKEPIpa("ειρηνη")).toBe("iːreːneː");
  });

  it("maps οι to yː", () => {
    expect(greekToKEPIpa("οικος")).toBe("yːkos");
  });

  it("maps ου to uː", () => {
    expect(greekToKEPIpa("ουρανος")).toBe("uːranos");
  });

  it("maps αυ + voiceless → af", () => {
    // αυτος: αυ before τ (voiceless) → af
    expect(greekToKEPIpa("αυτος")).toBe("aftos");
  });

  it("maps αυ + voiced → av", () => {
    // αυλη: αυ before λ (voiced) → av
    expect(greekToKEPIpa("αυλη")).toBe("avleː");
  });

  it("maps αυ word-finally → af", () => {
    expect(greekToKEPIpa("αυ")).toBe("af");
  });

  it("maps ευ + voiceless → ef", () => {
    expect(greekToKEPIpa("ευκαιρια")).toBe("efkɛria");
  });

  it("maps ευ + voiced → ev", () => {
    expect(greekToKEPIpa("ευλογια")).toBe("evlogia");
  });

  it("maps ηυ + voiceless → eːf", () => {
    expect(greekToKEPIpa("ηυξησεν")).toBe("eːfkseːsen");
  });
});

// ---------------------------------------------------------------------------
// greekToKEPIpa — Consonants
// ---------------------------------------------------------------------------

describe("greekToKEPIpa consonants", () => {
  it("maps β to b (not Modern Greek /v/)", () => {
    expect(greekToKEPIpa("βιβλος")).toBe("biblos");
  });

  it("maps γ to g (not Modern Greek /ɣ/)", () => {
    expect(greekToKEPIpa("γη")).toBe("geː");
  });

  it("maps δ to d (not Modern Greek /ð/)", () => {
    expect(greekToKEPIpa("δωρον")).toBe("doːron");
  });

  it("maps ζ to zd", () => {
    expect(greekToKEPIpa("ζωη")).toBe("zdoːeː");
  });

  it("maps θ to tʰ (aspirated, not fricative)", () => {
    expect(greekToKEPIpa("θεος")).toBe("tʰeos");
  });

  it("maps φ to pʰ (aspirated, not fricative)", () => {
    expect(greekToKEPIpa("φως")).toBe("pʰoːs");
  });

  it("maps χ to kʰ (aspirated, not fricative)", () => {
    expect(greekToKEPIpa("χαρα")).toBe("kʰara");
  });
});

// ---------------------------------------------------------------------------
// greekToKEPIpa — Consonant clusters
// ---------------------------------------------------------------------------

describe("greekToKEPIpa consonant clusters", () => {
  it("maps γγ to ŋg", () => {
    expect(greekToKEPIpa("αγγελος")).toBe("aŋgelos");
  });

  it("maps γκ to ŋk", () => {
    expect(greekToKEPIpa("αγκυρα")).toBe("aŋkyra");
  });

  it("maps μπ to mb", () => {
    expect(greekToKEPIpa("εμπροσθεν")).toBe("embrostʰen");
  });

  it("maps ντ to nd", () => {
    expect(greekToKEPIpa("αντι")).toBe("andi");
  });
});

// ---------------------------------------------------------------------------
// greekToKEPIpa — Rough breathing
// ---------------------------------------------------------------------------

describe("greekToKEPIpa rough breathing", () => {
  it("adds h prefix for rough breathing", () => {
    // ἱερόν has rough breathing
    expect(greekToKEPIpa("ἱερόν")).toBe("hieron");
  });

  it("adds h prefix for ὕδωρ", () => {
    expect(greekToKEPIpa("ὕδωρ")).toBe("hydoːr");
  });

  it("no h prefix for smooth breathing", () => {
    // ἀγορά has smooth breathing
    expect(greekToKEPIpa("ἀγορά")).toBe("agora");
  });

  it("no h prefix for unaccented text", () => {
    expect(greekToKEPIpa("λογος")).toBe("logos");
  });
});

// ---------------------------------------------------------------------------
// greekToKEPIpa — Full words (cross-reference with dictionary)
// ---------------------------------------------------------------------------

describe("greekToKEPIpa full words", () => {
  it("produces correct IPA for ανθρωπος", () => {
    expect(greekToKEPIpa("ανθρωπος")).toBe("antʰroːpos");
  });

  it("produces correct IPA for χαιρε", () => {
    expect(greekToKEPIpa("χαιρε")).toBe("kʰɛre");
  });

  it("produces correct IPA for αρτος", () => {
    expect(greekToKEPIpa("αρτος")).toBe("artos");
  });

  it("returns empty string for empty input", () => {
    expect(greekToKEPIpa("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// generateKEPSSML
// ---------------------------------------------------------------------------

describe("generateKEPSSML", () => {
  it("wraps Greek words in phoneme tags", () => {
    const ssml = generateKEPSSML("λογος");
    expect(ssml).toBe(
      '<speak><phoneme alphabet="ipa" ph="logos">λογος</phoneme></speak>',
    );
  });

  it("handles multiple words", () => {
    const ssml = generateKEPSSML("ο λογος");
    expect(ssml).toContain('<phoneme alphabet="ipa" ph="o">ο</phoneme>');
    expect(ssml).toContain('<phoneme alphabet="ipa" ph="logos">λογος</phoneme>');
  });

  it("preserves punctuation outside phoneme tags", () => {
    const ssml = generateKEPSSML("λογος,");
    expect(ssml).toContain('>λογος</phoneme>,');
  });

  it("passes non-Greek text through unchanged", () => {
    const ssml = generateKEPSSML("hello world");
    expect(ssml).toBe("<speak>hello world</speak>");
  });

  it("handles mixed Greek and English", () => {
    const ssml = generateKEPSSML("the word λογος means");
    expect(ssml).toContain("the word ");
    expect(ssml).toContain('<phoneme alphabet="ipa" ph="logos">λογος</phoneme>');
    expect(ssml).toContain(" means");
  });

  it("uses dictionary override when available", () => {
    const dict = buildDictionary({
      λογος: { ipa: "lo.gos", polytonic: "λόγος", inflections: [] },
    });
    const ssml = generateKEPSSML("λογος", dict);
    // Should use dictionary IPA "lo.gos" not rules-based "logos"
    expect(ssml).toContain('ph="lo.gos"');
  });

  it("falls back to rules when word not in dictionary", () => {
    const dict = buildDictionary({
      λογος: { ipa: "lo.gos", polytonic: "λόγος", inflections: [] },
    });
    const ssml = generateKEPSSML("λογος και θεος", dict);
    // λογος from dictionary, θεος from rules
    expect(ssml).toContain('ph="lo.gos"');
    expect(ssml).toContain('ph="tʰeos"');
  });

  it("returns empty speak tags for empty input", () => {
    expect(generateKEPSSML("")).toBe("<speak></speak>");
    expect(generateKEPSSML(null as unknown as string)).toBe("<speak></speak>");
  });

  it("handles polytonic input with breathing marks", () => {
    const ssml = generateKEPSSML("ὁ λόγος");
    // ὁ has rough breathing → h prefix
    expect(ssml).toContain('ph="ho"');
    expect(ssml).toContain('ph="logos"');
  });
});
