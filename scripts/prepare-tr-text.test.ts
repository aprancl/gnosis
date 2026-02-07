import { describe, it, expect, vi } from "vitest";
import {
  normalizeGreekText,
  detectEncodingIssues,
  parseTRText,
  validateCompleteness,
  BOOK_ABBREV_TO_NAME,
  NT_BOOKS,
  EXPECTED_VERSE_COUNTS,
} from "./prepare-tr-text";
import type { TRVerse } from "./prepare-tr-text";

// ---------------------------------------------------------------------------
// Sample data mimicking the real TR source format
// ---------------------------------------------------------------------------

const SAMPLE_TR_TEXT = `id@bookChapterNumber@shortDescription@text
1@b40c001@MAT.1.1@\u0392\u03af\u03b2\u03bb\u03bf\u03c2 \u03b3\u03b5\u03bd\u03ad\u03c3\u03b5\u03c9\u03c2 \u1f38\u03b7\u03c3\u03bf\u1fe6 \u03a7\u03c1\u03b9\u03c3\u03c4\u03bf\u1fe6, \u03c5\u1f31\u03bf\u1fe6 \u0394\u03b1\u03b2\u1f76\u03b4, \u03c5\u1f31\u03bf\u1fe6 \u1f08\u03b2\u03c1\u03b1\u03ac\u03bc.
2@b40c001@MAT.1.2@\u1f08\u03b2\u03c1\u03b1\u1f70\u03bc \u1f10\u03b3\u03ad\u03bd\u03bd\u03b7\u03c3\u03b5 \u03c4\u1f78\u03bd \u1f38\u03c3\u03b1\u03ac\u03ba\u00b7
3@b41c001@MRK.1.1@\u1f08\u03c1\u03c7\u1f74 \u03c4\u03bf\u1fe6 \u03b5\u1f50\u03b1\u03b3\u03b3\u03b5\u03bb\u03af\u03bf\u03c5 \u1f38\u03b7\u03c3\u03bf\u1fe6 \u03a7\u03c1\u03b9\u03c3\u03c4\u03bf\u1fe6, \u03c5\u1f31\u03bf\u1fe6 \u03c4\u03bf\u1fe6 \u0398\u03b5\u03bf\u1fe6.
4@b66c022@REV.22.21@\u1f29 \u03c7\u03ac\u03c1\u03b9\u03c2 \u03c4\u03bf\u1fe6 \u039a\u03c5\u03c1\u03af\u03bf\u03c5 \u03b7\u03bc\u1ff6\u03bd \u1f38\u03b7\u03c3\u03bf\u1fe6 \u03a7\u03c1\u03b9\u03c3\u03c4\u03bf\u1fe6 \u03bc\u03b5\u03c4\u1f70 \u03c0\u03ac\u03bd\u03c4\u03c9\u03bd \u1f51\u03bc\u1ff6\u03bd. \u1f00\u03bc\u03ae\u03bd.`;

// A more realistic multi-line sample for structure tests
const FULL_SAMPLE_HEADER = "id@bookChapterNumber@shortDescription@text";

function makeLine(
  id: number,
  book: string,
  chapter: number,
  verse: number,
  text: string,
): string {
  const bookCode = `b${Object.keys(BOOK_ABBREV_TO_NAME).indexOf(book) + 40}c${String(chapter).padStart(3, "0")}`;
  return `${id}@${bookCode}@${book}.${chapter}.${verse}@${text}`;
}

// ---------------------------------------------------------------------------
// Unit: Text normalization
// ---------------------------------------------------------------------------

describe("normalizeGreekText", () => {
  it("applies NFC normalization", () => {
    // NFD form: alpha + combining acute (U+0301)
    const nfd = "\u03B1\u0301";
    const result = normalizeGreekText(nfd);
    // After NFC, should be a single composed character
    expect(result).toBe(result.normalize("NFC"));
    expect(result.length).toBeLessThanOrEqual(nfd.length);
  });

  it("strips square brackets (apparatus markers)", () => {
    const text = "\u039A\u03B1\u1F76 [\u03B5\u1F36\u03C0\u03B5\u03BD]";
    const result = normalizeGreekText(text);
    expect(result).not.toContain("[");
    expect(result).not.toContain("]");
  });

  it("strips angle brackets and curly braces", () => {
    const text = "<\u03BB\u03CC\u03B3\u03BF\u03C2> {\u03C4\u03B5\u03C3\u03C4}";
    const result = normalizeGreekText(text);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain("{");
    expect(result).not.toContain("}");
  });

  it("strips dagger characters", () => {
    const text = "\u2020\u03BB\u03CC\u03B3\u03BF\u03C2\u2021";
    const result = normalizeGreekText(text);
    expect(result).not.toContain("\u2020");
    expect(result).not.toContain("\u2021");
  });

  it("collapses multiple spaces into one", () => {
    const text =
      "\u0392\u03AF\u03B2\u03BB\u03BF\u03C2   \u03B3\u03B5\u03BD\u03AD\u03C3\u03B5\u03C9\u03C2";
    const result = normalizeGreekText(text);
    expect(result).not.toContain("  ");
  });

  it("trims leading and trailing whitespace", () => {
    const text =
      "  \u0392\u03AF\u03B2\u03BB\u03BF\u03C2 \u03B3\u03B5\u03BD\u03AD\u03C3\u03B5\u03C9\u03C2  ";
    const result = normalizeGreekText(text);
    expect(result).toBe(
      "\u0392\u03AF\u03B2\u03BB\u03BF\u03C2 \u03B3\u03B5\u03BD\u03AD\u03C3\u03B5\u03C9\u03C2",
    );
  });

  it("preserves valid Greek punctuation", () => {
    const text =
      "\u03BB\u03CC\u03B3\u03BF\u03C2, \u03BA\u03B1\u1F76 \u03BB\u03CC\u03B3\u03BF\u03C2\u00B7 \u03BB\u03CC\u03B3\u03BF\u03C2.";
    const result = normalizeGreekText(text);
    expect(result).toContain(",");
    expect(result).toContain("\u00B7"); // middle dot / ano teleia
    expect(result).toContain(".");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeGreekText("")).toBe("");
    expect(normalizeGreekText("   ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Unit: Encoding issue detection
// ---------------------------------------------------------------------------

describe("detectEncodingIssues", () => {
  it("returns empty array for clean Greek text", () => {
    const text =
      "\u0392\u03AF\u03B2\u03BB\u03BF\u03C2 \u03B3\u03B5\u03BD\u03AD\u03C3\u03B5\u03C9\u03C2";
    expect(detectEncodingIssues(text)).toEqual([]);
  });

  it("detects Unicode replacement character", () => {
    const text = "\u0392\u03AF\u03B2\uFFFD\u03BB\u03BF\u03C2";
    const issues = detectEncodingIssues(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("U+FFFD");
  });

  it("detects null bytes", () => {
    const text = "\u0392\u03AF\u03B2\0\u03BB\u03BF\u03C2";
    const issues = detectEncodingIssues(text);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("null byte");
  });
});

// ---------------------------------------------------------------------------
// Unit: Parsing
// ---------------------------------------------------------------------------

describe("parseTRText", () => {
  it("parses sample TR text into verse objects", () => {
    const { verses, warnings } = parseTRText(SAMPLE_TR_TEXT);

    expect(verses.length).toBe(4);
    expect(verses[0].book).toBe("Matthew");
    expect(verses[0].chapter).toBe(1);
    expect(verses[0].verse).toBe(1);
    expect(verses[0].text).toContain("\u0392\u03AF\u03B2\u03BB\u03BF\u03C2");
  });

  it("skips the header line", () => {
    const { verses } = parseTRText(SAMPLE_TR_TEXT);
    // Should not have a verse with "id" as book
    expect(verses.every((v) => v.book !== "id")).toBe(true);
  });

  it("normalizes text via NFC", () => {
    const { verses } = parseTRText(SAMPLE_TR_TEXT);
    for (const v of verses) {
      expect(v.text).toBe(v.text.normalize("NFC"));
    }
  });

  it("warns on lines with fewer than 4 fields", () => {
    const badData = `${FULL_SAMPLE_HEADER}
1@b40c001@MAT.1.1`;
    const { warnings } = parseTRText(badData);
    expect(warnings.some((w) => w.includes("fewer than 4 fields"))).toBe(true);
  });

  it("warns on unknown book abbreviations", () => {
    const badData = `${FULL_SAMPLE_HEADER}
1@b99c001@ZZZ.1.1@some text`;
    const { warnings } = parseTRText(badData);
    expect(warnings.some((w) => w.includes("Unknown book"))).toBe(true);
  });

  it("handles text containing @ characters", () => {
    const data = `${FULL_SAMPLE_HEADER}
1@b40c001@MAT.1.1@\u03BB\u03CC\u03B3\u03BF\u03C2@\u03C4\u03B5\u03C3\u03C4`;
    const { verses } = parseTRText(data);
    expect(verses[0].text).toContain("@");
  });
});

// ---------------------------------------------------------------------------
// Unit: Validation
// ---------------------------------------------------------------------------

describe("validateCompleteness", () => {
  it("identifies missing books", () => {
    const verses: TRVerse[] = [
      { book: "Matthew", chapter: 1, verse: 1, text: "test" },
    ];
    const { missingBooks } = validateCompleteness(verses);
    expect(missingBooks).toContain("Mark");
    expect(missingBooks).toContain("Revelation");
    expect(missingBooks).not.toContain("Matthew");
  });

  it("counts verses per book", () => {
    const verses: TRVerse[] = [
      { book: "Matthew", chapter: 1, verse: 1, text: "a" },
      { book: "Matthew", chapter: 1, verse: 2, text: "b" },
      { book: "Mark", chapter: 1, verse: 1, text: "c" },
    ];
    const { bookCounts } = validateCompleteness(verses);
    expect(bookCounts["Matthew"]).toBe(2);
    expect(bookCounts["Mark"]).toBe(1);
  });

  it("returns correct total", () => {
    const verses: TRVerse[] = [
      { book: "Matthew", chapter: 1, verse: 1, text: "a" },
      { book: "Mark", chapter: 1, verse: 1, text: "b" },
    ];
    const { totalVerses } = validateCompleteness(verses);
    expect(totalVerses).toBe(2);
  });

  it("returns no missing books when all 27 are present", () => {
    const verses: TRVerse[] = NT_BOOKS.map((book) => ({
      book,
      chapter: 1,
      verse: 1,
      text: "test",
    }));
    const { missingBooks } = validateCompleteness(verses);
    expect(missingBooks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit: Book mapping constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("has exactly 27 NT book abbreviation mappings", () => {
    expect(Object.keys(BOOK_ABBREV_TO_NAME).length).toBe(27);
  });

  it("NT_BOOKS contains all 27 books", () => {
    expect(NT_BOOKS.length).toBe(27);
  });

  it("EXPECTED_VERSE_COUNTS has entries for all 27 books", () => {
    expect(Object.keys(EXPECTED_VERSE_COUNTS).length).toBe(27);
    for (const book of NT_BOOKS) {
      expect(EXPECTED_VERSE_COUNTS[book]).toBeDefined();
      expect(EXPECTED_VERSE_COUNTS[book]).toBeGreaterThan(0);
    }
  });

  it("expected total NT verse count is approximately 7957", () => {
    const total = Object.values(EXPECTED_VERSE_COUNTS).reduce(
      (sum, n) => sum + n,
      0,
    );
    // The TR (Scrivener 1894 source) has 7957 verses
    expect(total).toBe(7957);
  });
});

// ---------------------------------------------------------------------------
// Integration: Verse count validation against expected totals
// ---------------------------------------------------------------------------

describe("verse count validation (sample books)", () => {
  it("Matthew expected count is 1071", () => {
    expect(EXPECTED_VERSE_COUNTS["Matthew"]).toBe(1071);
  });

  it("Mark expected count is 678", () => {
    expect(EXPECTED_VERSE_COUNTS["Mark"]).toBe(678);
  });

  it("Revelation expected count is 404", () => {
    expect(EXPECTED_VERSE_COUNTS["Revelation"]).toBe(404);
  });

  it("Philemon expected count is 25", () => {
    expect(EXPECTED_VERSE_COUNTS["Philemon"]).toBe(25);
  });
});
