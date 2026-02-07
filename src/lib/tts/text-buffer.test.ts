import { describe, it, expect } from "vitest";
import { TextBuffer, findLastSentenceBoundary } from "./text-buffer";

describe("TextBuffer", () => {
  // ---------------------------------------------------------------------------
  // Sentence boundary detection
  // ---------------------------------------------------------------------------

  describe("sentence boundary detection", () => {
    it("flushes at period followed by space", () => {
      const buffer = new TextBuffer();
      const result = buffer.add("Hello world. ");
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Hello world.");
    });

    it("flushes at exclamation mark followed by space", () => {
      const buffer = new TextBuffer();
      const result = buffer.add("Great job! More text");
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Great job!");
    });

    it("flushes at question mark followed by space", () => {
      const buffer = new TextBuffer();
      const result = buffer.add("How are you? Fine");
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("How are you?");
    });

    it("flushes at semicolon followed by space", () => {
      const buffer = new TextBuffer();
      const result = buffer.add("First part; second part");
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("First part;");
    });

    it("flushes at Greek ano teleia (U+0387)", () => {
      const buffer = new TextBuffer();
      // Greek text + ano teleia + space + more text
      const result = buffer.add(
        "\u03BA\u03B1\u03BB\u03B7\u03BC\u03AD\u03C1\u03B1\u0387 \u03C0\u03CE\u03C2"
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("\u0387");
    });

    it("does not flush mid-sentence", () => {
      const buffer = new TextBuffer();
      const result = buffer.add("Hello world");
      expect(result).toHaveLength(0);
    });

    it("accumulates multiple chunks until boundary", () => {
      const buffer = new TextBuffer();
      expect(buffer.add("Hello ")).toHaveLength(0);
      expect(buffer.add("world")).toHaveLength(0);
      const result = buffer.add(". Next");
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Hello world.");
    });

    it("handles multiple sentences in one chunk", () => {
      const buffer = new TextBuffer();
      const result = buffer.add("First sentence. Second sentence. Trailing");
      // Should flush everything up to the last boundary
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("First sentence. Second sentence.");
    });
  });

  // ---------------------------------------------------------------------------
  // Text chunk arrives mid-word: buffer until word/sentence boundary
  // ---------------------------------------------------------------------------

  describe("mid-word buffering", () => {
    it("buffers when chunk arrives mid-word", () => {
      const buffer = new TextBuffer();
      expect(buffer.add("Hel")).toHaveLength(0);
      expect(buffer.add("lo")).toHaveLength(0);
      expect(buffer.add(" world")).toHaveLength(0);
      const result = buffer.add(". Next");
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Hello world.");
    });

    it("handles chunk split at punctuation boundary", () => {
      const buffer = new TextBuffer();
      expect(buffer.add("Hello world")).toHaveLength(0);
      const result = buffer.add(". More text");
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Hello world.");
    });
  });

  // ---------------------------------------------------------------------------
  // flush() - remaining text
  // ---------------------------------------------------------------------------

  describe("flush", () => {
    it("returns remaining buffered text", () => {
      const buffer = new TextBuffer();
      buffer.add("Hello world");
      const remaining = buffer.flush();
      expect(remaining).toBe("Hello world");
    });

    it("returns null when buffer is empty", () => {
      const buffer = new TextBuffer();
      expect(buffer.flush()).toBeNull();
    });

    it("returns null after all text has been flushed by sentence boundary", () => {
      const buffer = new TextBuffer();
      // Add text with a boundary - the sentence is extracted
      const extracted = buffer.add("Hello world. ");
      expect(extracted).toHaveLength(1);
      // After extraction, remaining buffer should be empty (only whitespace left)
      expect(buffer.flush()).toBeNull();
    });

    it("returns trailing text after sentence boundary flush", () => {
      const buffer = new TextBuffer();
      // Add text that has a sentence and trailing text
      const extracted = buffer.add("Hello world. More text here");
      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBe("Hello world.");
      // Trailing text remains
      const remaining = buffer.flush();
      expect(remaining).toBe("More text here");
    });
  });

  // ---------------------------------------------------------------------------
  // Force flush on max buffer length
  // ---------------------------------------------------------------------------

  describe("max buffer length", () => {
    it("force-flushes when buffer exceeds max length", () => {
      const buffer = new TextBuffer({ maxBufferLength: 20 });
      const longText = "This is a very long text without any punctuation at all";
      const result = buffer.add(longText);
      // Should force-flush since it exceeds 20 chars
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].length).toBeGreaterThan(0);
    });

    it("breaks at word boundary when force-flushing", () => {
      const buffer = new TextBuffer({ maxBufferLength: 20, minFlushLength: 3 });
      const result = buffer.add("Hello world this is long");
      expect(result.length).toBeGreaterThan(0);
      // Should not split mid-word - each chunk should be clean
      for (const chunk of result) {
        expect(chunk.trim()).toBe(chunk); // No leading/trailing whitespace
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Minimum flush length
  // ---------------------------------------------------------------------------

  describe("minimum flush length", () => {
    it("does not flush very short sentences when minFlushLength is high", () => {
      const buffer = new TextBuffer({ minFlushLength: 10 });
      // "Hi." is only 3 chars -- below min of 10
      const result = buffer.add("Hi. ");
      expect(result).toHaveLength(0);
      // Buffer keeps it for the next sentence
      expect(buffer.peek()).toContain("Hi.");
    });

    it("flushes when accumulated text meets min length", () => {
      const buffer = new TextBuffer({ minFlushLength: 10 });
      buffer.add("Hi. ");
      const result = buffer.add("Hello world. Next");
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("Hello world.");
    });

    it("flushes short sentences with default minFlushLength", () => {
      const buffer = new TextBuffer(); // default minFlushLength = 3
      const result = buffer.add("Hi. Next");
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Hi.");
    });
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  describe("reset", () => {
    it("clears buffered text", () => {
      const buffer = new TextBuffer();
      buffer.add("Hello world");
      buffer.reset();
      expect(buffer.peek()).toBe("");
      expect(buffer.flush()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // peek
  // ---------------------------------------------------------------------------

  describe("peek", () => {
    it("returns current buffer without modifying it", () => {
      const buffer = new TextBuffer();
      buffer.add("Hello");
      expect(buffer.peek()).toBe("Hello");
      expect(buffer.peek()).toBe("Hello"); // Still there
    });
  });
});

// ---------------------------------------------------------------------------
// findLastSentenceBoundary
// ---------------------------------------------------------------------------

describe("findLastSentenceBoundary", () => {
  it("returns -1 for text with no sentence boundary", () => {
    expect(findLastSentenceBoundary("Hello world")).toBe(-1);
  });

  it("returns position after period + space", () => {
    const text = "Hello. World";
    const pos = findLastSentenceBoundary(text);
    expect(pos).toBe(7); // After "Hello. "
  });

  it("returns position after last boundary in multi-sentence text", () => {
    const text = "First. Second. Third";
    const pos = findLastSentenceBoundary(text);
    expect(pos).toBe(15); // After "Second. "
  });

  it("handles question marks", () => {
    const text = "What? How";
    const pos = findLastSentenceBoundary(text);
    expect(pos).toBe(6); // After "What? "
  });

  it("handles exclamation marks", () => {
    const text = "Wow! Great";
    const pos = findLastSentenceBoundary(text);
    expect(pos).toBe(5); // After "Wow! "
  });

  it("handles semicolons", () => {
    const text = "Part one; part two";
    const pos = findLastSentenceBoundary(text);
    expect(pos).toBe(10); // After "Part one; "
  });
});
