import { describe, it, expect } from "vitest";
import { polytonicToMonotonic } from "./preprocess";

describe("polytonicToMonotonic", () => {
  // ---------------------------------------------------------------------------
  // Functional: NFD/NFC normalization strips correct diacriticals
  // ---------------------------------------------------------------------------

  describe("polytonic diacritical stripping", () => {
    it("strips smooth breathing (psili) from Greek vowels", () => {
      // ἀ = alpha with smooth breathing (U+1F00)
      // Expected: α (plain alpha, U+03B1)
      const result = polytonicToMonotonic("\u1F00");
      expect(result).toBe("\u03B1");
    });

    it("strips rough breathing (dasia) from Greek vowels", () => {
      // ἁ = alpha with rough breathing (U+1F01)
      // Expected: α (plain alpha, U+03B1)
      const result = polytonicToMonotonic("\u1F01");
      expect(result).toBe("\u03B1");
    });

    it("strips grave accent from Greek vowels", () => {
      // ὰ = alpha with grave (U+1F70)
      // After NFD: alpha + combining grave (U+0300)
      // Expected: α (plain alpha)
      const result = polytonicToMonotonic("\u1F70");
      expect(result).toBe("\u03B1");
    });

    it("strips circumflex/perispomeni from Greek vowels", () => {
      // ᾶ = alpha with perispomeni (U+1FB6)
      // Expected: α (plain alpha)
      const result = polytonicToMonotonic("\u1FB6");
      expect(result).toBe("\u03B1");
    });

    it("strips iota subscript (ypogegrammeni)", () => {
      // ᾳ = alpha with iota subscript (U+1FB3)
      // Expected: α (plain alpha)
      const result = polytonicToMonotonic("\u1FB3");
      expect(result).toBe("\u03B1");
    });

    it("strips multiple polytonic marks from a single character", () => {
      // ᾅ = alpha with dasia and oxia and iota subscript (U+1F85)
      // After stripping breathing + iota subscript, should keep acute -> ά
      const result = polytonicToMonotonic("\u1F85");
      expect(result).toBe("\u03AC"); // ά (alpha with tonos/acute)
    });

    it("converts a full polytonic Greek word to monotonic", () => {
      // ἄνθρωπος (anthropos) — alpha with smooth breathing + acute
      const polytonic = "\u1F04\u03BD\u03B8\u03C1\u03C9\u03C0\u03BF\u03C2";
      const result = polytonicToMonotonic(polytonic);
      // Expected: άνθρωπος (alpha with acute only)
      expect(result).toBe("\u03AC\u03BD\u03B8\u03C1\u03C9\u03C0\u03BF\u03C2");
    });

    it("converts polytonic sentence", () => {
      // Ἐν ἀρχῇ ἦν ὁ λόγος (John 1:1 opening)
      const polytonic = "\u1F18\u03BD \u1F00\u03C1\u03C7\u1FC7 \u1F26\u03BD \u1F41 \u03BB\u03CC\u03B3\u03BF\u03C2";
      const result = polytonicToMonotonic(polytonic);
      // Should strip breathings, iota subscript, circumflex; keep acute
      // Εν αρχή ην ο λόγος
      expect(result).toContain("\u03BB\u03CC\u03B3\u03BF\u03C2"); // λόγος unchanged (already monotonic-compatible)
      // The breathing marks should be gone
      expect(result).not.toMatch(/[\u0313\u0314]/);
      // Iota subscript should be gone
      expect(result).not.toMatch(/\u0345/);
    });
  });

  // ---------------------------------------------------------------------------
  // Functional: Diaeresis preservation
  // ---------------------------------------------------------------------------

  describe("diaeresis preservation", () => {
    it("preserves diaeresis on Greek vowels", () => {
      // ϊ = iota with diaeresis (U+03CA)
      const result = polytonicToMonotonic("\u03CA");
      expect(result).toBe("\u03CA");
    });

    it("preserves diaeresis on upsilon", () => {
      // ϋ = upsilon with diaeresis (U+03CB)
      const result = polytonicToMonotonic("\u03CB");
      expect(result).toBe("\u03CB");
    });

    it("preserves diaeresis when combined with other marks", () => {
      // ΐ = iota with diaeresis and acute (U+0390)
      const result = polytonicToMonotonic("\u0390");
      expect(result).toBe("\u0390");
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases: Mixed Greek and English
  // ---------------------------------------------------------------------------

  describe("mixed Greek and English text", () => {
    it("only processes Greek ranges, preserving English text", () => {
      const mixed = "The word \u1F04\u03BD\u03B8\u03C1\u03C9\u03C0\u03BF\u03C2 means 'human'";
      const result = polytonicToMonotonic(mixed);
      expect(result).toContain("The word");
      expect(result).toContain("means 'human'");
      // Greek part should be converted
      expect(result).toContain("\u03AC\u03BD\u03B8\u03C1\u03C9\u03C0\u03BF\u03C2");
    });

    it("preserves Latin accented characters", () => {
      const text = "caf\u00E9 and \u1F04\u03C1\u03C4\u03BF\u03C2";
      const result = polytonicToMonotonic(text);
      expect(result).toContain("caf\u00E9"); // cafe with accent preserved
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases: Empty and trivial input
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(polytonicToMonotonic("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(polytonicToMonotonic("   ")).toBe("");
    });

    it("returns empty string for null", () => {
      expect(polytonicToMonotonic(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(polytonicToMonotonic(undefined)).toBe("");
    });

    it("returns empty string for non-string types", () => {
      expect(polytonicToMonotonic(42 as unknown)).toBe("");
      expect(polytonicToMonotonic({} as unknown)).toBe("");
    });

    it("passes through text with no polytonic diacritics unchanged", () => {
      const monotonic = "\u03BA\u03B1\u03BB\u03B7\u03BC\u03AD\u03C1\u03B1"; // καλημέρα
      expect(polytonicToMonotonic(monotonic)).toBe(monotonic);
    });

    it("passes through already monotonic text unchanged", () => {
      const text = "\u03B1\u03B2\u03B3\u03B4"; // αβγδ
      expect(polytonicToMonotonic(text)).toBe(text);
    });

    it("passes through plain English text unchanged", () => {
      const text = "Hello, world!";
      expect(polytonicToMonotonic(text)).toBe(text);
    });
  });
});
