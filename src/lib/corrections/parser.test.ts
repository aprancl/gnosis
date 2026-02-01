import { describe, it, expect } from "vitest";
import { parseCorrections, hasCorrections } from "./parser";

describe("parseCorrections", () => {
  // -----------------------------------------------------------------------
  // Pattern 1: Parenthetical corrections
  // -----------------------------------------------------------------------

  describe("parenthetical corrections", () => {
    it("parses 'should be X, not Y' pattern", () => {
      const content = "Good try! (should be arton, not artos)";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
      const c = result.corrections[0];
      expect(c.corrected).toBe("arton");
      expect(c.original).toBe("artos");
    });

    it("parses 'correction: use X instead of Y' pattern", () => {
      const content = "Well said! (correction: use arton instead of artos)";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
      const c = result.corrections[0];
      expect(c.corrected).toBe("arton");
      expect(c.original).toBe("artos");
    });

    it("parses arrow pattern 'X -> Y'", () => {
      const content = "Nice attempt (artos -> arton)";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
      const c = result.corrections[0];
      // Arrow: X is original, Y is corrected
      expect(c.original).toBe("artos");
      expect(c.corrected).toBe("arton");
    });

    it("parses unicode arrow pattern 'X -> Y'", () => {
      const content = "Close! (\u1F04\u03C1\u03C4\u03BF\u03C2 \u2192 \u1F04\u03C1\u03C4\u03BF\u03BD)";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
      const c = result.corrections[0];
      expect(c.original).toBe("\u1F04\u03C1\u03C4\u03BF\u03C2");
      expect(c.corrected).toBe("\u1F04\u03C1\u03C4\u03BF\u03BD");
    });

    it("parses 'X, not Y' short pattern", () => {
      const content = "Right! (\u1F04\u03C1\u03C4\u03BF\u03BD, not \u1F04\u03C1\u03C4\u03BF\u03C2)";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
      const c = result.corrections[0];
      expect(c.corrected).toBe("\u1F04\u03C1\u03C4\u03BF\u03BD");
      expect(c.original).toBe("\u1F04\u03C1\u03C4\u03BF\u03C2");
    });
  });

  // -----------------------------------------------------------------------
  // Pattern 2: Grammar explanation parentheticals
  // -----------------------------------------------------------------------

  describe("grammar explanation parentheticals", () => {
    it("parses 'X is CASE -- Y would be CASE' pattern", () => {
      const content =
        "Well done! (\u1F04\u03C1\u03C4\u03BF\u03BD is accusative -- \u1F04\u03C1\u03C4\u03BF\u03C5 would be genitive)";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
      // The grammar explanation parser extracts corrected (first word) and original (second)
      const grammarCorrection = result.corrections.find(
        (c) => c.explanation.includes("accusative")
      );
      expect(grammarCorrection).toBeDefined();
      expect(grammarCorrection!.corrected).toBe("\u1F04\u03C1\u03C4\u03BF\u03BD");
      expect(grammarCorrection!.original).toBe("\u1F04\u03C1\u03C4\u03BF\u03C5");
    });

    it("parses grammar terms like nominative, genitive, etc.", () => {
      const content =
        "The form (\u03BB\u03CC\u03B3\u03BF\u03C2 is nominative -- \u03BB\u03CC\u03B3\u03BF\u03BD would be accusative here)";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // Pattern 3: Asterisk-wrapped corrections
  // -----------------------------------------------------------------------

  describe("asterisk-wrapped corrections", () => {
    it("detects asterisk-wrapped corrected form", () => {
      const content = "The correct form is *\u1F04\u03C1\u03C4\u03BF\u03BD* here.";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
      const c = result.corrections.find(
        (c) => c.corrected === "\u1F04\u03C1\u03C4\u03BF\u03BD"
      );
      expect(c).toBeDefined();
      expect(c!.explanation).toBe("Corrected form");
    });

    it("skips single-character asterisk content", () => {
      const content = "Use *a* here.";
      const result = parseCorrections(content);
      // Single character should be skipped
      const singleChar = result.corrections.find(
        (c) => c.corrected === "a"
      );
      expect(singleChar).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Pattern 4: Bracket-wrapped corrections
  // -----------------------------------------------------------------------

  describe("bracket-wrapped corrections", () => {
    it("detects bracket-wrapped corrected form", () => {
      const content = "You should say [\u1F04\u03C1\u03C4\u03BF\u03BD] instead.";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(1);
      const c = result.corrections.find(
        (c) => c.corrected === "\u1F04\u03C1\u03C4\u03BF\u03BD"
      );
      expect(c).toBeDefined();
    });

    it("skips [SCENARIO_COMPLETE] system marker", () => {
      const content = "Great work! [SCENARIO_COMPLETE]";
      const result = parseCorrections(content);
      const marker = result.corrections.find(
        (c) => c.corrected === "SCENARIO_COMPLETE"
      );
      expect(marker).toBeUndefined();
    });

    it("skips single-character bracket content", () => {
      const content = "This [a] is fine.";
      const result = parseCorrections(content);
      const singleChar = result.corrections.find(
        (c) => c.corrected === "a"
      );
      expect(singleChar).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("returns empty corrections for plain text", () => {
      const content = "Hello, how are you today?";
      const result = parseCorrections(content);
      expect(result.corrections).toHaveLength(0);
    });

    it("returns the original content as cleanedContent", () => {
      const content = "Some text (should be X, not Y)";
      const result = parseCorrections(content);
      expect(result.cleanedContent).toBe(content);
    });

    it("handles empty string", () => {
      const result = parseCorrections("");
      expect(result.corrections).toHaveLength(0);
      expect(result.cleanedContent).toBe("");
    });

    it("handles multiple corrections in one message", () => {
      const content =
        "Good! (should be arton, not artos) and also *logon* is better.";
      const result = parseCorrections(content);
      expect(result.corrections.length).toBeGreaterThanOrEqual(2);
    });

    it("corrections are sorted by position", () => {
      const content =
        "*first* some text (should be second, not wrong) and *third*";
      const result = parseCorrections(content);
      for (let i = 1; i < result.corrections.length; i++) {
        expect(result.corrections[i].position).toBeGreaterThanOrEqual(
          result.corrections[i - 1].position
        );
      }
    });

    it("avoids duplicate corrections at nearby positions", () => {
      // A parenthetical that matches both paren pattern AND grammar pattern
      // should not produce two corrections
      const content =
        "(\u1F04\u03C1\u03C4\u03BF\u03BD, not \u1F04\u03C1\u03C4\u03BF\u03C2 -- accusative vs nominative)";
      const result = parseCorrections(content);
      // Should have at least 1 correction but not duplicates at the same position
      const positions = result.corrections.map((c) => c.position);
      const uniquePositions = [...new Set(positions)];
      // Allow a small number of corrections, but no exact duplicates
      expect(positions.length).toBe(uniquePositions.length);
    });
  });
});

describe("hasCorrections", () => {
  it("returns true for 'should be' pattern", () => {
    expect(hasCorrections("(should be X)")).toBe(true);
  });

  it("returns true for 'correction:' pattern", () => {
    expect(hasCorrections("(correction: use X)")).toBe(true);
  });

  it("returns true for arrow pattern", () => {
    expect(hasCorrections("(X \u2192 Y)")).toBe(true);
  });

  it("returns true for asterisk pattern", () => {
    expect(hasCorrections("The correct form is *\u1F04\u03C1\u03C4\u03BF\u03BD*")).toBe(true);
  });

  it("returns true for bracket pattern (non-system marker)", () => {
    expect(hasCorrections("Use [\u1F04\u03C1\u03C4\u03BF\u03BD] here")).toBe(true);
  });

  it("returns false for [SCENARIO_COMPLETE] alone", () => {
    expect(hasCorrections("[SCENARIO_COMPLETE]")).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(hasCorrections("Hello, how are you?")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasCorrections("")).toBe(false);
  });

  it("returns true for grammar explanation with case terms", () => {
    expect(
      hasCorrections(
        "(\u1F04\u03C1\u03C4\u03BF\u03BD is accusative -- \u1F04\u03C1\u03C4\u03BF\u03C5 would be genitive)"
      )
    ).toBe(true);
  });
});
